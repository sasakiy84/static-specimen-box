import './style.css';

const byId = id => document.getElementById(id);
const form = byId('options');
const input = byId('file');
const drop = byId('drop');
const progressPanel = byId('progress-panel');
const progressBar = byId('progress');
const status = byId('status');
const details = byId('details');
const results = byId('results');
const alert = byId('error');
const actions = byId('downloads');
const downloadStatus = byId('download-status');
const titleField = byId('file-name');
const assets = new URL('./', document.baseURI);
let active;
let preview;
let converted;
const downloadUrls = new Set();

function setProgress(message, detail = '', value, total) {
  status.textContent = message;
  details.textContent = detail;
  if (total) {
    progressBar.max = total;
    progressBar.value = value;
  } else progressBar.removeAttribute('value');
}

function discardDownloads() {
  converted = undefined;
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.clear();
  results.hidden = true;
  downloadStatus.hidden = true;
  actions.removeAttribute('aria-busy');
  for (const button of actions.children) button.removeAttribute('aria-disabled');
}

function saveDownload(name, data, type) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type }));
  downloadUrls.add(url);
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    if (downloadUrls.delete(url)) URL.revokeObjectURL(url);
  }, 60_000);
}

async function download(format) {
  const book = converted;
  if (!book || book.exporting) return;
  const { title, basename, pages } = book;
  book.exporting = true;
  actions.setAttribute('aria-busy', 'true');
  for (const button of actions.children) button.setAttribute('aria-disabled', 'true');
  downloadStatus.textContent = 'ファイルを準備しています…';
  downloadStatus.hidden = false;
  try {
    const { createEpub, createMarkdown } = await import('./exports.js');
    if (converted !== book) return;
    let name, data, type;
    if (format === 'epub') {
      const rawText = pages.flatMap(page => page.blocks.flatMap(block => block.lines ?? []))
        .map(line => line.inline.map(part => part.text).join('')).join('');
      const language = !rawText || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(rawText) ? 'ja' : 'en';
      const vertical = pages.filter(page => page.vertical).length > pages.length / 2;
      data = await createEpub(title, pages, language, vertical);
      name = basename + '.epub';
      type = 'application/epub+zip';
    } else {
      const includeImages = format === 'markdown-images';
      data = await createMarkdown(title, pages, { includeImages });
      name = basename + (includeImages ? '-markdown.zip' : '.md');
      type = includeImages ? 'application/zip' : 'text/markdown;charset=utf-8';
    }
    if (converted !== book) return;
    saveDownload(name, data, type);
    downloadStatus.hidden = true;
  } catch {
    if (converted === book) downloadStatus.textContent = 'ファイルを書き出せませんでした。もう一度お試しください。';
  } finally {
    if (converted === book) {
      book.exporting = false;
      actions.removeAttribute('aria-busy');
      for (const button of actions.children) button.removeAttribute('aria-disabled');
    }
  }
}

function processImage(worker, image, layer, { includeRuby, signal, page, index, total }) {
  return new Promise((resolve, reject) => {
    const clean = () => {
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => { clean(); reject(signal.reason); };
    const fail = () => { clean(); reject(new Error('OCRを実行できませんでした。ページを再読み込みしてください。')); };
    const receive = ({ data }) => {
      if (data.progress) {
        const { bytes, loaded } = data.progress;
        const label = loaded === bytes ? 'OCRモデルを準備しています…' : 'OCRモデルを読み込んでいます…';
        setProgress(label, `${page}ページ目 · ${Math.round(loaded / 1e6)} / ${Math.ceil(bytes / 1e6)} MB`, loaded, bytes);
      } else {
        clean();
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      }
    };
    if (signal.aborted) {
      image.close();
      reject(signal.reason);
      return;
    }
    worker.addEventListener('message', receive);
    worker.addEventListener('error', fail);
    signal.addEventListener('abort', cancel, { once: true });
    setProgress(`${page}ページ目を読み取っています…`, `${index + 1} / ${total} ページ`, index, total);
    worker.postMessage({ image, layer, includeRuby, assets: assets.href }, [image]);
  });
}

async function convert(file) {
  if (active) return;
  discardDownloads();
  alert.hidden = true;
  if (!file || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    alert.textContent = 'PDFファイルを1件選んでください。';
    alert.hidden = false;
    return;
  }
  const controller = new AbortController();
  const { signal } = controller;
  active = controller;
  const settings = new FormData(form);
  const preferPdfText = settings.has('prefer-pdf-text');
  const includeRuby = settings.has('include-ruby');
  byId('choose').disabled = true;
  byId('settings').disabled = true;
  titleField.textContent = file.name;
  progressPanel.hidden = false;
  setProgress('PDFを読み込んでいます…');
  let pdfTask, worker, pendingPage;
  let previewOwnsPdf = false;
  try {
    const previousPreview = preview;
    preview = undefined;
    await previousPreview?.destroy().catch(() => {});
    if (!globalThis.OffscreenCanvas || !globalThis.Worker || !globalThis.crypto?.subtle) {
      throw new Error('お使いのブラウザでは端末内OCRを実行できません。');
    }
    const [{ openPdf, pageNumbers, renderPage }, { PdfPreview }] = await Promise.all([
      import('./pdf.js'), import('./preview.js'),
    ]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    pdfTask = openPdf(bytes, assets);
    const abortPdf = () => { if (!previewOwnsPdf) void pdfTask.destroy().catch(() => {}); };
    signal.addEventListener('abort', abortPdf, { once: true });
    signal.throwIfAborted();
    const pdf = await pdfTask.promise;
    signal.throwIfAborted();
    const numbers = pageNumbers(String(settings.get('pages') ?? ''), pdf.numPages);
    preview = new PdfPreview(byId('pdf-preview'), { pdf, pdfTask, filename: file.name, numbers });
    previewOwnsPdf = true;
    const metadata = await pdf.getMetadata().catch(() => null);
    const basename = file.name.replace(/\.pdf$/i, '') || 'document';
    const title = metadata?.info?.Title?.trim() || basename;
    worker = new Worker(new URL('./ocr-worker.js', import.meta.url), { type: 'module' });
    // 画面の進捗はOCR中のページを示し、裏で最大1ページだけ先に描画する。
    const preparePage = number => pdf.getPage(number).then(page => {
      signal.throwIfAborted();
      return renderPage(page, signal, preferPdfText);
    }).then(result => ({ result }), error => ({ error }));
    const pages = [];
    pendingPage = preparePage(numbers[0]);
    for (const [index, number] of numbers.entries()) {
      signal.throwIfAborted();
      setProgress(`${number}ページ目を描画しています…`, `${index + 1} / ${numbers.length} ページ`, index, numbers.length);
      const prepared = await pendingPage;
      pendingPage = undefined;
      if (!prepared.result) throw prepared.error;
      const { image, layer } = prepared.result;
      const ocr = processImage(worker, image, layer, {
        includeRuby, signal, page: number, index, total: numbers.length,
      });
      if (index + 1 < numbers.length && !signal.aborted) pendingPage = preparePage(numbers[index + 1]);
      const { preview: layout, ...page } = await ocr;
      preview.addPage(number, layout);
      pages.push({ number, ...page });
    }
    worker.terminate();
    if (!pages.some(page => page.blocks.length)) throw new Error('選んだページから文字や図表を読み取れませんでした。');
    signal.throwIfAborted();
    converted = { title, basename, pages, exporting: false };
    const fallback = pages.reduce((sum, page) => sum + page.tableFallbacks, 0);
    byId('result-details').textContent = `${numbers.length}ページを変換しました。` +
      (fallback ? ` 構造化できなかった表 ${fallback} 件は画像付きの形式で保存できます。` : '');
    results.hidden = false;
    actions.firstElementChild?.focus();
  } catch (error) {
    if (!signal.aborted) {
      const messages = {
        PasswordException: 'パスワード保護されたPDFは、保護を解除してから選んでください。',
        InvalidPDFException: 'PDFを開けませんでした。ファイルを確認してください。',
      };
      alert.textContent = messages[error.name] ?? (error.message || 'PDFを変換できませんでした。');
      alert.hidden = false;
    }
  } finally {
    worker?.terminate();
    if (!previewOwnsPdf) await pdfTask?.destroy().catch(() => {});
    const unusedPage = await pendingPage;
    unusedPage?.result?.image.close();
    preview?.finish();
    progressPanel.hidden = true;
    active = undefined;
    byId('choose').disabled = false;
    byId('settings').disabled = false;
  }
}

actions.addEventListener('click', event => {
  const format = event.target.closest('button')?.dataset.format;
  if (format) void download(format);
});
byId('choose').addEventListener('click', () => input.click());
byId('cancel').addEventListener('click', () => {
  active?.abort();
  setProgress('中止しています…');
});
input.addEventListener('change', () => {
  const [file] = input.files;
  input.value = '';
  if (file) void convert(file);
});
form.addEventListener('submit', event => event.preventDefault());

document.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = active ? 'none' : 'copy';
});
drop.addEventListener('dragenter', () => { if (!active) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', event => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging');
});
document.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  drop.classList.remove('dragging');
  if (active) return;
  if (event.dataTransfer.files.length !== 1) {
    discardDownloads();
    alert.textContent = 'PDFファイルを1件選んでください。';
    alert.hidden = false;
    return;
  }
  void convert(event.dataTransfer.files[0]);
});
