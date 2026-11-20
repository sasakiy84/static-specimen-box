import './style.css';
import { imageType, renderImage } from './images.js';

const fileInput = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
const pageSection = document.querySelector('#pages');
const pageCount = document.querySelector('#page-count');
const list = document.querySelector('#image-list');
const template = document.querySelector('#image-row');
const saveButton = document.querySelector('#save');
const status = document.querySelector('#status');
const error = document.querySelector('#error');
const preview = document.querySelector('#preview-dialog');
const previewImage = document.querySelector('#preview-image');
const previewTitle = document.querySelector('#preview-title');
const pages = [];
let nextId = 0;
let busy = false;
let fileDragDepth = 0;
let movingId = null;
let dropTarget = null;
let previewUrl = null;

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

function updateControls() {
  fileInput.disabled = busy;
  saveButton.disabled = busy || pages.length === 0;
  for (const [index, row] of [...list.children].entries()) {
    row.draggable = !busy;
    row.querySelector('[data-action="up"]').disabled = busy || index === 0;
    row.querySelector('[data-action="down"]').disabled = busy || index === pages.length - 1;
    row.querySelector('[data-action="remove"]').disabled = busy;
  }
}

function render() {
  pageSection.hidden = pages.length === 0;
  pageCount.textContent = `${pages.length} ページ`;
  const fragment = document.createDocumentFragment();
  for (const [index, item] of pages.entries()) {
    const row = template.content.firstElementChild.cloneNode(true);
    const page = index + 1;
    row.dataset.id = String(item.id);
    row.querySelector('.page-number').textContent = String(page);
    const thumbnail = row.querySelector('.thumbnail');
    thumbnail.setAttribute('aria-label', `ページ ${page} の画像を拡大`);
    thumbnail.querySelector('img').src = item.thumbnail;
    const name = row.querySelector('.file-name');
    name.textContent = item.file.name;
    name.title = item.file.name;
    row.querySelector('.dimensions').textContent = `${item.width} × ${item.height} px`;
    row.querySelector('[data-action="up"]').setAttribute('aria-label', `ページ ${page} を上へ移動`);
    row.querySelector('[data-action="down"]').setAttribute('aria-label', `ページ ${page} を下へ移動`);
    row.querySelector('[data-action="remove"]').setAttribute('aria-label', `ページ ${page} を削除`);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
  updateControls();
}

async function addFiles(files) {
  if (busy || !files.length) return;
  busy = true;
  updateControls();
  showError();
  const rejected = [];
  let count = 0;
  try {
    for (const [index, file] of files.entries()) {
      status.textContent = `画像を読み込み中（${index + 1} / ${files.length}）`;
      const type = imageType(file);
      try {
        if (!type) throw new Error('非対応の形式です。');
        const { blob, width, height } = await renderImage(file, 320);
        pages.push({ id: ++nextId, file, type, width, height, thumbnail: URL.createObjectURL(blob) });
        count++;
      } catch {
        rejected.push(file.name);
      }
    }
  } finally {
    busy = false;
    render();
  }
  status.textContent = count ? `${count}枚を追加しました。` : '';
  if (rejected.length) {
    const names = rejected.slice(0, 3).map(name => `「${name}」`).join('、');
    const remaining = rejected.length > 3 ? `ほか ${rejected.length - 3} 件` : '';
    showError(`${names}${remaining}を読み込めませんでした。JPEG・PNG・WebP・AVIFの画像を選択してください。`);
  }
}

function openSelectedFiles() {
  const selected = Array.from(fileInput.files ?? []);
  fileInput.value = '';
  void addFiles(selected);
}

function rowFrom(target) {
  return target instanceof Element ? target.closest('.image-row') : null;
}

function focusRow(index, action = 'preview') {
  const row = list.children[index];
  const actionButton = row?.querySelector(`[data-action="${action}"]:not(:disabled)`);
  (actionButton ?? row?.querySelector('.thumbnail') ?? fileInput).focus();
}

function movePage(from, to, action) {
  if (busy || from === to || from < 0 || to < 0 || to >= pages.length) return;
  const [item] = pages.splice(from, 1);
  pages.splice(to, 0, item);
  render();
  status.textContent = `ページ ${from + 1} を ${to + 1} 番目に移動しました。`;
  if (action) focusRow(to, action);
}

function openPreview(item) {
  previewUrl = URL.createObjectURL(item.file);
  previewTitle.textContent = item.file.name;
  previewImage.src = previewUrl;
  previewImage.alt = item.file.name;
  preview.showModal();
}

preview.addEventListener('close', () => {
  previewImage.removeAttribute('src');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
});

list.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
  const row = rowFrom(button);
  if (!button || !row) return;
  const index = pages.findIndex(item => item.id === Number(row.dataset.id));
  if (index < 0) return;
  const action = button.dataset.action;
  if (action === 'preview') openPreview(pages[index]);
  else if (action === 'up') movePage(index, index - 1, action);
  else if (action === 'down') movePage(index, index + 1, action);
  else if (action === 'remove' && !busy) {
    const [removed] = pages.splice(index, 1);
    URL.revokeObjectURL(removed.thumbnail);
    render();
    status.textContent = `ページ ${index + 1} を削除しました。`;
    focusRow(Math.min(index, pages.length - 1), 'remove');
  }
});

function containsFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

fileInput.addEventListener('change', openSelectedFiles);
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, event => {
    if (containsFiles(event)) event.preventDefault();
  });
}
dropzone.addEventListener('dragenter', event => {
  if (!containsFiles(event) || busy) return;
  event.preventDefault();
  fileDragDepth++;
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragover', event => {
  if (!containsFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
});
dropzone.addEventListener('dragleave', () => {
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (!fileDragDepth) dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', event => {
  if (!containsFiles(event)) return;
  event.preventDefault();
  fileDragDepth = 0;
  dropzone.classList.remove('drag-over');
  void addFiles(Array.from(event.dataTransfer.files));
});

function clearDropTarget() {
  dropTarget?.classList.remove('drop-before', 'drop-after');
  dropTarget = null;
}

function isBelowMiddle(row, y) {
  const bounds = row.getBoundingClientRect();
  return y >= bounds.top + bounds.height / 2;
}

function finishDrag() {
  movingId = null;
  clearDropTarget();
  list.querySelector('.moving')?.classList.remove('moving');
}

list.addEventListener('dragstart', event => {
  const row = rowFrom(event.target);
  if (!row || busy || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  movingId = Number(row.dataset.id);
  event.dataTransfer.setData('text/plain', row.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
  row.classList.add('moving');
});
list.addEventListener('dragover', event => {
  if (movingId === null || busy || !event.dataTransfer) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const row = rowFrom(event.target);
  clearDropTarget();
  if (row && Number(row.dataset.id) !== movingId) {
    dropTarget = row;
    row.classList.add(isBelowMiddle(row, event.clientY) ? 'drop-after' : 'drop-before');
  }
});
list.addEventListener('dragleave', event => {
  if (!(event.relatedTarget instanceof Node) || !list.contains(event.relatedTarget)) clearDropTarget();
});
list.addEventListener('drop', event => {
  if (movingId === null || busy) return;
  event.preventDefault();
  const row = rowFrom(event.target);
  if (row && Number(row.dataset.id) !== movingId) {
    const from = pages.findIndex(item => item.id === movingId);
    const anchor = pages.findIndex(item => item.id === Number(row.dataset.id));
    const to = anchor + Number(isBelowMiddle(row, event.clientY)) - Number(from < anchor);
    movePage(from, to);
  }
  finishDrag();
});
window.addEventListener('dragend', finishDrag);

saveButton.addEventListener('click', async () => {
  if (busy || !pages.length) return;
  busy = true;
  updateControls();
  showError();
  status.textContent = 'PDFを準備しています…';
  try {
    const { makePdf } = await import('./pdf.js');
    const pdf = await makePdf(pages, page => {
      status.textContent = `PDFを作成中（${page} / ${pages.length}）`;
    });
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'img2pdf.pdf';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = `${pages.length}ページのPDFを作成しました。`;
  } catch (failure) {
    status.textContent = '';
    showError(failure instanceof Error ? failure.message : 'PDFを作成できませんでした。');
  } finally {
    busy = false;
    updateControls();
  }
});

render();
openSelectedFiles();
