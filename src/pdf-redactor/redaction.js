import * as editor from '@fabifont/open-redact-pdf';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFontEmbedder, StandardFonts, decodePDFRawStream } from 'pdf-lib';

const pageKeys = new Set([
  'Type', 'Parent', 'Resources', 'MediaBox', 'CropBox', 'Rotate', 'BleedBox', 'TrimBox',
  'ArtBox', 'UserUnit', 'Contents', 'Group',
]);
const privateKeys = ['Metadata', 'PieceInfo', 'AF', 'StructParent', 'StructParents', 'ActualText', 'Alt'];
const invalidPage = 'このページには文字削除に対応していない PDF 要素が含まれています。';
const standardFonts = new Set(Object.values(StandardFonts));
const streamDelimiter = String.raw`[\x00\t\n\f\r ()<>\[\]{}\/%]`;
const unsupportedContent = new RegExp(
  `(?:^|${streamDelimiter})BI(?=$|${streamDelimiter})|/(?:ActualText|Alt|E|OC)(?=$|${streamDelimiter})`,
);

function prepareFont(font) {
  const name = key => font.lookupMaybe(PDFName.of(key), PDFName)?.decodeText();
  if (name('Subtype') === 'Type0') {
    const descendants = font.lookup(PDFName.of('DescendantFonts'), PDFArray);
    const layer = descendants.lookup(0, PDFDict);
    const cidWidths = layer.lookupMaybe(PDFName.of('W'), PDFArray);
    if (cidWidths) layer.set(PDFName.of('W'), cidWidths);
    const defaultWidth = layer.lookupMaybe(PDFName.of('DW'), PDFNumber);
    if (defaultWidth) layer.set(PDFName.of('DW'), defaultWidth);
    return;
  }
  const widths = font.lookupMaybe(PDFName.of('Widths'), PDFArray);
  if (widths) {
    // エンジンの幅の推定値を避け、未定義の文字幅には PDF の MissingWidth を使う。
    const first = font.lookup(PDFName.of('FirstChar'), PDFNumber).asNumber();
    if (!Number.isInteger(first) || first < 0 || first + widths.size() > 256) throw new Error(invalidPage);
    const descriptor = font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    const missing = descriptor?.lookupMaybe(PDFName.of('MissingWidth'), PDFNumber)?.asNumber() ?? 0;
    const normalized = Array(256).fill(missing);
    for (let index = 0; index < widths.size(); index++) {
      normalized[first + index] = widths.lookup(index, PDFNumber).asNumber();
    }
    font.set(PDFName.of('FirstChar'), PDFNumber.of(0));
    font.set(PDFName.of('LastChar'), PDFNumber.of(255));
    font.set(PDFName.of('Widths'), font.context.obj(normalized));
    return;
  }

  const base = name('BaseFont');
  const encoding = name('Encoding');
  if (!standardFonts.has(base) || (encoding && !['WinAnsiEncoding', 'StandardEncoding'].includes(encoding))) {
    throw new Error(invalidPage);
  }
  const standard = StandardFontEmbedder.for(base);
  const normalized = Array(256).fill(0);
  if (encoding === 'WinAnsiEncoding') {
    for (const point of standard.encoding.supportedCodePoints) {
      const { code, name: glyph } = standard.encoding.encodeUnicodeCodePoint(point);
      normalized[code] = standard.font.getWidthOfGlyph(glyph) ?? 0;
    }
  } else {
    for (const { C, WX } of standard.font.CharMetrics) {
      if (C >= 0 && C < 256) normalized[C] = WX;
    }
  }
  font.set(PDFName.of('FirstChar'), PDFNumber.of(0));
  font.set(PDFName.of('LastChar'), PDFNumber.of(255));
  font.set(PDFName.of('Widths'), font.context.obj(normalized));
}

function checkPageContent({ node }) {
  const resources = node.Resources();
  // ネストした描画や画像に文字が残る可能性があるページは書き出さない。
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (xObjects?.keys().length) {
    throw new Error('画像や埋め込みの描画を含むページでは、文字を削除できません。');
  }
  if (['Pattern', 'Shading', 'Properties'].some(key => resources?.has(PDFName.of(key)))) {
    throw new Error(invalidPage);
  }
  const states = resources?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  if (states?.keys().some(name => {
    const state = states.lookup(name, PDFDict);
    const mask = state.get(PDFName.of('SMask'));
    return (mask && mask !== PDFName.of('None')) || state.has(PDFName.of('Font'));
  })) throw new Error(invalidPage);

  const contents = node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map(ref => node.context.lookup(ref))
    : [contents].filter(Boolean);
  for (const stream of streams) {
    if (!(stream instanceof PDFRawStream)) throw new Error(invalidPage);
    const text = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
      .replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    if (unsupportedContent.test(text)) throw new Error(invalidPage);
  }
}

function toTarget(box, pageIndex, preview, size) {
  const viewport = preview.getViewport({ scale: 1 / preview.userUnit });
  const canonical = preview.getViewport({ scale: 1 / preview.userUnit, dontFlip: true });
  if (Math.abs(viewport.width - size.width) > .001 || Math.abs(viewport.height - size.height) > .001) {
    throw new Error('PDF のページ範囲を確認できませんでした。');
  }
  const { left, top, right, bottom } = box;
  if (![left, top, right, bottom].every(Number.isFinite) ||
      left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
    throw new Error('黒塗り範囲が不正です。');
  }
  const [startX, startY] = canonical.convertToViewportPoint(
    ...viewport.convertToPdfPoint(left * viewport.width, top * viewport.height),
  );
  const [endX, endY] = canonical.convertToViewportPoint(
    ...viewport.convertToPdfPoint(right * viewport.width, bottom * viewport.height),
  );
  return {
    kind: 'rect', pageIndex, x: Math.min(startX, endX), y: Math.min(startY, endY),
    width: Math.abs(endX - startX), height: Math.abs(endY - startY),
  };
}

function removePrivateData(object, visited) {
  if (visited.has(object)) return;
  if (object instanceof PDFRawStream) object = object.dict;
  visited.add(object);
  if (object instanceof PDFDict) {
    for (const key of privateKeys) object.delete(PDFName.of(key));
    for (const [, value] of object.entries()) removePrivateData(value, visited);
  } else if (object instanceof PDFArray) {
    for (const value of object.asArray()) removePrivateData(value, visited);
  }
}

export async function exportPdf(source, masks) {
  const bytes = await source.getData();
  const options = { updateMetadata: false, throwOnInvalidObject: true };
  const original = await PDFDocument.load(bytes, options);
  if (original.catalog.has(PDFName.of('OCProperties'))) {
    throw new Error('レイヤーを含む PDF には対応していません。');
  }
  const previews = new Map();
  const checkedFonts = new Set();
  for (const page of new Set(masks.map(mask => mask.page))) {
    try {
      if (!Number.isInteger(page) || page < 1 || page > source.numPages) throw new Error(invalidPage);
      const originalPage = original.getPage(page - 1);
      checkPageContent(originalPage);
      const preview = await source.getPage(page);
      const { x, y, width, height } = originalPage.getCropBox();
      const pageBounds = [x, y, x + width, y + height];
      if (preview.view.some((coordinate, index) => Math.abs(coordinate - pageBounds[index]) > .001)) {
        throw new Error('PDF のページ範囲を確認できませんでした。');
      }
      const fonts = originalPage.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
      for (const key of fonts?.keys() ?? []) {
        const font = fonts.lookup(key, PDFDict);
        if (!checkedFonts.has(font)) {
          prepareFont(font);
          checkedFonts.add(font);
        }
      }
      previews.set(page, preview);
    } catch (error) {
      throw new Error(`${page} ページ目を処理できませんでした。 ${error.message}`, { cause: error });
    }
  }

  await editor.initWasm();
  const input = editor.openPdf(await original.save());
  try {
    const targets = [];
    for (const { page, box } of masks) {
      const preview = previews.get(page);
      targets.push(toTarget(box, page - 1, preview, editor.getPageSize(input, page - 1)));
    }
    const report = editor.applyRedactions(input, { targets, mode: 'redact' });
    if (report.warnings.length) throw new Error(invalidPage);
    if (!report.textGlyphsRemoved) throw new Error('選択範囲に削除できる文字がありません。');

    // 新規の文書にページだけを移し、添付・フォーム・保存履歴や未参照オブジェクトを落とす。
    const redacted = await PDFDocument.load(editor.savePdf(input), options);
    const visited = new Set();
    for (const [, object] of redacted.context.enumerateIndirectObjects()) removePrivateData(object, visited);
    for (const { node } of redacted.getPages()) {
      for (const key of node.keys()) {
        if (!pageKeys.has(key.decodeText())) node.delete(key);
      }
    }
    const output = await PDFDocument.create({ updateMetadata: false });
    for (const page of await output.copyPages(redacted, redacted.getPageIndices())) output.addPage(page);
    return new Blob([await output.save()], { type: 'application/pdf' });
  } finally {
    editor.freePdf(input);
  }
}
