import './style.css';
import { dimensionsFor, formats } from './formats.js';

const byId = (id) => document.getElementById(id);
const fileInput = byId('file');
const dropzone = byId('dropzone');
const editor = byId('editor');
const error = byId('error');
const status = byId('status');
const formatSelect = byId('format');
const webpMode = byId('webp-mode');
const quality = byId('quality');
const pngLevel = byId('png-level');
const resize = byId('resize');
const percent = byId('percent');
const edge = byId('edge');
const originalImage = byId('original-image');
const compressedImage = byId('compressed-image');
const previewState = byId('preview-state');
const save = byId('save');

const number = new Intl.NumberFormat('ja-JP');
const percentage = new Intl.NumberFormat('ja-JP', { style: 'percent', maximumSignificantDigits: 3 });
const bytes = (size) => `${number.format(size)} バイト`;
const dimensions = ({ width, height }) => `${number.format(width)} × ${number.format(height)} px`;
const summary = (image) => `${formats[image.format].label} · ${dimensions(image)}`;

let worker;
let original;
let originalUrl;
let result;
let revision = 0;
let busy = false;
let pending;
let timer;
let dragDepth = 0;

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

function clearResult(message) {
  if (result) URL.revokeObjectURL(result.url);
  result = undefined;
  compressedImage.hidden = true;
  compressedImage.removeAttribute('src');
  previewState.textContent = message;
  previewState.hidden = false;
  byId('estimated-bytes').textContent = '—';
  byId('size-change').textContent = '—';
  save.disabled = true;
}

function showResult({ buffer, settings }) {
  const format = formats[settings.format];
  const blob = new Blob([buffer], { type: format.mime });
  const url = URL.createObjectURL(blob);
  result = { blob, url, name: `${original.file.name.replace(/\.[^.]+$/, '') || 'image'}_compressed.${format.extension}` };
  compressedImage.src = url;
  compressedImage.hidden = false;
  previewState.hidden = true;
  byId('estimated-bytes').textContent = bytes(blob.size);
  const difference = blob.size - original.file.size;
  byId('size-change').textContent = difference === 0
    ? '変化なし'
    : `${percentage.format(Math.abs(difference) / original.file.size)} ${difference < 0 ? '削減' : '増加'}`;
  save.disabled = false;
  status.textContent = '圧縮した画像を保存できます。';
}

function nextEncode() {
  if (!worker || busy || !pending) return;
  const request = pending;
  pending = undefined;
  busy = true;
  worker.postMessage({ type: 'encode', ...request });
}

function readSettings() {
  const format = formatSelect.value === 'original' ? original.format : formatSelect.value;
  const lossless = format === 'webp' && webpMode.value === 'lossless';
  byId('webp-settings').hidden = format !== 'webp';
  byId('quality-settings').hidden = format === 'png' || lossless;
  byId('png-settings').hidden = format !== 'png';
  byId('quality-value').value = `${quality.value} / 100`;
  byId('format-note').textContent = lossless || format === 'png'
    ? '可逆圧縮で、縮小後の画素を保ちます。'
    : format === 'jpeg'
      ? '画質を下げると容量を抑えられます。透過部分は白になります。'
      : '画質を下げると容量を抑えられます。';

  byId('percent-settings').hidden = resize.value !== 'percent';
  byId('edge-settings').hidden = resize.value !== 'edge';
  byId('percent-value').value = `${percent.value}%`;
  const edgeLength = edge.valueAsNumber;
  if (resize.value === 'edge' && !edge.validity.valid) {
    byId('resize-note').textContent = '長辺には 1 以上の整数を入力してください。';
    return null;
  }

  const size = dimensionsFor(original, resize.value, percent.valueAsNumber, edgeLength);
  byId('resize-note').textContent = resize.value === 'keep'
    ? '元の画像と同じピクセル数で保存します。'
    : `${dimensions(size)} に縮小します。`;
  if (resize.value !== 'keep' && size.width === original.width && size.height === original.height) {
    byId('resize-note').textContent = `元のサイズ ${dimensions(size)} で保存します。`;
  }
  return { ...size, format, lossless, quality: quality.valueAsNumber, level: Number(pngLevel.value) };
}

function scheduleEncode(delay = 220) {
  if (!original || !worker) return;
  clearTimeout(timer);
  pending = undefined;
  const id = ++revision;
  const settings = readSettings();
  showError();
  byId('compressed-info').textContent = settings ? summary(settings) : '';
  clearResult(settings ? '圧縮結果を準備しています…' : '縮小設定を確認してください。');
  status.textContent = '';
  if (!settings) return;
  timer = setTimeout(() => {
    pending = { id, settings };
    nextEncode();
  }, delay);
}

function handleWorkerMessage(data, file) {
  if (data.type === 'open') {
    original = { file, ...data.image };
    originalUrl = URL.createObjectURL(file.slice(0, file.size, formats[original.format].mime));
    originalImage.src = originalUrl;
    byId('file-name').textContent = file.name;
    byId('original-info').textContent = summary(original);
    byId('original-bytes').textContent = bytes(file.size);
    editor.hidden = false;
    scheduleEncode(0);
    return;
  }
  if (data.type === 'error' && data.operation === 'open') {
    status.textContent = '';
    showError(data.message);
    return;
  }

  busy = false;
  if (data.id === revision) {
    if (data.type === 'encoded') {
      showResult(data);
    } else {
      status.textContent = '';
      clearResult('圧縮結果を表示できませんでした。');
      showError(data.message);
    }
  }
  nextEncode();
}

function openFile(file) {
  if (!file) return;
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  pending = undefined;
  busy = false;
  original = undefined;
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = undefined;
  originalImage.removeAttribute('src');
  editor.hidden = true;
  clearResult('圧縮結果を準備しています…');
  showError();
  status.textContent = '画像を読み込んでいます…';
  try {
    const currentWorker = new Worker(new URL('./encode.worker.js', import.meta.url), { type: 'module' });
    worker = currentWorker;
    currentWorker.onmessage = ({ data }) => {
      if (worker === currentWorker) handleWorkerMessage(data, file);
    };
    currentWorker.onerror = () => {
      if (worker !== currentWorker) return;
      currentWorker.terminate();
      worker = undefined;
      status.textContent = '';
      clearResult('圧縮結果を表示できませんでした。');
      showError('画像処理を開始できませんでした。ページを再読み込みしてお試しください。');
    };
    currentWorker.postMessage({ type: 'open', file });
  } catch {
    status.textContent = '';
    showError('このブラウザでは画像の圧縮を開始できません。');
  }
}

const hasFiles = (event) => event.dataTransfer.types.includes('Files');
dropzone.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', (event) => {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('dragover', (event) => {
  if (hasFiles(event)) event.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragover', (event) => {
  if (hasFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('drag-over');
  if (dropzone.contains(event.target)) openFile(event.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  openFile(fileInput.files[0]);
  fileInput.value = '';
});
for (const input of [formatSelect, webpMode, quality, pngLevel, resize, percent, edge]) {
  input.addEventListener('input', () => scheduleEncode());
}

compressedImage.addEventListener('error', () => {
  if (!result) return;
  compressedImage.hidden = true;
  previewState.textContent = 'このブラウザでは圧縮後の画像をプレビューできません。';
  previewState.hidden = false;
});

save.addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

fileInput.disabled = false;
if (fileInput.files[0]) openFile(fileInput.files[0]);
