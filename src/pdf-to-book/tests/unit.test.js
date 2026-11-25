import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { arrangePage, attachRuby, buildTable, charactersOf, inlineText, readingOrder, withoutPageFurniture } from '../layout.js';
import { createEpub, createMarkdown } from '../exports.js';

test('横書きのルビは重なっている熟語にまとめて付く', () => {
  const box = [0, 20, 100, 40];
  const line = { box, vertical: false, chars: charactersOf([{ text: '国立図書館', box }], false), ruby: [] };
  attachRuby([line], [{ text: 'としょかん', box: [42, 11, 98, 19] }]);
  assert.deepEqual(inlineText(line), [{ text: '国立' }, { text: '図書館', ruby: 'としょかん' }]);
});

test('縦書きのルビは紙面で最も近い列に付く', () => {
  const lines = [10, 65].map(x => {
    const box = [x, 0, x + 20, 80];
    return { box, vertical: true, chars: charactersOf([{ text: '図書館へ', box }], true), ruby: [] };
  });
  attachRuby(lines, [{ text: 'としょかん', box: [87, 0, 98, 58] }]);
  assert.deepEqual(inlineText(lines[1]), [{ text: '図書館', ruby: 'としょかん' }, { text: 'へ' }]);
  assert.deepEqual(readingOrder(lines, true), [lines[1], lines[0]]);
});

test('本文と柱をまたぐ文字列から柱に対応する部分だけを除く', () => {
  const horizontal = [{ text: '本文柱本文', box: [0, 10, 50, 20], vertical: false }];
  const vertical = [{ text: '本文柱本文', box: [10, 0, 20, 50], vertical: true }];
  assert.deepEqual(withoutPageFurniture(horizontal, [[20, 11, 30, 19]]), [
    { text: '本文', box: [0, 10, 20, 20], vertical: false },
    { text: '本文', box: [30, 10, 50, 20], vertical: false },
  ]);
  assert.deepEqual(withoutPageFurniture(vertical, [[11, 20, 19, 30]]), [
    { text: '本文', box: [10, 0, 20, 20], vertical: true },
    { text: '本文', box: [10, 30, 20, 50], vertical: true },
  ]);
});

test('ノンブルと同じ数字や領域の端にわずかに重なる文字を残す', () => {
  const runs = [
    { text: '19', box: [0, 90, 20, 110], vertical: false },
    { text: '19', box: [60, 90, 80, 110], vertical: false },
    { text: '注', box: [15, 90, 30, 110], vertical: false },
  ];
  assert.deepEqual(withoutPageFurniture(runs, [[0, 93, 20, 108]]), runs.slice(1));
});

function row(text, box, vertical = false, label = 1) {
  return { text, box, vertical, label, chars: charactersOf([{ text, box }], vertical), ruby: [] };
}

const paragraphs = result => result.blocks.filter(block => block.kind === 'paragraph').map(block =>
  block.lines.map(line => line.inline.map(item => item.text).join('')));

test('横二段の本文は字下げで分け、文の途中では右段に続ける', () => {
  const result = arrangePage([
    row('左段の段落がここから始まる', [10, 20, 200, 36]),
    row('段落の末尾。', [10, 47, 100, 63]),
    row('左段の次の段落は右段の先頭に', [26, 74, 200, 90]),
    row('またがって続く。さらに同じ段落が', [230, 20, 420, 36]),
    row('右段で続く。', [230, 47, 328, 63]),
    row('右段の新しい段落。', [246, 74, 355, 90]),
  ], []);
  assert.deepEqual(paragraphs(result), [
    ['左段の段落がここから始まる', '段落の末尾。'],
    ['左段の次の段落は右段の先頭に', 'またがって続く。さらに同じ段落が', '右段で続く。'],
    ['右段の新しい段落。'],
  ]);
});

test('同じ行の句点を戻し、注の折り返しを表のキャプションから分ける', () => {
  const result = arrangePage([
    row('本文の句点', [10, 20, 100, 36]),
    row('。', [95, 20, 110, 36]),
    row('表 1 概要', [10, 60, 74, 75], false, 2),
    row('（12）注の続きは', [10, 192, 150, 205], false, 2),
    row('次の行にある。', [24, 214, 144, 227], false, 4),
    row('（13）新しい注。', [10, 236, 144, 249], false, 2),
  ], [{ kind: 'table', box: [10, 78, 200, 175], captions: [] }]);
  assert.deepEqual(paragraphs(result), [['本文の句点。'], ['（12）注の続きは', '次の行にある。'], ['（13）新しい注。']]);
  assert.deepEqual(result.blocks.find(block => block.kind === 'table').caption, [{ inline: [{ text: '表 1 概要' }] }]);
});

test('縦書きの見開きは右ページの上段と下段を読んでから左ページに移る', () => {
  const lines = [];
  for (const [page, right] of [['右', 600], ['左', 270]]) {
    for (const [tier, top] of [['上', 20], ['下', 260]]) {
      lines.push(row(page + tier + 'の一行目から続いて', [right - 16, top, right, top + 180], true));
      lines.push(row(page + tier + 'の二行目で終わる。', [right - 43, top, right - 27, top + 177], true));
    }
  }
  assert.deepEqual(paragraphs(arrangePage(lines.reverse(), [])).map(lines => lines.map(text => text.slice(0, 2))),
    [['右上', '右上'], ['右下', '右下'], ['左上', '左上'], ['左下', '左下']]);
});

test('Markdownは結合セルと括弧ルビ、EPUBは表画像とXHTMLルビを持つ', async () => {
  const table = buildTable([[0, 0, 200, 50], [0, 50, 100, 100], [100, 50, 200, 100]],
    [{ text: '見出し', box: [20, 10, 150, 30] }, { text: '行', box: [10, 60, 70, 90] }]);
  const pages = [{ number: 1, blocks: [
    { kind: 'paragraph', lines: [{ inline: [{ text: '図書館', ruby: 'としょかん' }] }] },
    { kind: 'table', table, caption: [{ inline: [{ text: '表1 概要' }] }], image: Uint8Array.of(1, 2, 3) },
    { kind: 'figure', caption: [], image: Uint8Array.of(4, 5, 6) },
  ] }];
  const markdown = await createMarkdown('資料 & 図表', pages);
  assert.match(strFromU8(markdown.text), /図書館（としょかん）/);
  assert.match(strFromU8(markdown.text), /colspan="2">見出し/);
  assert.deepEqual(unzipSync(markdown.bundle)['images/p1-3.png'], Uint8Array.of(4, 5, 6));
  const epub = await createEpub('資料 & 図表', pages, 'ja', true);
  const header = new DataView(epub.buffer, epub.byteOffset, epub.byteLength);
  assert.equal(header.getUint16(8, true), 0);
  assert.equal(strFromU8(epub.subarray(30, 38)), 'mimetype');
  const archive = unzipSync(epub);
  const chapter = strFromU8(archive['EPUB/chapter-1.xhtml']);
  assert.match(chapter, /<ruby>図書館<rp>（<\/rp><rt>としょかん<\/rt>/);
  assert.match(chapter, /<figcaption>表1 概要<\/figcaption>/);
  assert.deepEqual(archive['EPUB/images/p1-2.png'], Uint8Array.of(1, 2, 3));
  assert.match(strFromU8(archive['EPUB/book.opf']), /資料 &amp; 図表/);
});
