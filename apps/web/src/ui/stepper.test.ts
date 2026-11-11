import { describe, expect, it } from 'vitest';
import { stepValue } from './stepper';

describe('stepValue (−/+ buttons)', () => {
  const staff = { min: 2, max: 40, step: 1 };
  const loan = { min: 100_000, max: 50_000_000, step: 100_000 };

  it('moves one step and clamps at both ends', () => {
    expect(stepValue(4, 1, staff)).toBe(5);
    expect(stepValue(4, -1, staff)).toBe(3);
    expect(stepValue(2, -1, staff)).toBe(2);
    expect(stepValue(40, 1, staff)).toBe(40);
  });

  it('snaps an off-grid value to the next grid point in the pressed direction', () => {
    expect(stepValue(150_000, 1, loan)).toBe(200_000);
    expect(stepValue(150_000, -1, loan)).toBe(100_000);
    expect(stepValue(60_000_000, -1, loan)).toBe(50_000_000);
  });
});
