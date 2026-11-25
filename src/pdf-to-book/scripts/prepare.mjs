import { cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = new URL('.generated/assets/', root);
const extras = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];
const ort = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
await Promise.all(['pdfjs', 'ort'].map(name => mkdir(new URL(name, assets), { recursive: true })));
await Promise.all([
  ...extras.map(name => cp(new URL('node_modules/pdfjs-dist/' + name, root), new URL('pdfjs/' + name, assets), { recursive: true })),
  ...ort.map(name => cp(new URL('node_modules/onnxruntime-web/dist/' + name, root), new URL('ort/' + name, assets))),
  cp(new URL('licenses/', root), new URL('licenses/', assets), { recursive: true }),
  cp(new URL('models/', root), new URL('models/', assets), { recursive: true }),
]);
