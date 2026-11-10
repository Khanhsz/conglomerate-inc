import { describe, expect, it } from 'vitest';
import { DAYS_PER_MONTH, DAYS_PER_YEAR, MONTHS_PER_YEAR } from './index';

describe('sim-core scaffold', () => {
  it('uses the 360-day calendar', () => {
    expect(DAYS_PER_MONTH).toBe(30);
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(DAYS_PER_YEAR).toBe(360);
  });
});
