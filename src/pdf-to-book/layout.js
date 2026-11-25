export const width = box => box[2] - box[0];
export const height = box => box[3] - box[1];
export const center = box => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
const size = box => width(box) * height(box);
export const contains = (box, [x, y]) => box[0] <= x && x <= box[2] && box[1] <= y && y <= box[3];
export const frame = boxes => boxes.reduce((a, b) =>
  [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const overlap = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const spacing = (a, b) => Math.hypot(
  Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function joinLines(a, b) {
  if (!a || !b) return a + b;
  return a + (/[A-Za-z0-9.!?;:)]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? ' ' : '') + b;
}

function split(nodes, axis) {
  const sorted = [...nodes].sort((a, b) => a.box[axis] - b.box[axis]);
  let end = sorted[0].box[axis + 2];
  let best;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].box[axis] - end;
    if (gap > 3 && gap > (best?.gap ?? 0)) {
      best = { gap, before: sorted.slice(0, i), after: sorted.slice(i) };
    }
    end = Math.max(end, sorted[i].box[axis + 2]);
  }
  return best;
}

// Whitespace splits keep columns together even when their lines share baselines.
export function readingOrder(nodes, vertical, depth = 0) {
  if (nodes.length < 2) return nodes;
  const x = split(nodes, 0), y = split(nodes, 1);
  const preferX = x && x.gap * (vertical ? 1.3 : 1) > (y?.gap ?? 0);
  const cut = preferX ? x : y;
  if (cut && depth < 32) {
    const order = preferX && vertical ? [cut.after, cut.before] : [cut.before, cut.after];
    return order.flatMap(group => readingOrder(group, vertical, depth + 1));
  }
  return [...nodes].sort(vertical
    ? (a, b) => b.box[2] - a.box[2] || a.box[1] - b.box[1]
    : (a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}

export function orderedRuns(runs, vertical) {
  return [...runs].sort((a, b) => a.box[vertical ? 1 : 0] - b.box[vertical ? 1 : 0]);
}

export function charactersOf(runs, vertical) {
  return orderedRuns(runs, vertical).flatMap(({ text, box }) => {
    const chars = [...text];
    const advances = chars.map(value => /^[ -~]$/.test(value) ? .55 : 1);
    const axis = vertical ? 1 : 0;
    const scale = (box[axis + 2] - box[axis]) / advances.reduce((a, b) => a + b, 0);
    let start = box[axis];
    return chars.map((text, index) => {
      const end = start + scale * advances[index];
      const bounds = [...box];
      bounds[axis] = start;
      bounds[axis + 2] = end;
      start = end;
      return { text, box: bounds };
    });
  });
}

export function attachRuby(lines, readings) {
  for (const reading of readings) {
    if (!lines.length) break;
    const ranked = lines.map(line => {
      const axis = Number(line.vertical);
      const base = line.box;
      const ruby = reading.box;
      const separation = line.vertical ? ruby[0] - base[2] : base[1] - ruby[3];
      const gap = Math.max(0, base[axis] - ruby[axis + 2], ruby[axis] - base[axis + 2]);
      const undesiredSide = line.vertical ? center(ruby)[0] < center(base)[0] : center(ruby)[1] > center(base)[1];
      return { line, score: Math.abs(separation) + gap * 3 + (undesiredSide ? 3 * Math.max(1, base[3-axis] - base[1-axis]) : 0) };
    }).sort((a, b) => a.score - b.score);
    const { line } = ranked[0];
    const axis = Number(line.vertical);
    const mid = center(reading.box)[axis];
    const chars = line.chars;
    const candidates = chars.map((char, index) => ({ char, index })).filter(({ char }) => char.text.trim());
    if (!candidates.length) continue;
    const intersecting = candidates.filter(({ char }) => {
      const extent = Math.min(char.box[axis + 2], reading.box[axis + 2]) - Math.max(char.box[axis], reading.box[axis]);
      return extent >= (char.box[axis + 2] - char.box[axis]) * .38;
    });
    const chosen = intersecting.length ? intersecting : candidates.sort((a, b) =>
      Math.abs(center(a.char.box)[axis] - mid) - Math.abs(center(b.char.box)[axis] - mid)).slice(0, 1);
    const cjkChars = chosen.filter(({ char }) => cjk.test(char.text));
    const indices = cjkChars.length ? cjkChars : chosen;
    const first = indices[0].index;
    const last = indices.at(-1).index;
    line.ruby.push({ first, last, text: reading.text, position: mid });
  }
}

export function inlineText(line) {
  const ranges = [...line.ruby].sort((a, b) => a.first - b.first || a.position - b.position);
  const result = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const range = { ...ranges[i] };
    while (i + 1 < ranges.length && ranges[i + 1].first <= range.last) {
      const next = ranges[++i];
      range.last = Math.max(range.last, next.last);
      range.text += next.text;
    }
    const preceding = line.chars.slice(cursor, range.first).map(char => char.text).join('');
    if (preceding) result.push({ text: preceding });
    result.push({ text: line.chars.slice(range.first, range.last + 1).map(char => char.text).join(''), ruby: range.text });
    cursor = range.last + 1;
  }
  const tail = line.chars.slice(cursor).map(char => char.text).join('');
  if (tail) result.push({ text: tail });
  return result;
}

export function arrangePage(lines, regions, textBlocks) {
  const body = lines.filter(line => line.label !== 2);
  const vertical = body.filter(line => line.vertical).length > body.length / 2;
  for (const line of lines.filter(line => line.label === 2)) {
    if (!regions.length) {
      body.push(line);
      continue;
    }
    const preferred = /^(?:表|Table)\s*[\d０-９一二三四五六七八九十]/i.test(line.text) ? 'table' :
      /^(?:図|Figure|Fig\.)\s*[\d０-９一二三四五六七八九十]/i.test(line.text) ? 'figure' : null;
    const matching = regions.filter(region => region.kind === preferred);
    const options = matching.length ? matching : regions;
    const target = [...options].sort((a, b) => spacing(a.box, line.box) - spacing(b.box, line.box))[0];
    target.captions.push(line);
  }
  const groups = new Map();
  for (const line of body) {
    const format = line.label === 16 ? 'heading' : line.style === 7 || line.style === 8 ? 'list' :
      line.style >= 4 && line.style <= 6 ? 'heading' : 'paragraph';
    const candidates = textBlocks.filter(box => contains(box, center(line.box))).sort((a, b) => size(a) - size(b));
    const key = format === 'paragraph' ? candidates[0] ?? line : line;
    if (!groups.has(key)) groups.set(key, { kind: format, lines: [], level: line.style >= 4 && line.style <= 6 ? line.style - 3 : 2 });
    groups.get(key).lines.push(line);
  }
  const blocks = [...groups.values()].map(group => {
    const upright = group.lines.filter(line => line.vertical).length > group.lines.length / 2;
    const ordered = readingOrder(group.lines, upright);
    return {
      kind: group.kind, level: group.level, box: frame(ordered.map(line => line.box)),
      lines: ordered.map(line => ({ inline: inlineText(line), breakAfter: line.style === 2 })),
    };
  });
  for (const region of regions) {
    region.caption = readingOrder(region.captions, vertical).map(line => ({ inline: inlineText(line) }));
    delete region.captions;
  }
  return { vertical, blocks: readingOrder([...blocks, ...regions], vertical) };
}

function clusteredEdges(values, tolerance) {
  const clusters = [];
  for (const point of values.sort((a, b) => a - b)) {
    const last = clusters.at(-1);
    if (!last || point - last.center > tolerance) clusters.push({ center: point, count: 1 });
    else last.center += (point - last.center) / ++last.count;
  }
  return clusters.map(cluster => cluster.center);
}

export function buildTable(cellBoxes, lines) {
  if (cellBoxes.length < 2 || cellBoxes.length > 800) return null;
  const xs = clusteredEdges(cellBoxes.flatMap(box => [box[0], box[2]]), Math.max(2, Math.min(...cellBoxes.map(width)) * .18));
  const ys = clusteredEdges(cellBoxes.flatMap(box => [box[1], box[3]]), Math.max(2, Math.min(...cellBoxes.map(height)) * .18));
  const columns = xs.length - 1, rows = ys.length - 1;
  if (rows < 1 || columns < 1 || columns * rows > 4_000) return null;
  const nearest = (value, options) => options.reduce((best, point, index) =>
    Math.abs(point - value) < Math.abs(options[best] - value) ? index : best, 0);
  const occupied = new Set(), cells = [];
  for (const box of cellBoxes) {
    const column = nearest(box[0], xs), row = nearest(box[1], ys);
    const colspan = nearest(box[2], xs) - column, rowspan = nearest(box[3], ys) - row;
    if (rowspan < 1 || colspan < 1) continue;
    const slots = [];
    for (let y = row; y < row + rowspan; y++) {
      for (let x = column; x < column + colspan; x++) slots.push(y * columns + x);
    }
    if (slots.some(slot => occupied.has(slot))) continue;
    for (const slot of slots) occupied.add(slot);
    cells.push({ row, column, rowspan, colspan, box, lines: [] });
  }
  if (occupied.size < .55 * columns * rows) return null;
  for (const line of lines) {
    const target = [...cells].sort((a, b) =>
      overlap(b.box, line.box) - overlap(a.box, line.box) || spacing(a.box, line.box) - spacing(b.box, line.box))[0];
    target?.lines.push(line);
  }
  return { rows, columns, cells: cells.map(({ lines, box, ...cell }) => ({
    ...cell, text: readingOrder(lines, false).map(line => line.text).reduce(joinLines, ''),
  })) };
}
