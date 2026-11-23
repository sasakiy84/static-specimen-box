import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pixelBounds } from './geometry.js';

const maxRasterEdge = 4096;
const maxRasterPixels = 12_000_000;
const exportScale = 200 / 72;

GlobalWorkerOptions.workerSrc = workerUrl;

export function loadPdf(bytes) {
  const assets = new URL('./pdfjs/', document.baseURI);
  return getDocument({
    data: bytes,
    cMapUrl: new URL('cmaps/', assets).href,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    iccUrl: new URL('iccs/', assets).href,
    wasmUrl: new URL('wasm/', assets).href,
    stopAtErrors: true,
    enableXfa: false,
  });
}

export function renderPage(page, canvas, targetScale) {
  const { width, height } = page.getViewport({ scale: 1 });
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error('PDF のページサイズを取得できませんでした。');
  }
  const scale = Math.min(targetScale, maxRasterEdge / width, maxRasterEdge / height,
    Math.sqrt(maxRasterPixels / (width * height)));
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.min(maxRasterEdge, Math.ceil(viewport.width)));
  canvas.height = Math.max(1, Math.min(maxRasterEdge, Math.ceil(viewport.height)));
  const canvasContext = canvas.getContext('2d', { alpha: false });
  if (!canvasContext) throw new Error('ページ画像を描画できませんでした。');
  const task = page.render({
    canvas, canvasContext, viewport, background: '#ffffff',
    transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0],
  });
  return { task, width, height };
}

function maskedCanvas(canvas, boxes) {
  if (!boxes.length) return canvas;
  // 独立した Canvas で処理し、PDF レンダラーの描画状態やクリップを引き継がない。
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('黒塗り範囲を描画できませんでした。');
  context.drawImage(canvas, 0, 0);
  context.fillStyle = '#000000';
  for (const box of boxes) {
    const { left, top, right, bottom } = pixelBounds(box, output.width, output.height);
    context.fillRect(left, top, right - left, bottom - top);
  }
  return output;
}

function pngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('ページ画像を生成できませんでした。'));
    }, 'image/png');
  });
}

export async function exportPdf(source, masks, onProgress) {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create({ updateMetadata: false });
  const boxesByPage = new Map();
  for (const { page, box } of masks) {
    if (!Number.isInteger(page) || page < 1 || page > source.numPages) {
      throw new Error('黒塗り範囲のページ番号が不正です。');
    }
    if (!boxesByPage.has(page)) boxesByPage.set(page, []);
    boxesByPage.get(page).push(box);
  }
  for (let number = 1; number <= source.numPages; number++) {
    onProgress(number, source.numPages);
    const canvas = document.createElement('canvas');
    let page, pixels;
    try {
      page = await source.getPage(number);
      const { task, width, height } = renderPage(page, canvas, exportScale);
      await task.promise;
      pixels = maskedCanvas(canvas, boxesByPage.get(number) ?? []);
      const png = await pngBlob(pixels);
      const image = await output.embedPng(await png.arrayBuffer());
      output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    } catch (error) {
      throw new Error(`${number} ページ目の画像を生成できませんでした。`, { cause: error });
    } finally {
      canvas.width = canvas.height = 0;
      if (pixels && pixels !== canvas) pixels.width = pixels.height = 0;
      page?.cleanup();
    }
  }
  const bytes = await output.save({ updateFieldAppearances: false, addDefaultPage: false });
  return new Blob([bytes], { type: 'application/pdf' });
}
