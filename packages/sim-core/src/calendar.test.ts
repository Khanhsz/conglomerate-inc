import { describe, expect, it } from 'vitest';
import { firstDayOfMonth, lastDayOfMonth, monthOf } from './calendar';

describe('calendar (360-day year)', () => {
  it('maps days to months', () => {
    expect(monthOf(0)).toBe(0);
    expect(monthOf(29)).toBe(0);
    expect(monthOf(30)).toBe(1);
    expect(monthOf(359)).toBe(11);
    expect(monthOf(360)).toBe(12);
  });

  it('gives month boundaries (inclusive)', () => {
    expect(firstDayOfMonth(0)).toBe(0);
    expect(lastDayOfMonth(0)).toBe(29);
    expect(firstDayOfMonth(1)).toBe(30);
    expect(lastDayOfMonth(11)).toBe(359);
  });

  it('rejects negative or fractional input', () => {
    expect(() => monthOf(-1)).toThrow();
    expect(() => monthOf(1.5)).toThrow();
    expect(() => firstDayOfMonth(-1)).toThrow();
    expect(() => lastDayOfMonth(0.5)).toThrow();
  });
});
