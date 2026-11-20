import { inspectFormat } from './formats.js';

const encoders = {
  jpeg: () => import('@jsquash/jpeg/encode.js'),
  png: () => import('@jsquash/oxipng/optimise.js'),
  webp: () => import('@jsquash/webp/encode.js'),
  avif: () => import('@jsquash/avif/encode.js'),
};
let source = null;

async function openImage(file) {
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error('このブラウザでは画像の圧縮ができません。');
  }
  const { format, animated } = await inspectFormat(file);
  if (animated) throw new Error('アニメーション画像です。静止画を選んでください。');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('画像を読み込めませんでした。ファイルの内容を確認してください。');
  }
  source?.bitmap.close();
  source = { file, format, bitmap };
  return { format, width: bitmap.width, height: bitmap.height };
}

function scaledPixels(bitmap, width, height, fillWhite) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像を描画できませんでした。');
  try {
    if (fillWhite) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function compress({ format, width, height, quality, level, lossless }) {
  if (!source) throw new Error('画像を選択してください。');
  const { bitmap, file } = source;
  const { default: encode } = await encoders[format]();
  if (format === 'png') {
    // 元のPNGを縮小しない場合は画素をデコードし直さず、そのまま最適化する。
    const original = source.format === 'png' && width === bitmap.width && height === bitmap.height
      ? await file.arrayBuffer() : null;
    const input = original ?? scaledPixels(bitmap, width, height, false);
    const result = await encode(input, { level, optimiseAlpha: false });
    return original && original.byteLength < result.byteLength ? original : result;
  }
  const pixels = scaledPixels(bitmap, width, height, format === 'jpeg');
  if (format === 'webp' && lossless) return encode(pixels, { lossless: 1, quality: 75, exact: 1 });
  if (format === 'avif') return encode(pixels, { quality, qualityAlpha: 100, speed: 7 });
  return encode(pixels, { quality });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'open') {
      const image = await openImage(data.file);
      self.postMessage({ type: 'open', image });
    } else if (data.type === 'encode') {
      const buffer = await compress(data.settings);
      self.postMessage({ type: 'encoded', id: data.id, buffer, settings: data.settings }, [buffer]);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      operation: data.type,
      id: data.id,
      message: data.type === 'open' && error instanceof Error ? error.message : 'この設定で画像を圧縮できませんでした。',
    });
  }
};
