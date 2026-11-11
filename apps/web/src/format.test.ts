import { describe, expect, it } from 'vitest';
import { compactUsd, monthLabel } from './format';

describe('format', () => {
  it('compactUsd: short axis labels from cents, with a true minus sign', () => {
    expect(compactUsd(0)).toBe('$0');
    expect(compactUsd(95_000)).toBe('$950');
    expect(compactUsd(1_234_567)).toBe('$12.3k');
    expect(compactUsd(-120_000_000)).toBe('−$1.2M');
  });
  it('monthLabel: year and month from a month index', () => {
    expect(monthLabel(0)).toBe('N1·T1');
    expect(monthLabel(13)).toBe('N2·T2');
  });
});
