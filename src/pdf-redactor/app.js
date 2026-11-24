import './style.css';
import { boxBetween, clamp, moveBox, resizeBox } from './geometry.js';

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
const removeSelected = byId('remove-selected');
const maskOverlay = byId('masks');
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
let maskHistory = [];
let selectedMaskId;
let nextMaskId = 1;

function setMessage(id, message = '') {
  const element = byId(id);
  element.textContent = message;
  element.hidden = !message;
}

function updateControls() {
  const busy = opening || exporting;
  const drafting = (gesture && gesture.kind !== 'pan') || Boolean(keyboardStart);
  byId('choose-file').disabled = byId('change-file').disabled = busy;
  download.disabled = !documentPdf || !masks.length || busy || rendering || drafting;
  undo.disabled = !maskHistory.length || busy || drafting;
  removeSelected.disabled = selectedMaskId === undefined || busy || rendering || drafting;
  previous.disabled = busy || page <= 1;
  next.disabled = busy || !documentPdf || page >= documentPdf.numPages;
  pageInput.disabled = zoom.disabled = selectMode.disabled = panMode.disabled = busy;
  for (const mask of maskOverlay.children) mask.tabIndex = selecting && !busy ? 0 : -1;
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

function selectMask(id) {
  selectedMaskId = id;
  for (const overlay of maskOverlay.children) {
    overlay.setAttribute('aria-pressed', String(Number(overlay.dataset.maskId) === selectedMaskId));
  }
  updateControls();
}

function drawMasks() {
  maskOverlay.replaceChildren(...masks.filter(mask => mask.page === page).map(({ id, box }) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'mask';
    element.dataset.maskId = String(id);
    element.setAttribute('aria-label', '黒塗り範囲');
    positionBox(element, box);
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('span');
      handle.className = 'resize-handle';
      handle.dataset.corner = corner;
      handle.setAttribute('aria-hidden', 'true');
      element.append(handle);
    }
    return element;
  }));
  selectMask(selectedMaskId);
}

function revealSelectedMask() {
  maskOverlay.querySelector('[aria-pressed="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function maskFromElement(element) {
  return masks.find(mask => mask.id === Number(element?.dataset.maskId));
}

function commitAdjustment(mask, element, box) {
  if (Object.keys(box).every(edge => box[edge] === mask.box[edge])) return;
  maskHistory.push({ kind: 'edit', mask, box: mask.box });
  mask.box = box;
  positionBox(element, box);
  setMessage('status');
  updateControls();
}

function resizeMaskBox(box, corner, dx, dy, bounds) {
  const minWidth = Math.min(box.right - box.left, 4 / bounds.width);
  const minHeight = Math.min(box.bottom - box.top, 4 / bounds.height);
  return resizeBox(box, corner, dx, dy, minWidth, minHeight);
}

function removeMask(id) {
  const index = masks.findIndex(mask => mask.id === id);
  if (index < 0) return;
  const [mask] = masks.splice(index, 1);
  maskHistory.push({ kind: 'remove', mask, index });
  if (selectedMaskId === id) selectedMaskId = undefined;
  drawMasks();
  setMessage('status');
}

function clearDraft() {
  const captured = gesture?.pointer;
  if (gesture?.kind === 'adjust') positionBox(gesture.element, gesture.mask.box);
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
    updateControls();
    return;
  }
  const mask = { page, id: nextMaskId++, box };
  maskHistory.push({ kind: 'add', mask, index: masks.length });
  masks.push(mask);
  selectedMaskId = mask.id;
  drawMasks();
  setMessage('status');
}

async function showPage(number) {
  if (!documentPdf || exporting) return;
  const revision = ++previewRevision;
  const previousTask = previewTask;
  previousTask?.cancel();
  const pdf = documentPdf;
  page = number;
  if (!masks.some(mask => mask.id === selectedMaskId && mask.page === number)) selectedMaskId = undefined;
  pageInput.value = String(page);
  pageSize = undefined;
  keyboardPoint = { x: .5, y: .5 };
  clearDraft();
  const hadFocus = surface.contains(document.activeElement);
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
    if (selectedMaskId !== undefined) revealSelectedMask();
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
    maskHistory = [];
    selectedMaskId = undefined;
    nextMaskId = 1;
    pageInput.max = String(newPdf.numPages);
    byId('page-total').textContent = `/ ${newPdf.numPages}`;
    byId('file-name').textContent = file.name;
    zoom.value = '1';
    dropZone.hidden = true;
    workspace.hidden = false;
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

function pointFromPointer(event, bounds, bounded = true) {
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  return bounded ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : { x, y };
}

function adjustmentBox(active, event) {
  const point = pointFromPointer(event, active.bounds, false);
  const dx = point.x - active.start.x;
  const dy = point.y - active.start.y;
  return active.corner
    ? resizeMaskBox(active.mask.box, active.corner, dx, dy, active.bounds)
    : moveBox(active.mask.box, dx, dy);
}

function moved(event, active) {
  const threshold = active.kind === 'adjust' || event.pointerType !== 'touch' ? 3 : 8;
  return Math.hypot(event.clientX - active.x, event.clientY - active.y) >= threshold;
}

surface.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || gesture || opening || exporting || rendering) return;
  if (!selecting && event.pointerType === 'touch') return;
  clearDraft();
  const { pointerId: pointer, clientX: x, clientY: y } = event;
  if (!selecting) {
    surface.focus({ preventScroll: true });
    gesture = { kind: 'pan', pointer, x, y, left: viewport.scrollLeft, top: viewport.scrollTop };
    surface.setAttribute('data-panning', '');
  } else {
    const bounds = surface.getBoundingClientRect();
    const element = event.target.closest('[data-mask-id]');
    const mask = maskFromElement(element);
    selectMask(mask?.id);
    if (mask) {
      element.focus({ preventScroll: true });
      const start = pointFromPointer(event, bounds, false);
      gesture = { kind: 'adjust', pointer, start, bounds, element, mask, corner: event.target.dataset.corner, x, y };
    } else {
      surface.focus({ preventScroll: true });
      const start = pointFromPointer(event, bounds);
      gesture = { kind: 'mask', pointer, start, bounds, x, y };
      showDraft(start, start);
    }
  }
  surface.setPointerCapture(pointer);
  event.preventDefault();
  updateControls();
});
surface.addEventListener('pointermove', event => {
  if (gesture?.pointer !== event.pointerId) return;
  if (gesture.kind === 'pan') {
    viewport.scrollTo(gesture.left + gesture.x - event.clientX, gesture.top + gesture.y - event.clientY);
  } else if (gesture.kind === 'mask') {
    showDraft(gesture.start, pointFromPointer(event, gesture.bounds));
  } else {
    const box = moved(event, gesture) ? adjustmentBox(gesture, event) : gesture.mask.box;
    positionBox(gesture.element, box);
  }
});
surface.addEventListener('pointerup', event => {
  if (gesture?.pointer !== event.pointerId) return;
  const finished = gesture;
  clearDraft();
  updateControls();
  if (finished.kind === 'pan' || !moved(event, finished)) return;
  if (finished.kind === 'adjust') {
    commitAdjustment(finished.mask, finished.element, adjustmentBox(finished, event));
  } else {
    saveMask(finished.start, pointFromPointer(event, finished.bounds));
  }
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  surface.addEventListener(type, event => {
    if (gesture?.pointer !== event.pointerId) return;
    clearDraft();
    updateControls();
  });
}

const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

for (const type of ['focusin', 'click']) {
  maskOverlay.addEventListener(type, event => {
    if (!selecting || opening || exporting || rendering) return;
    const mask = maskFromElement(event.target.closest('[data-mask-id]'));
    if (mask) selectMask(mask.id);
  });
}

maskOverlay.addEventListener('keydown', event => {
  const direction = arrows[event.key];
  if (!direction || !selecting || opening || exporting || rendering || gesture || event.isComposing) return;
  const mask = maskFromElement(event.target);
  if (!mask) return;
  event.preventDefault();
  const bounds = surface.getBoundingClientRect();
  const [x, y] = direction;
  const dx = 2 * x / bounds.width;
  const dy = 2 * y / bounds.height;
  const box = event.shiftKey
    ? resizeMaskBox(mask.box, 'se', dx, dy, bounds)
    : moveBox(mask.box, dx, dy);
  commitAdjustment(mask, event.target, box);
});

surface.addEventListener('keydown', event => {
  if (event.target !== surface || !selecting || rendering || opening || exporting || gesture || event.isComposing) return;
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
    const direction = arrows[event.key];
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

removeSelected.addEventListener('click', () => {
  removeMask(selectedMaskId);
  surface.focus({ preventScroll: true });
});
undo.addEventListener('click', () => {
  const change = maskHistory.pop();
  if (!change) return;
  const { kind, index, mask } = change;
  if (kind === 'add') {
    masks.splice(index, 1);
    if (selectedMaskId === mask.id) selectedMaskId = undefined;
  } else {
    if (kind === 'remove') masks.splice(index, 0, mask);
    else mask.box = change.box;
    selectedMaskId = mask.id;
    if (mask.page !== page) {
      void showPage(mask.page);
      return;
    }
  }
  const hadMaskFocus = maskOverlay.contains(document.activeElement);
  drawMasks();
  if (kind !== 'add') revealSelectedMask();
  if (hadMaskFocus) {
    const selected = maskOverlay.querySelector('[aria-pressed="true"]') ?? surface;
    selected.focus({ preventScroll: true });
  }
  if (undo.disabled && document.activeElement === undo) surface.focus({ preventScroll: true });
  setMessage('status');
});
document.addEventListener('keydown', event => {
  if (opening || exporting || !workspace.contains(event.target) || event.target === pageInput || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      event.key.toLowerCase() === 'z' && !undo.disabled) {
    event.preventDefault();
    undo.click();
  } else if (event.key === 'Delete' && !removeSelected.disabled) {
    event.preventDefault();
    removeSelected.click();
  } else if (event.key === 'Escape' && (keyboardStart || gesture || selectedMaskId !== undefined)) {
    event.preventDefault();
    if (keyboardStart || gesture) {
      clearDraft();
      updateControls();
    } else {
      selectMask(undefined);
      if (maskOverlay.contains(event.target)) surface.focus({ preventScroll: true });
    }
  }
});

download.addEventListener('click', async () => {
  if (download.disabled) return;
  exporting = true;
  updateControls();
  setMessage('error');
  setMessage('status', '黒塗り PDF を生成しています…');
  try {
    const { exportPdf } = await import('./redaction.js');
    const pdf = await exportPdf(documentPdf, masks);
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
    const reason = error instanceof Error ? error.message : 'この PDF の文字や描画には対応していません。';
    setMessage('error', `PDF を保存できませんでした。 ${reason}`);
  } finally {
    exporting = false;
    updateControls();
  }
});
