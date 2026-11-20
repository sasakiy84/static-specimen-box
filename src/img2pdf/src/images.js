const typesByExtension = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};
const acceptedTypes = new Set(Object.values(typesByExtension));

export function imageType(file) {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const type = file.type || typesByExtension[extension];
  return acceptedTypes.has(type) ? type : null;
}

export async function renderImage(file, maxEdge, type = 'image/png', quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  const { width, height } = bitmap;
  try {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像の描画ができません。');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('画像を変換できません。');
    return { blob, width, height };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
