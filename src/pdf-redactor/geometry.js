export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function boxBetween(start, end) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function pixelBounds(box, width, height) {
  const { left, top, right, bottom } = box;
  if (![left, top, right, bottom].every(Number.isFinite) ||
      left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
    throw new Error('黒塗り範囲が不正です。');
  }
  // 範囲の境界は外側へ丸め、アンチエイリアス分も１画素覆う。
  return {
    left: Math.max(0, Math.floor(left * width) - 1),
    top: Math.max(0, Math.floor(top * height) - 1),
    right: Math.min(width, Math.ceil(right * width) + 1),
    bottom: Math.min(height, Math.ceil(bottom * height) + 1),
  };
}
