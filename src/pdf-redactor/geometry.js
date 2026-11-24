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

export function moveBox(box, dx, dy) {
  const x = clamp(dx, -box.left, 1 - box.right);
  const y = clamp(dy, -box.top, 1 - box.bottom);
  return { left: box.left + x, top: box.top + y, right: box.right + x, bottom: box.bottom + y };
}

export function resizeBox(box, corner, dx, dy, minWidth, minHeight) {
  const { left, top, right, bottom } = box;
  return {
    left: corner.includes('w') ? clamp(left + dx, 0, right - minWidth) : left,
    top: corner.includes('n') ? clamp(top + dy, 0, bottom - minHeight) : top,
    right: corner.includes('e') ? clamp(right + dx, left + minWidth, 1) : right,
    bottom: corner.includes('s') ? clamp(bottom + dy, top + minHeight, 1) : bottom,
  };
}
