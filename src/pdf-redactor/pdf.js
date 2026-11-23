import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const maxRasterEdge = 4096;
const maxRasterPixels = 12_000_000;

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
