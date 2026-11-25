import { GlobalWorkerOptions, getDocument, Util } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(bytes, assets) {
  return getDocument({
    data: bytes,
    cMapUrl: new URL('pdfjs/cmaps/', assets).href,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', assets).href,
    iccUrl: new URL('pdfjs/iccs/', assets).href,
    wasmUrl: new URL('pdfjs/wasm/', assets).href,
    enableXfa: false,
  });
}

export function pageNumbers(range, count) {
  if (!range.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const selected = new Set();
  for (const segment of range.trim().split(/[,、]/)) {
    const match = segment.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!match) throw new Error('ページ範囲は 1-3, 5 のように入力してください。');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last > count || first > last) throw new Error(`1〜${count} のページ番号を指定してください。`);
    for (let page = first; page <= last; page++) selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}

export async function renderPage(page, signal, preferPdfText) {
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 3200 / Math.max(original.width, original.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const task = page.render({ canvas, viewport, background: '#fff' });
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const textContent = preferPdfText ? page.getTextContent().catch(() => null) : null;
    const [, text] = await Promise.all([task.promise, textContent]);
    const layer = text?.items.flatMap(item => {
      if (!item.str?.trim() || /[\uFFFD\p{Co}]/u.test(item.str)) return [];
      const transform = Util.transform(viewport.transform, item.transform);
      const [a, b, c, d, x, y] = transform;
      const fontSize = Math.hypot(c, d);
      const vertical = item.dir === 'ttb' || text.styles[item.fontName]?.vertical === true || Math.abs(b) > Math.abs(a);
      const advance = Math.max(fontSize, (vertical ? item.height : item.width) * viewport.scale);
      const box = vertical ? [x - fontSize * .5, y, x + fontSize * .55, y + advance] :
        [x, y - fontSize * .88, x + advance, y + fontSize * .18];
      return [{ text: item.str, vertical, box }];
    }) ?? [];
    signal.throwIfAborted();
    return { image: await createImageBitmap(canvas), layer };
  } finally {
    signal.removeEventListener('abort', cancel);
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}
