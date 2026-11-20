export const formats = {
  jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg' },
  png: { label: 'PNG', mime: 'image/png', extension: 'png' },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp' },
  avif: { label: 'AVIF', mime: 'image/avif', extension: 'avif' },
};

function fourCC(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

async function animatedPng(file) {
  let offset = 8;
  while (offset + 12 <= file.size) {
    const header = await file.slice(offset, offset + 8).arrayBuffer();
    const type = fourCC(new Uint8Array(header), 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + new DataView(header).getUint32(0);
  }
  return false;
}

export async function inspectFormat(file) {
  const header = await file.slice(0, 256).arrayBuffer();
  const bytes = new Uint8Array(header);
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    return { format: 'png', animated: await animatedPng(file) };
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { format: 'jpeg', animated: false };
  }
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    return { format: 'webp', animated: fourCC(bytes, 12) === 'VP8X' && (bytes[20] & 2) !== 0 };
  }
  if (bytes.length >= 16 && fourCC(bytes, 4) === 'ftyp') {
    const brands = [fourCC(bytes, 8)];
    const boxLength = Math.min(bytes.length, new DataView(header).getUint32(0));
    for (let offset = 16; offset + 4 <= boxLength; offset += 4) brands.push(fourCC(bytes, offset));
    if (brands.includes('avif') || brands.includes('avis')) {
      return { format: 'avif', animated: brands.includes('avis') };
    }
  }
  throw new Error('JPEG・PNG・WebP・AVIF の画像を選んでください。');
}

export function dimensionsFor(original, resize, percent, edge) {
  const longEdge = Math.max(original.width, original.height);
  const scale = resize === 'percent' ? percent / 100 : resize === 'edge' ? Math.min(edge / longEdge, 1) : 1;
  return { width: Math.max(1, Math.round(original.width * scale)), height: Math.max(1, Math.round(original.height * scale)) };
}
