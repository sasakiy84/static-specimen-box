import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { attachRuby, buildTable, charactersOf, inlineText, readingOrder } from '../layout.js';
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
