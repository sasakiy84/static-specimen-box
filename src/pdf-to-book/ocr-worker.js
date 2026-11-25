import { OCRModels, isVertical } from './ocr-models.js';
import { arrangePage, attachRuby, buildTable, center, charactersOf, contains, height, width } from './layout.js';

let models;
const imageLabels = new Set([6, 11, 12, 13, 15]);
const lineLabels = new Set([1, 2, 4, 5, 16]);

function ownRuns(layer, boxes) {
  const mapped = new Map();
  for (const run of layer) {
    const point = center(run.box);
    const options = boxes.filter(box => contains(box.box, point));
    options.sort((a, b) => width(a.box) * height(a.box) - width(b.box) * height(b.box));
    const owner = options[0];
    if (!owner) continue;
    if (!mapped.has(owner)) mapped.set(owner, []);
    mapped.get(owner).push(run);
  }
  return mapped;
}

async function recognize(page, region, runs) {
  const vertical = runs?.some(run => run.vertical) || isVertical(region.box);
  const layerChars = runs?.length ? charactersOf(runs, vertical) : [];
  let chars = layerChars;
  if (!chars.length) {
    const text = await models.recognize(page, region.box, region.label === 10 ? 3 : region.count, vertical);
    chars = charactersOf([{ text, box: region.box }], vertical);
  }
  return { ...region, vertical, chars, text: chars.map(char => char.text).join('').trim(), ruby: [] };
}

async function crop(page, box) {
  const [x1, y1, x2, y2] = box;
  const image = new OffscreenCanvas(Math.max(1, Math.ceil(x2 - x1)), Math.max(1, Math.ceil(y2 - y1)));
  image.getContext('2d').drawImage(page, x1, y1, x2 - x1, y2 - y1, 0, 0, image.width, image.height);
  return new Uint8Array(await (await image.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

function findGridCells(page, box) {
  const [left, top, right, bottom] = box;
  const padX = Math.max(3, Math.round((right - left) * .035));
  const padY = Math.max(3, Math.round((bottom - top) * .035));
  const x = Math.max(0, Math.floor(left) - padX), y = Math.max(0, Math.floor(top) - padY);
  const w = Math.min(page.width, Math.ceil(right) + padX) - x;
  const h = Math.min(page.height, Math.ceil(bottom) + padY) - y;
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(page, -x, -y);
  const rgba = context.getImageData(0, 0, w, h).data;
  const dark = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const offset = 4 * (y * w + x);
    return rgba[offset] + rgba[offset + 1] + rgba[offset + 2] < 460;
  };
  function bands(axis) {
    const primary = axis ? h : w, secondary = axis ? w : h;
    const peaks = [];
    for (let pos = 0; pos < primary; pos++) {
      let hits = 0;
      for (let i = 0; i < secondary; i++) hits += axis ? dark(i, pos) : dark(pos, i);
      if (hits < secondary * .45) continue;
      const last = peaks.at(-1);
      if (last && pos - last[1] <= 2) last[1] = pos;
      else peaks.push([pos, pos]);
    }
    return peaks.map(([start, end]) => Math.round((start + end) / 2));
  }
  const xs = bands(0), ys = bands(1);
  const cols = xs.length - 1, rows = ys.length - 1;
  if (cols < 1 || rows < 1 || cols * rows > 800) return [];
  function coverage(axis, pos, start, end) {
    let hits = 0;
    for (let i = start; i < end; i++) {
      if ([-1, 0, 1].some(delta => axis ? dark(i, pos + delta) : dark(pos + delta, i))) hits++;
    }
    return hits / (end - start);
  }
  if ([xs[0], xs.at(-1)].some(pos => coverage(0, pos, ys[0], ys.at(-1)) < .78) ||
      [ys[0], ys.at(-1)].some(pos => coverage(1, pos, xs[0], xs.at(-1)) < .78)) return [];
  const parent = Array.from({ length: rows * cols }, (_, index) => index);
  function root(index) {
    while (parent[index] !== index) index = parent[index];
    return index;
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const here = row * cols + col;
      if (col && coverage(0, xs[col], ys[row], ys[row + 1]) < .45) parent[root(here)] = root(here - 1);
      if (row && coverage(1, ys[row], xs[col], xs[col + 1]) < .45) parent[root(here)] = root(here - cols);
    }
  }
  const groups = new Map();
  for (let slot = 0; slot < parent.length; slot++) {
    const index = root(slot), row = Math.floor(slot / cols), col = slot % cols;
    const region = groups.get(index) ?? { x0: col, y0: row, x1: col, y1: row, count: 0 };
    region.x0 = Math.min(col, region.x0);
    region.x1 = Math.max(col, region.x1);
    region.y0 = Math.min(row, region.y0);
    region.y1 = Math.max(row, region.y1);
    region.count++;
    groups.set(index, region);
  }
  if ([...groups.values()].some(cell => cell.count !== (cell.x1 - cell.x0 + 1) * (cell.y1 - cell.y0 + 1))) return [];
  return [...groups.values()].map(cell => [xs[cell.x0] + x, ys[cell.y0] + y, xs[cell.x1 + 1] + x, ys[cell.y1 + 1] + y]);
}

function duplicateLines(lines, ruby) {
  const priority = item => item.label === 16 || item.label === 2 ? 1 : 0;
  const kept = [];
  for (const line of [...lines].sort((a, b) => priority(b) - priority(a) || b.score - a.score)) {
    const box = line.box;
    const sameRegion = other => {
      const b = other.box;
      const area = Math.max(0, Math.min(box[2], b[2]) - Math.max(box[0], b[0])) *
        Math.max(0, Math.min(box[3], b[3]) - Math.max(box[1], b[1]));
      return area >= .7 * Math.min(width(box) * height(box), width(b) * height(b));
    };
    if (ruby.some(other => sameRegion(other) && contains(other.box, center(box)))) continue;
    if (!kept.some(sameRegion)) kept.push(line);
  }
  return kept;
}

async function processPage(page, layer, structuredTables) {
  const detections = await models.detect(page);
  const artwork = detections.filter(item => imageLabels.has(item.label)).filter(({ label, box }) =>
    !detections.some(other => imageLabels.has(other.label) && other.box !== box &&
      (other.label === 15 || label !== 15) && width(other.box) * height(other.box) > 1.15 * width(box) * height(box) &&
      contains(other.box, [box[0], box[1]]) && contains(other.box, [box[2], box[3]])));
  const ruby = detections.filter(item => item.label === 10);
  const candidates = duplicateLines(detections.filter(item => lineLabels.has(item.label)), ruby);
  const regions = ownRuns(layer, [...candidates, ...ruby]);
  const lines = [];
  for (const region of candidates) {
    const inside = artwork.find(art => contains(art.box, center(region.box)));
    if (inside && (inside.label !== 15 || !structuredTables)) continue;
    const line = await recognize(page, region, regions.get(region));
    if (line.text) lines.push(line);
  }
  const assignedRuns = new Set([...regions.values()].flat());
  for (const run of layer) {
    if (assignedRuns.has(run) || artwork.some(art => contains(art.box, center(run.box)))) continue;
    const overlaps = [...candidates, ...ruby].some(item => contains(item.box, center(run.box)));
    if (overlaps) continue;
    lines.push({ ...run, label: 1, chars: charactersOf([run], run.vertical), ruby: [] });
  }
  const mainLines = lines.filter(line => !artwork.some(art => contains(art.box, center(line.box))));
  const seen = new Set();
  for (let i = mainLines.length - 1; i >= 0; i--) {
    const line = mainLines[i];
    if (seen.has(line.text) && mainLines.some(other => other !== line && other.text === line.text &&
        (other.label === 16 || other.label === 2) && Math.hypot(
          center(line.box)[0] - center(other.box)[0], center(line.box)[1] - center(other.box)[1],
        ) < Math.max(18, height(line.box) * 1.6))) mainLines.splice(i, 1);
    else seen.add(line.text);
  }
  const readings = [];
  for (const region of ruby) {
    if (artwork.some(art => contains(art.box, center(region.box)))) continue;
    const reading = await recognize(page, region, regions.get(region));
    if (reading.text) readings.push(reading);
  }
  attachRuby(mainLines.length ? mainLines : lines, readings);

  const assets = [];
  let tableFallbacks = 0;
  for (const { box, label } of artwork) {
    const kind = label === 15 ? 'table' : 'figure';
    let table = null;
    if (kind === 'table' && structuredTables) {
      const cellLines = lines.filter(line => contains(box, center(line.box)));
      let cells = [];
      try { cells = await models.tableCells(page, box); } catch (error) {
        if (!/DeformConv|not implemented|kernel/i.test(String(error))) throw error;
      }
      table = buildTable(findGridCells(page, box), cellLines) ?? buildTable(cells, cellLines);
      if (!table) tableFallbacks++;
    }
    assets.push({ box, kind, image: await crop(page, box), captions: [], table });
  }
  const blocks = detections.filter(item => item.label === 0).map(item => item.box);
  if (!mainLines.length && readings.length) mainLines.push(...readings);
  return { ...arrangePage(mainLines, assets, blocks), tableFallbacks };
}

self.addEventListener('message', async event => {
  const { image, layer, assets, tables } = event.data;
  try {
    models ??= new OCRModels(assets, progress => self.postMessage({ progress }));
    const result = await processPage(image, layer, tables);
    const buffers = result.blocks.flatMap(block => block.image ? [block.image.buffer] : []);
    self.postMessage({ result }, buffers);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    image.close();
  }
});
