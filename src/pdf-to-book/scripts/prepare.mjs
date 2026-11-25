import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const root = new URL('../', import.meta.url);
const assets = new URL('.generated/assets/', root);
const extras = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];
const ort = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
const runtime = new URL('node_modules/onnxruntime-web/dist/', root);
const version = JSON.parse(await readFile(new URL('package.json', root), 'utf8')).dependencies['onnxruntime-web'];
const gpuPath = `ort/webgpu-${version}/`;
const gpuModule = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs'];
const gpuBinary = 'ort-wasm-simd-threaded.asyncify.wasm';
await Promise.all(['pdfjs/', 'ort/', gpuPath].map(name => mkdir(new URL(name, assets), { recursive: true })));
await Promise.all([
  ...extras.map(name => cp(new URL('node_modules/pdfjs-dist/' + name, root), new URL('pdfjs/' + name, assets), { recursive: true })),
  ...ort.map(name => cp(new URL(name, runtime), new URL('ort/' + name, assets))),
  ...gpuModule.map(name => cp(new URL(name, runtime), new URL(gpuPath + name, assets))),
  // WebGPU用のWASMを圧縮し、Cloudflareの静的ファイルの上限に収める。
  pipeline(
    createReadStream(new URL(gpuBinary, runtime)),
    createGzip(),
    createWriteStream(new URL(gpuPath + gpuBinary + '-gzip.bin', assets)),
  ),
  cp(new URL('licenses/', root), new URL('licenses/', assets), { recursive: true }),
  cp(new URL('models/', root), new URL('models/', assets), { recursive: true }),
]);
