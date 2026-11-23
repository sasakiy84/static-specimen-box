import './style.css';
import { boxBetween, clamp } from './geometry.js';

const byId = id => document.getElementById(id);
const fileInput = byId('file-input');
const dropZone = byId('drop-zone');
const workspace = byId('workspace');
const viewport = byId('viewport');
const surface = byId('surface');
const pageCanvas = byId('page-canvas');
const zoom = byId('zoom');
const pageInput = byId('page-number');
const previous = byId('previous-page');
const next = byId('next-page');
const selectMode = byId('select-mode');
const panMode = byId('pan-mode');
const download = byId('download');
const undo = byId('undo');
const maskList = byId('mask-list');
const draft = byId('draft');
const cursor = byId('cursor');

let engine;
let documentPdf;
let page = 1;
let pageSize;
let previewTask;
let previewRevision = 0;
let rendering = false;
let opening = false;
let exporting = false;
let selecting = true;
let gesture;
let keyboardStart;
let keyboardPoint = { x: .5, y: .5 };
let masks = [];
let nextMaskId = 1;

function setMessage(id, message = '') {
  const element = byId(id);
  element.textContent = message;
  element.hidden = !message;
}

function updateControls() {
  const busy = opening || exporting;
  const drafting = gesture?.kind === 'mask' || Boolean(keyboardStart);
  byId('choose-file').disabled = byId('change-file').disabled = busy;
  download.disabled = !documentPdf || !masks.length || busy || rendering || drafting;
  undo.disabled = !masks.length || busy || drafting;
  previous.disabled = busy || page <= 1;
  next.disabled = busy || !documentPdf || page >= documentPdf.numPages;
  pageInput.disabled = zoom.disabled = selectMode.disabled = panMode.disabled = busy;
  for (const button of maskList.querySelectorAll('button')) button.disabled = busy;
  surface.toggleAttribute('data-selecting', selecting && !busy);
  surface.tabIndex = busy ? -1 : 0;
}

function sizeSurface() {
  if (!pageSize) return;
  const fit = Math.min(
    Math.max(1, viewport.clientWidth - 32) / pageSize.width,
    Math.max(1, viewport.clientHeight - 32) / pageSize.height,
  );
  const scale = fit * Number(zoom.value);
  surface.style.width = `${pageSize.width * scale}px`;
  surface.style.height = `${pageSize.height * scale}px`;
}

function positionBox(element, box) {
  element.style.left = `${box.left * 100}%`;
  element.style.top = `${box.top * 100}%`;
  element.style.width = `${(box.right - box.left) * 100}%`;
  element.style.height = `${(box.bottom - box.top) * 100}%`;
}

function drawMasks() {
  byId('masks').replaceChildren(...masks.filter(mask => mask.page === page).map(({ box }) => {
    const element = document.createElement('span');
    element.className = 'mask';
    positionBox(element, box);
    return element;
  }));
}

function drawMaskList() {
  byId('mask-count').textContent = `${masks.length} 件`;
  maskList.replaceChildren(...masks.map(mask => {
    const row = document.createElement('li');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'mask-page';
    go.textContent = `${mask.page} ページ目 · 範囲 ${mask.id}`;
    go.addEventListener('click', () => { if (mask.page !== page) void showPage(mask.page); });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button small';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `範囲 ${mask.id} を削除`);
    remove.addEventListener('click', () => {
      removeMask(mask.id);
      (maskList.querySelector('.mask-page') || surface).focus();
    });
    row.append(go, remove);
    return row;
  }));
  updateControls();
}

function removeMask(id) {
  masks = masks.filter(mask => mask.id !== id);
  drawMasks();
  drawMaskList();
  setMessage('status');
}

function clearDraft() {
  const captured = gesture?.pointer;
  gesture = undefined;
  if (captured != null && surface.hasPointerCapture(captured)) surface.releasePointerCapture(captured);
  surface.removeAttribute('data-panning');
  keyboardStart = undefined;
  draft.hidden = cursor.hidden = true;
}

function showDraft(start, end) {
  positionBox(draft, boxBetween(start, end));
  draft.hidden = false;
}

function saveMask(start, end) {
  const box = boxBetween(start, end);
  const bounds = surface.getBoundingClientRect();
  if ((box.right - box.left) * bounds.width < 2 || (box.bottom - box.top) * bounds.height < 2) {
    setMessage('status', '黒塗り範囲を広げるか、表示を拡大して選び直してください。');
  } else {
    const id = nextMaskId++;
    masks.push({ page, id, box });
    drawMasks();
    drawMaskList();
    setMessage('status');
  }
  updateControls();
}

async function showPage(number) {
  if (!documentPdf || exporting) return;
  const revision = ++previewRevision;
  const previousTask = previewTask;
  previousTask?.cancel();
  const pdf = documentPdf;
  page = number;
  pageInput.value = String(page);
  pageSize = undefined;
  keyboardPoint = { x: .5, y: .5 };
  clearDraft();
  const hadFocus = document.activeElement === surface;
  surface.hidden = true;
  rendering = true;
  updateControls();
  setMessage('error');
  setMessage('status', `${page} ページ目を読み込んでいます…`);
  try {
    if (previousTask) await previousTask.promise.catch(() => {});
    if (revision !== previewRevision) return;
    const requested = await pdf.getPage(number);
    if (revision !== previewRevision) return;
    const { task, width, height } = engine.renderPage(requested, pageCanvas, 2);
    previewTask = task;
    await task.promise;
    if (revision !== previewRevision) return;
    pageSize = { width, height };
    surface.setAttribute('aria-label', `PDF プレビュー ${page} ページ目`);
    surface.hidden = false;
    sizeSurface();
    viewport.scrollTo(0, 0);
    drawMasks();
    if (hadFocus) surface.focus({ preventScroll: true });
    setMessage('status');
  } catch {
    if (revision !== previewRevision) return;
    setMessage('error', `${number} ページ目のプレビューを表示できませんでした。`);
    setMessage('status');
  } finally {
    if (revision === previewRevision) {
      previewTask = undefined;
      rendering = false;
      updateControls();
    }
  }
}

async function openFiles(files) {
  if (opening || exporting || !files.length) return;
  const file = files[0];
  if (files.length !== 1 || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    setMessage('error', 'PDF ファイルを１件選択してください。');
    return;
  }
  if (masks.length && !confirm('別の PDF を開くと、選択した黒塗り範囲が消えます。続けますか？')) return;
  opening = true;
  clearDraft();
  updateControls();
  setMessage('error');
  setMessage('status', 'PDF を読み込んでいます…');
  let loadingTask;
  try {
    engine ??= await import('./pdf.js');
    loadingTask = engine.loadPdf(new Uint8Array(await file.arrayBuffer()));
    const newPdf = await loadingTask.promise;
    const { info } = await newPdf.getMetadata();
    if (info.IsXFAPresent && !info.IsAcroFormPresent) {
      await loadingTask.destroy();
      setMessage('status');
      setMessage('error', 'XFA 形式のフォームは開けません。通常の PDF に変換してから開いてください。');
      return;
    }
    const oldPdf = documentPdf;
    documentPdf = newPdf;
    loadingTask = undefined;
    masks = [];
    nextMaskId = 1;
    pageInput.max = String(newPdf.numPages);
    byId('page-total').textContent = `/ ${newPdf.numPages}`;
    byId('file-name').textContent = file.name;
    zoom.value = '1';
    dropZone.hidden = true;
    workspace.hidden = false;
    drawMaskList();
    const preview = showPage(1);
    void oldPdf?.destroy().catch(() => {});
    await preview;
    if (!surface.hidden) surface.focus({ preventScroll: true });
  } catch (error) {
    void loadingTask?.destroy().catch(() => {});
    setMessage('status');
    setMessage('error', error.name === 'PasswordException'
      ? 'パスワードで保護された PDF は、保護を解除してから開いてください。'
      : 'PDF を開けませんでした。ファイルを確認してください。');
  } finally {
    opening = false;
    updateControls();
  }
}

for (const id of ['choose-file', 'change-file']) byId(id).addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  fileInput.value = '';
  void openFiles(files);
});
document.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = opening || exporting ? 'none' : 'copy';
});
dropZone.addEventListener('dragenter', () => dropZone.classList.add('dragging'));
dropZone.addEventListener('dragleave', event => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('dragging');
});
document.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  dropZone.classList.remove('dragging');
  void openFiles(event.dataTransfer.files);
});

previous.addEventListener('click', () => { if (page > 1) void showPage(page - 1); });
next.addEventListener('click', () => { if (page < documentPdf.numPages) void showPage(page + 1); });
pageInput.addEventListener('change', () => {
  const number = pageInput.valueAsNumber;
  pageInput.value = String(page);
  if (Number.isInteger(number) && number >= 1 && number <= documentPdf.numPages && number !== page) {
    void showPage(number);
  }
});
new ResizeObserver(sizeSurface).observe(viewport);
zoom.addEventListener('change', sizeSurface);

function setSelectMode(enabled) {
  selecting = enabled;
  clearDraft();
  selectMode.setAttribute('aria-pressed', String(enabled));
  panMode.setAttribute('aria-pressed', String(!enabled));
  updateControls();
}
selectMode.addEventListener('click', () => setSelectMode(true));
panMode.addEventListener('click', () => setSelectMode(false));

function pointFromPointer(event) {
  const rect = surface.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

surface.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || gesture || opening || exporting || rendering) return;
  if (!selecting && event.pointerType === 'touch') return;
  clearDraft();
  surface.focus({ preventScroll: true });
  if (selecting) {
    const start = pointFromPointer(event);
    gesture = { kind: 'mask', pointer: event.pointerId, start };
    showDraft(start, start);
  } else {
    gesture = {
      kind: 'pan', pointer: event.pointerId,
      x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop,
    };
    surface.setAttribute('data-panning', '');
  }
  surface.setPointerCapture(event.pointerId);
  event.preventDefault();
  updateControls();
});
surface.addEventListener('pointermove', event => {
  if (gesture?.pointer !== event.pointerId) return;
  if (gesture.kind === 'mask') {
    showDraft(gesture.start, pointFromPointer(event));
  } else {
    viewport.scrollTo(gesture.left + gesture.x - event.clientX, gesture.top + gesture.y - event.clientY);
  }
});
surface.addEventListener('pointerup', event => {
  if (gesture?.pointer !== event.pointerId) return;
  const finished = gesture;
  clearDraft();
  if (finished.kind === 'mask') saveMask(finished.start, pointFromPointer(event));
  else updateControls();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  surface.addEventListener(type, event => {
    if (gesture?.pointer !== event.pointerId) return;
    clearDraft();
    updateControls();
  });
}

surface.addEventListener('keydown', event => {
  if (!selecting || rendering || opening || exporting || gesture || event.isComposing) return;
  if (event.key === 'Escape') {
    clearDraft();
    updateControls();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (keyboardStart) {
      const start = keyboardStart;
      clearDraft();
      saveMask(start, keyboardPoint);
    } else {
      keyboardStart = keyboardPoint;
      showDraft(keyboardStart, keyboardStart);
      updateControls();
    }
  } else {
    const direction = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? .05 : .01;
    keyboardPoint = {
      x: clamp(keyboardPoint.x + direction[0] * step, 0, 1),
      y: clamp(keyboardPoint.y + direction[1] * step, 0, 1),
    };
    cursor.style.left = `${keyboardPoint.x * 100}%`;
    cursor.style.top = `${keyboardPoint.y * 100}%`;
    cursor.hidden = false;
    cursor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (keyboardStart) showDraft(keyboardStart, keyboardPoint);
  }
});

undo.addEventListener('click', () => {
  if (masks.length) removeMask(masks.at(-1).id);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      event.key.toLowerCase() === 'z' && !undo.disabled && event.target !== pageInput) {
    event.preventDefault();
    undo.click();
  }
});

download.addEventListener('click', async () => {
  if (download.disabled) return;
  exporting = true;
  updateControls();
  setMessage('error');
  setMessage('status', '黒塗り PDF を生成しています…');
  try {
    const pdf = await engine.exportPdf(documentPdf, masks, (number, total) => {
      setMessage('status', `黒塗り PDF を生成しています… ${number} / ${total} ページ`);
    });
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'redacted.pdf';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage('status', '黒塗り PDF を生成しました。');
  } catch (error) {
    setMessage('status');
    setMessage('error', `PDF を保存できませんでした。 ${error.message}`);
  } finally {
    exporting = false;
    updateControls();
  }
});
