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
const titleField = byId('file-name');
const assets = new URL('./', document.baseURI);
let active;
let downloadUrls = [];

function setProgress(message, detail = '', value, total) {
  status.textContent = message;
  details.textContent = detail;
  if (total) {
    progressBar.max = total;
    progressBar.value = value;
  } else progressBar.removeAttribute('value');
}

function discardDownloads() {
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls = [];
  results.hidden = true;
  actions.replaceChildren();
}

function addDownload(name, label, data, type) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type }));
  downloadUrls.push(url);
  link.className = 'button primary';
  link.href = url;
  link.download = name;
  link.textContent = label;
  actions.append(link);
}

function processImage(worker, image, layer, tables, signal, page, index, total) {
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
    worker.postMessage({ image, layer, tables, assets: assets.href }, [image]);
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
  const markdown = settings.get('format') !== 'epub';
  const epub = settings.get('format') !== 'markdown';
  const preferPdfText = settings.has('prefer-pdf-text');
  byId('choose').disabled = true;
  byId('settings').disabled = true;
  titleField.textContent = file.name;
  progressPanel.hidden = false;
  setProgress('PDFを読み込んでいます…');
  let pdfTask, worker;
  try {
    if (!globalThis.OffscreenCanvas || !globalThis.Worker || !globalThis.crypto?.subtle) {
      throw new Error('お使いのブラウザでは端末内OCRを実行できません。');
    }
    const [{ openPdf, pageNumbers, renderPage }, { createEpub, createMarkdown }] = await Promise.all([
      import('./pdf.js'), import('./exports.js'),
    ]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    pdfTask = openPdf(bytes, assets);
    const abortPdf = () => { void pdfTask.destroy().catch(() => {}); };
    signal.addEventListener('abort', abortPdf, { once: true });
    signal.throwIfAborted();
    const pdf = await pdfTask.promise;
    const numbers = pageNumbers(String(settings.get('pages') ?? ''), pdf.numPages);
    const metadata = await pdf.getMetadata().catch(() => null);
    const basename = file.name.replace(/\.pdf$/i, '') || 'document';
    const title = metadata?.info?.Title?.trim() || basename;
    worker = new Worker(new URL('./ocr-worker.js', import.meta.url), { type: 'module' });
    const pages = [];
    for (const [index, number] of numbers.entries()) {
      signal.throwIfAborted();
      setProgress(`${number}ページ目を描画しています…`, `${index + 1} / ${numbers.length} ページ`, index, numbers.length);
      const page = await pdf.getPage(number);
      const { image, layer } = await renderPage(page, signal, preferPdfText);
      pages.push({ number, ...await processImage(worker, image, layer, markdown, signal, number, index, numbers.length) });
    }
    worker.terminate();
    if (!pages.some(page => page.blocks.length)) throw new Error('選んだページから文字や図表を読み取れませんでした。');
    setProgress('ファイルをまとめています…');
    const rawText = pages.flatMap(page => page.blocks.flatMap(block => block.lines ?? []))
      .map(line => line.inline.map(part => part.text).join('')).join('');
    const language = !rawText || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(rawText) ? 'ja' : 'en';
    const vertical = pages.filter(page => page.vertical).length > pages.length / 2;
    const md = markdown ? await createMarkdown(title, pages) : null;
    const book = epub ? await createEpub(title, pages, language, vertical) : null;
    signal.throwIfAborted();
    if (md?.bundle) addDownload(basename + '-markdown.zip', 'Markdown ＋ 画像', md.bundle, 'application/zip');
    else if (md) addDownload(basename + '.md', 'Markdown', md.text, 'text/markdown;charset=utf-8');
    if (book) addDownload(basename + '.epub', 'EPUB', book, 'application/epub+zip');
    const fallback = pages.reduce((sum, page) => sum + page.tableFallbacks, 0);
    byId('result-details').textContent = `${numbers.length}ページを変換しました。` +
      (fallback ? ` 表のうち${fallback}件はMarkdownにも画像で収録しました。` : '');
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
    await pdfTask?.destroy().catch(() => {});
    progressPanel.hidden = true;
    active = undefined;
    byId('choose').disabled = false;
    byId('settings').disabled = false;
  }
}

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
