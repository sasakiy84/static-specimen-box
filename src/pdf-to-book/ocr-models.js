import * as ort from 'onnxruntime-web/wasm';
import manifest from './model-manifest.json';
import charset from './charset.json';
import { dependencies } from './package.json';

const mean = [.485, .456, .406];
const std = [.229, .224, .225];
const tableMean = [.40789654, .44719302, .47026115];
const tableStd = [.28863828, .27408164, .27809835];
const chars = [...charset];

async function gpuLayout(assets, buffer) {
  if (!navigator.gpu || typeof DecompressionStream !== 'function') return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter || adapter.info?.isFallbackAdapter) return null;

  const folder = new URL(`ort/webgpu-${dependencies['onnxruntime-web']}/`, assets);
  const moduleUrl = new URL('ort.webgpu.min.mjs', folder).href;
  const [runtime, response] = await Promise.all([
    import(/* @vite-ignore */ moduleUrl),
    fetch(new URL('ort-wasm-simd-threaded.asyncify.wasm-gzip.bin', folder)),
  ]);
  if (!response.ok || !response.body) return null;
  const unpacked = response.body.pipeThrough(new DecompressionStream('gzip'));
  runtime.env.wasm.wasmBinary = await new Response(unpacked).arrayBuffer();
  runtime.env.wasm.wasmPaths = folder.href;
  runtime.env.wasm.numThreads = ort.env.wasm.numThreads;
  runtime.env.webgpu.adapter = adapter;
  const session = await runtime.InferenceSession.create(buffer, { executionProviders: ['webgpu', 'wasm'] });
  const device = runtime.env.webgpu.device;
  if (!device) {
    await session.release();
    return null;
  }
  const entry = { session, Tensor: runtime.Tensor, device, lost: false };
  void device.lost.then(() => { entry.lost = true; });
  return entry;
}

export class OCRModels {
  constructor(assets, notify) {
    this.assets = assets;
    this.notify = notify;
    this.tryGpu = true;
    this.sessions = new Map();
    ort.env.wasm.numThreads = crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
      ? Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
      : 1;
    ort.env.wasm.wasmPaths = new URL('ort/', assets).href;
  }

  async load(name) {
    if (this.sessions.has(name)) return this.sessions.get(name);
    const { parts, sha256, bytes } = manifest[name];
    const cache = await caches.open('pdf-to-book-models-ndlocr-2.0.0').catch(() => null);
    const request = new Request(new URL(`models/${name}-${sha256}.onnx`, this.assets));
    let buffer = await cache?.match(request).then(response => response?.arrayBuffer()).catch(() => undefined);
    if (buffer?.byteLength !== bytes || await hash(buffer) !== sha256) {
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const part of parts) {
        this.notify({ model: name, loaded: offset, bytes });
        const response = await fetch(new URL('models/' + part, this.assets));
        if (!response.ok) throw new Error(`OCRモデルを読み込めませんでした（${response.status}）。`);
        const data = new Uint8Array(await response.arrayBuffer());
        joined.set(data, offset);
        offset += data.length;
      }
      if (offset !== bytes || await hash(joined) !== sha256) {
        throw new Error('OCRモデルのファイルが破損しています。');
      }
      buffer = joined.buffer;
      await cache?.put(request, new Response(buffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })).catch(() => {});
    }
    this.notify({ model: name, loaded: bytes, bytes });
    const accelerated = name === 'layout' && this.tryGpu
      ? await gpuLayout(this.assets, buffer).catch(() => null)
      : null;
    const entry = accelerated ?? {
      session: await ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] }),
      Tensor: ort.Tensor,
    };
    this.sessions.set(name, entry);
    return entry;
  }

  // NDL 公式の DEIM 推論と同じく、黒背景の正方形に揃えて RGB を正規化する。
  async detect(page) {
    let layout = await this.load('layout');
    const size = layout.session.inputMetadata[0].shape[2];
    const side = Math.max(page.width, page.height);
    const scale = size / side;
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillRect(0, 0, size, size);
    context.drawImage(page, 0, 0, page.width * scale, page.height * scale);
    const run = async ({ session, Tensor, lost }) => {
      if (lost) throw new Error('WebGPU device lost');
      const input = pixels(canvas, mean, std, false, Tensor);
      const dimensions = new Tensor('int64', BigInt64Array.of(BigInt(size), BigInt(size)), [1, 2]);
      try {
        return await session.run({ [session.inputNames[0]]: input, [session.inputNames[1]]: dimensions });
      } finally {
        input.dispose();
        dimensions.dispose();
      }
    };
    let outputs;
    try {
      outputs = await run(layout);
    } catch (error) {
      if (!layout.device) throw error;
      this.tryGpu = false;
      this.sessions.delete('layout');
      void layout.session.release().catch(() => {});
      layout = await this.load('layout');
      outputs = await run(layout);
    }
    const { outputNames } = layout.session;
    const [labels, boxes, scores, counts, styles] = outputNames.map(output => outputs[output]?.data);
    const detections = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] <= .1) continue;
      const [x1, y1, x2, y2] = boxes.subarray(i * 4, i * 4 + 4);
      const box = [Math.max(0, x1 / scale), Math.max(0, y1 / scale),
        Math.min(page.width, x2 / scale), Math.min(page.height, y2 / scale)];
      if (box[2] - box[0] < 2 || box[3] - box[1] < 2) continue;
      detections.push({ box, label: Number(labels[i]) - 1, score: scores[i],
        count: Number(counts?.[i] ?? 0), style: styles && outputNames.length === 6 ? Number(styles[i]) : 0 });
    }
    for (const tensor of Object.values(outputs)) tensor.dispose();
    return suppressDuplicates(detections);
  }

  async recognize(page, box, count = 0, rotate = isVertical(box)) {
    let name = count === 3 ? 'short' : count === 2 ? 'medium' : 'long';
    let text = await this.readLine(page, box, rotate, name);
    if (name === 'short' && [...text].length >= 25) {
      name = 'medium';
      text = await this.readLine(page, box, rotate, name);
    }
    if (name === 'medium' && [...text].length >= 45) text = await this.readLine(page, box, rotate, 'long');
    if ([...text].length >= 98) {
      const [x1, y1, x2, y2] = box;
      const mid = rotate ? (y1 + y2) / 2 : (x1 + x2) / 2;
      const first = rotate ? [x1, y1, x2, mid] : [x1, y1, mid, y2];
      const second = rotate ? [x1, mid, x2, y2] : [mid, y1, x2, y2];
      text = await this.readLine(page, first, rotate, 'long') + await this.readLine(page, second, rotate, 'long');
    }
    return text.trim().replace(/ *([、。]) */g, '$1');
  }

  async readLine(page, box, rotate, name) {
    const { session } = await this.load(name);
    const [, , height, width] = session.inputMetadata[0].shape;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const [x1, y1, x2, y2] = box;
    if (rotate) { context.translate(0, height); context.rotate(-Math.PI / 2); }
    context.drawImage(page, x1, y1, x2 - x1, y2 - y1, 0, 0, rotate ? height : width, rotate ? width : height);
    const input = pixels(canvas, [.5, .5, .5], [.5, .5, .5], true);
    const output = (await session.run({ [session.inputNames[0]]: input }))[session.outputNames[0]];
    const data = output.data;
    const [, length, stride] = output.dims;
    let text = '';
    for (let row = 0; row < length; row++) {
      const offset = row * stride;
      let best = 0;
      for (let i = 1; i < stride; i++) if (data[offset + i] > data[offset + best]) best = i;
      if (!best) break;
      text += chars[best - 1] ?? '';
    }
    output.dispose();
    return text;
  }

  async tableCells(page, box) {
    const { session } = await this.load('table');
    const [, , height, width] = session.inputMetadata[0].shape;
    const [x1, y1, x2, y2] = box;
    const w = x2 - x1, h = y2 - y1;
    const scale = width / Math.max(w, h);
    const left = (width - w * scale) / 2;
    const top = (height - h * scale) / 2;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillRect(0, 0, width, height);
    context.drawImage(page, x1, y1, w, h, left, top, w * scale, h * scale);
    const outputs = await session.run({ [session.inputNames[0]]: pixels(canvas, tableMean, tableStd, true) });
    try {
      return decodeTableCells(outputs, box, scale, left, top, width);
    } finally {
      for (const tensor of Object.values(outputs)) tensor.dispose();
    }
  }
}

async function hash(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function pixels(canvas, mean, std, bgr = false, Tensor = ort.Tensor) {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const length = width * height;
  const values = new Float32Array(length * 3);
  for (let channel = 0; channel < 3; channel++) {
    const source = bgr ? 2 - channel : channel;
    const offset = length * channel;
    for (let i = 0; i < length; i++) values[offset + i] = (rgba[4 * i + source] / 255 - mean[channel]) / std[channel];
  }
  return new Tensor('float32', values, [1, 3, height, width]);
}

export function isVertical([x1, y1, x2, y2]) { return y2 - y1 > (x2 - x1) * 1.1; }

function area([x1, y1, x2, y2]) { return Math.max(0, x2 - x1) * Math.max(0, y2 - y1); }

function suppressDuplicates(detections) {
  const kept = [];
  for (const detection of detections.sort((a, b) => b.score - a.score)) {
    const a = detection.box;
    const duplicate = kept.some(({ label, box: b }) => label === detection.label &&
      area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])])
        >= .88 * Math.min(area(a), area(b)));
    if (!duplicate) kept.push(detection);
  }
  return kept;
}

function decodeTableCells({ hm, ct2cn, reg }, box, scale, left, top, width) {
  const [, , rows, columns] = hm.dims;
  const length = rows * columns;
  const heat = hm.data, offsets = reg.data, corners = ct2cn.data;
  const stride = width / columns;
  const cells = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < columns - 1; x++) {
      const i = y * columns + x;
      const score = heat[i];
      if (score < -1.39) continue;
      if ([-columns - 1, -columns, -columns + 1, -1, 1, columns - 1, columns, columns + 1]
        .some(offset => heat[i + offset] > score)) continue;
      const xs = [], ys = [];
      for (let corner = 0; corner < 4; corner++) {
        xs.push(box[0] + ((x + offsets[i] - corners[length * 2 * corner + i]) * stride - left) / scale);
        ys.push(box[1] + ((y + offsets[length + i] - corners[length * (2 * corner + 1) + i]) * stride - top) / scale);
      }
      const rect = [Math.max(box[0], Math.min(...xs)), Math.max(box[1], Math.min(...ys)),
        Math.min(box[2], Math.max(...xs)), Math.min(box[3], Math.max(...ys))];
      if (area(rect) > 12) cells.push({ box: rect, score });
    }
  }
  return suppressDuplicates(cells).map(cell => cell.box);
}
