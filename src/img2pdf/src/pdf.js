import { PDFDocument, PageSizes } from 'pdf-lib';
import { renderImage } from './images.js';

const margin = 18;
const maxImageEdge = 4096;

export async function makePdf(images, onProgress) {
  const document = await PDFDocument.create();
  for (const [index, item] of images.entries()) {
    onProgress(index + 1);
    try {
      const type = item.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const { blob } = await renderImage(item.file, maxImageEdge, type, 0.95);
      const bytes = await blob.arrayBuffer();
      const image = blob.type === 'image/jpeg' ? await document.embedJpg(bytes) : await document.embedPng(bytes);
      const [shortSide, longSide] = PageSizes.A4;
      const [width, height] = image.width > image.height ? [longSide, shortSide] : [shortSide, longSide];
      const page = document.addPage([width, height]);
      const fitted = image.scaleToFit(width - 2 * margin, height - 2 * margin);
      page.drawImage(image, {
        ...fitted,
        x: (width - fitted.width) / 2,
        y: (height - fitted.height) / 2,
      });
    } catch {
      throw new Error(`「${item.file.name}」をPDFに追加できませんでした。`);
    }
  }
  return new Blob([await document.save()], { type: 'application/pdf' });
}
