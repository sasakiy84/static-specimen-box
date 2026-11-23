import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxBetween, pixelBounds } from '../geometry.js';

test('creates the same rectangle whether dragged forwards or backwards', () => {
  const start = { x: .82, y: .63 };
  const end = { x: .17, y: .22 };
  assert.deepEqual(boxBetween(start, end), { left: .17, top: .22, right: .82, bottom: .63 });
  assert.deepEqual(boxBetween(start, end), boxBetween(end, start));
});

test('rounds every edge outwards and adds a border so no selected pixel is skipped', () => {
  assert.deepEqual(pixelBounds({ left: .252, top: .103, right: .557, bottom: .704 }, 100, 200), {
    left: 24, top: 19, right: 57, bottom: 142,
  });
});

test('never writes beyond the image when the selection reaches a page edge', () => {
  assert.deepEqual(pixelBounds({ left: 0, top: 0, right: 1, bottom: 1 }, 51, 90), {
    left: 0, top: 0, right: 51, bottom: 90,
  });
});

test('rejects invalid masks instead of silently exporting uncovered pixels', () => {
  for (const box of [
    { left: -.1, top: 0, right: 1, bottom: 1 },
    { left: .5, top: 0, right: .5, bottom: 1 },
    { left: 0, top: NaN, right: 1, bottom: 1 },
    { left: 0, top: 0, right: 1, bottom: 1.1 },
  ]) assert.throws(() => pixelBounds(box, 100, 100), /黒塗り範囲が不正/);
});
