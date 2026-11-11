/** Thang bậc ba cho thanh kéo marketing: vị trí 0…1000 ↔ giá trị 0…max, mịn ở khoảng nhỏ. */
const TRACK = 1000;

export function fromCubicPosition(position: number, max: number, step: number): number {
  const t = Math.min(TRACK, Math.max(0, position)) / TRACK;
  return Math.min(max, Math.round((max * t ** 3) / step) * step);
}

export function toCubicPosition(value: number, max: number): number {
  return Math.round(Math.cbrt(Math.min(max, Math.max(0, value)) / max) * TRACK);
}

export const CUBIC_TRACK = TRACK;
