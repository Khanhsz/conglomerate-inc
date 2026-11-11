import { describe, expect, it } from 'vitest';
import { fromCubicPosition, toCubicPosition } from './sliderScale';

describe('cubic slider scale (marketing 0 … $1M)', () => {
  const max = 100_000_000;
  it('maps the ends exactly and rounds to the step', () => {
    expect(fromCubicPosition(0, max, 1_000)).toBe(0);
    expect(fromCubicPosition(1000, max, 1_000)).toBe(max);
    expect(fromCubicPosition(500, max, 1_000) % 1_000).toBe(0);
  });

  it('gives fine control at small budgets (first third of the track < 4% of max)', () => {
    expect(fromCubicPosition(333, max, 1_000)).toBeLessThan(0.04 * max);
  });

  it('is monotone: moving the thumb right never lowers the budget', () => {
    let prev = -1;
    for (let pos = 0; pos <= 1000; pos++) {
      const v = fromCubicPosition(pos, max, 1_000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('places a value at the position that reproduces it within one step at mid budgets', () => {
    for (const v of [1_000_000, 5_000_000, 20_000_000, 60_000_000]) {
      const back = fromCubicPosition(toCubicPosition(v, max), max, 1_000);
      expect(Math.abs(back - v) / v).toBeLessThan(0.01);
    }
  });
});
