import { cp, mkdir } from 'node:fs/promises';

const distribution = new URL('../node_modules/pdfjs-dist/', import.meta.url);
const destination = new URL('../.generated/assets/pdfjs/', import.meta.url);
// PDF.js が実行時に必要とするファイルを CDN に接続せずに読み込めるようにする。
const assets = ['cmaps', 'iccs', 'standard_fonts', 'wasm'];
await mkdir(destination, { recursive: true });
await Promise.all(assets.map(name => cp(new URL(name, distribution), new URL(name, destination), { recursive: true })));

const notices = new URL('../.generated/assets/licenses/', import.meta.url);
await mkdir(notices, { recursive: true });
await cp(new URL('../licenses/open-redact-pdf.txt', import.meta.url),
  new URL('open-redact-pdf.txt', notices));
