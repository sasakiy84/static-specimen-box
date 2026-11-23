import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxBetween } from '../geometry.js';

test('creates the same rectangle whether dragged forwards or backwards', () => {
  const start = { x: .82, y: .63 };
  const end = { x: .17, y: .22 };
  assert.deepEqual(boxBetween(start, end), { left: .17, top: .22, right: .82, bottom: .63 });
  assert.deepEqual(boxBetween(start, end), boxBetween(end, start));
});
