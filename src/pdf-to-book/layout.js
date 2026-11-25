export const width = box => box[2] - box[0];
export const height = box => box[3] - box[1];
export const center = box => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
export const contains = (box, [x, y]) => box[0] <= x && x <= box[2] && box[1] <= y && y <= box[3];
export const frame = boxes => boxes.reduce((a, b) =>
  [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
export const overlap = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const spacing = (a, b) => Math.hypot(
  Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function joinLines(a, b) {
  if (!a || !b) return a + b;
  return a + (/[A-Za-z0-9.!?;:)]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? ' ' : '') + b;
}

function split(nodes, axis, minimumGap = 3) {
  const sorted = [...nodes].sort((a, b) => a.box[axis] - b.box[axis]);
  let end = sorted[0].box[axis + 2];
  let best;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].box[axis] - end;
    if (gap > minimumGap && gap > (best?.gap ?? 0)) {
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

const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * fraction)];
};

// 縦書きも、文字が進む向きと行が進む向きの座標に直して同じ規則で処理する。
const flowBox = ({ box: [left, top, right, bottom], vertical }) => vertical
  ? [top, -right, bottom, -left] : [left, top, right, bottom];
const lineSize = line => line.vertical ? width(line.box) : height(line.box);
const sentenceEnd = /[。！？.!?][」』）】”’"'）)]*$/u;
const noteStart = /^(?:[（(]\s*[0-9０-９]+\s*[）)]|[注註]\s*[0-9０-９]+)/u;

function stitchLines(lines) {
  const rows = [];
  for (const line of [...lines].sort((a, b) => flowBox(a)[0] - flowBox(b)[0])) {
    const [start, top, , bottom] = flowBox(line);
    const em = bottom - top;
    const inline = inlineText(line);
    let nearest;
    let nearestGap = Infinity;
    for (const row of rows) {
      if (row.vertical !== line.vertical) continue;
      const [, rowTop, rowEnd, rowBottom] = flowBox(row);
      const gap = start - rowEnd;
      const shared = Math.min(bottom, rowBottom) - Math.max(top, rowTop);
      if (gap < -em * .5 || gap > em * .8 || shared < .7 * Math.max(em, rowBottom - rowTop)) continue;
      if (Math.abs(gap) < nearestGap) {
        nearest = row;
        nearestGap = Math.abs(gap);
      }
    }
    if (nearest) {
      const text = joinLines(nearest.text, line.text);
      if (text.length > nearest.text.length + line.text.length) nearest.inline.push({ text: ' ' });
      nearest.inline.push(...inline);
      nearest.text = text;
      nearest.box = frame([nearest.box, line.box]);
    } else {
      rows.push({ ...line, inline });
    }
  }
  return rows;
}

// 段間を先に分ける。ページを横切る見出しや図表があれば、そこで段の構成を切り替える。
function readingZones(nodes, vertical, em, depth = 0) {
  if (nodes.length < 2 || depth >= 24) return [nodes];
  const x = split(nodes, 0, em * (vertical ? 1.15 : .85));
  const y = split(nodes, 1, em * (vertical ? .85 : 1.15));
  const preferX = x && (vertical ? x.gap >= (y?.gap ?? 0) : true);
  const cut = preferX ? x : y;
  if (!cut) return [nodes];
  const order = preferX && vertical ? [cut.after, cut.before] : [cut.before, cut.after];
  return order.flatMap(group => readingZones(group, vertical, em, depth + 1));
}

function paragraphLines(previous, next, lane, note) {
  if (previous.vertical !== next.vertical) return false;
  const [aStart, aTop, aEnd, aBottom] = flowBox(previous);
  const [bStart, bTop, bEnd, bBottom] = flowBox(next);
  const em = Math.max(aBottom - aTop, bBottom - bTop);
  const advance = (bTop + bBottom - aTop - aBottom) / 2;
  if (Math.min(lineSize(previous), lineSize(next)) < em * .68 ||
      advance < em * .62 || advance > lane.pitch * 1.5 ||
      Math.min(aEnd, bEnd) <= Math.max(aStart, bStart)) return false;
  if (next.note) return false;
  if (note) return bStart >= lane.start - em * .35;
  if (bStart - lane.start > em * .62 && bStart - aStart > em * .53) return false;
  const short = lane.end - aEnd > em * 1.15;
  return !short || (!sentenceEnd.test(previous.text) && aEnd - aStart > (lane.end - lane.start) * .68);
}

function flowParagraphs(nodes, vertical, boxSize) {
  const blocks = [];
  let previousLane;
  for (const zone of readingZones(nodes, vertical, boxSize)) {
    const body = zone.filter(node => node.kind === 'paragraph' && node.vertical === vertical);
    const normal = body.filter(line => lineSize(line) >= boxSize * .7);
    const measure = normal.length >= 2 ? normal : body;
    const boxes = measure.map(flowBox).sort((a, b) => a[1] - b[1]);
    const advances = boxes.slice(1).map((box, i) => (box[1] + box[3] - boxes[i][1] - boxes[i][3]) / 2)
      .filter(gap => gap > boxSize * .65 && gap < boxSize * 3);
    const lane = boxes.length ? {
      start: quantile(boxes.map(box => box[0]), .2),
      end: quantile(boxes.map(box => box[2]), .8),
      pitch: quantile(advances, .5) ?? boxSize * 1.65,
      box: frame(boxes),
      count: boxes.length,
    } : null;
    const ordered = readingOrder(zone, vertical);
    let prior;
    let note = false;
    for (const node of ordered) {
      if (node.captions) {
        blocks.push(node);
        prior = undefined;
        note = false;
        continue;
      }
      const last = blocks.at(-1);
      const continues = prior?.kind === 'paragraph' && node.kind === 'paragraph' &&
        paragraphLines(prior, node, lane && node.vertical === vertical ? lane
          : { start: flowBox(prior)[0], end: flowBox(prior)[2], pitch: lineSize(prior) * 1.65 }, note);
      const wraps = !prior && node === ordered[0] && node.kind === 'paragraph' && last?.kind === 'paragraph' &&
        node.vertical === vertical && previousLane?.last && lane && lane.count >= 3 && previousLane.count >= 3 &&
        lane.box[0] > previousLane.box[2] && lane.box[1] < previousLane.box[3] - boxSize * 3 &&
        Math.abs(lineSize(previousLane.last) - lineSize(node)) <= boxSize * .4 && !node.note &&
        !sentenceEnd.test(previousLane.last.text) && flowBox(previousLane.last)[2] >= previousLane.end - boxSize &&
        flowBox(node)[0] < lane.start + boxSize * .58;
      if (continues || wraps) {
        last.box = frame([last.box, node.box]);
        last.lines.push({ inline: node.inline, breakAfter: node.style === 2 });
      } else {
        blocks.push({ kind: node.kind, level: node.level, box: node.box,
          lines: [{ inline: node.inline, breakAfter: node.style === 2 }] });
        note = node.note;
      }
      prior = node;
    }
    previousLane = lane && { ...lane, last: prior?.vertical === vertical ? prior : undefined };
  }
  return blocks;
}

export function arrangePage(lines, regions) {
  const body = lines.filter(line => line.label !== 2);
  const vertical = body.filter(line => line.vertical).length > body.length / 2;
  const em = quantile(body.filter(line => line.vertical === vertical).map(lineSize), .5) ?? 10;
  for (const line of lines.filter(line => line.label === 2)) {
    const preferred = /^(?:表|Table)\s*[\d０-９一二三四五六七八九十]/i.test(line.text) ? 'table' :
      /^(?:図|Figure|Fig\.)\s*[\d０-９一二三四五六七八九十]/i.test(line.text) ? 'figure' : null;
    const matching = regions.filter(region => region.kind === preferred);
    const options = matching.length ? matching : regions;
    const target = [...options].sort((a, b) => spacing(a.box, line.box) - spacing(b.box, line.box))[0];
    const knownCaption = preferred || /^[（(]?(?:出典|資料|Source)\s*[）):：]/i.test(line.text);
    const inlineAxis = line.vertical ? 1 : 0;
    const crossAxis = 1 - inlineAxis;
    const middle = center(line.box);
    const alongside = target && middle[inlineAxis] >= target.box[inlineAxis] - em &&
      middle[inlineAxis] <= target.box[inlineAxis + 2] + em &&
      (middle[crossAxis] < target.box[crossAxis] + em * .5 || middle[crossAxis] > target.box[crossAxis + 2] - em * .5);
    if (target && (knownCaption || alongside) && !noteStart.test(line.text) &&
        spacing(target.box, line.box) <= Math.max(em, lineSize(line)) * (knownCaption ? 4 : 1.8)) {
      target.captions.push(line);
    } else {
      body.push({ ...line, label: 4 });
    }
  }
  const rows = stitchLines(body);
  const long = rows.filter(line => line.vertical === vertical && line.label !== 16 &&
    (vertical ? height(line.box) : width(line.box)) > em * 7);
  const pageTop = quantile(long.map(line => line.box[1]), .03);
  const pageBottom = quantile(long.map(line => line.box[3]), .97);
  const lowerPage = (pageTop + pageBottom * 2) / 3;
  const footnotes = vertical ? [] : rows.filter(line => line.box[1] > lowerPage &&
    (line.label === 4 || (lineSize(line) < em * .93 && noteStart.test(line.text))));
  const firstFootnote = Math.min(...footnotes.map(line => line.box[1]));
  const lastFootnote = Math.max(...footnotes.map(line => line.box[3]));
  const headers = [], footers = [], content = [];
  for (const line of rows) {
    const styleHeading = line.style >= 4 && line.style <= 6;
    const inNotes = line.box[1] >= firstFootnote - em * .2 && line.box[1] <= lastFootnote + em * 2 &&
      lineSize(line) < em * .96;
    const kind = line.style === 7 || line.style === 8 ? 'list' :
      !inNotes && (line.label === 16 || styleHeading) ? 'heading' : 'paragraph';
    const row = { ...line, kind, level: styleHeading ? line.style - 3 : 2,
      note: (inNotes || line.label === 4) && noteStart.test(line.text) };
    const short = (line.vertical ? height(line.box) : width(line.box)) < em * 7;
    if (long.length >= 4 && short && row.kind === 'paragraph' && line.box[3] < pageTop - em * 1.25) headers.push(row);
    else if (long.length >= 4 && short && !row.note && row.kind === 'paragraph' &&
      line.box[1] > pageBottom + em * (vertical ? .45 : 1.25) &&
      (!vertical || /^[0-9０-９一二三四五六七八九十〇]+$/u.test(line.text))) footers.push(row);
    else content.push(row);
  }
  const blocks = [
    ...flowParagraphs(headers, vertical, em),
    ...flowParagraphs([...content, ...regions], vertical, em),
    ...flowParagraphs(footers, vertical, em),
  ];
  for (const region of regions) {
    region.caption = readingOrder(region.captions, vertical).map(line => ({ inline: inlineText(line) }));
    delete region.captions;
  }
  return { vertical, blocks };
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
