import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxBetween, moveBox, resizeBox } from '../geometry.js';

test('creates the same rectangle whether dragged forwards or backwards', () => {
  const start = { x: .82, y: .63 };
  const end = { x: .17, y: .22 };
  assert.deepEqual(boxBetween(start, end), { left: .17, top: .22, right: .82, bottom: .63 });
  assert.deepEqual(boxBetween(start, end), boxBetween(end, start));
});

test('moving against the page edge preserves the size of the mask', () => {
  const moved = moveBox({ left: .25, top: .25, right: .5, bottom: .5 }, -1, 1);
  assert.deepEqual(moved, { left: 0, top: .75, right: .25, bottom: 1 });
});

test('resizing keeps the opposite corner fixed and stops at the minimum size', () => {
  const resized = resizeBox({ left: .25, top: .25, right: .5, bottom: .5 }, 'nw', 1, -1, .125, .125);
  assert.deepEqual(resized, { left: .375, top: 0, right: .5, bottom: .5 });
});
