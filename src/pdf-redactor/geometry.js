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
