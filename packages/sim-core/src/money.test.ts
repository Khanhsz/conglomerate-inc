import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  fromFloatCents,
  isMoney,
  money,
  MoneyError,
  mul,
  pct,
  roundHalfAwayFromZero,
  sub,
  sum,
  toDisplay,
  ZERO,
  type Money,
} from './money';

const MAX = Number.MAX_SAFE_INTEGER;
const safeInt = fc.integer({ min: -1e12, max: 1e12 });

describe('money()', () => {
  it('accepts safe integers', () => {
    expect(money(0)).toBe(0);
    expect(money(-150)).toBe(-150);
    expect(money(MAX)).toBe(MAX);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, MAX + 1, -(MAX + 1)])(
    'rejects %s',
    (n) => {
      expect(() => money(n)).toThrow(MoneyError);
    },
  );

  it('normalises -0 to 0', () => {
    expect(Object.is(money(-0), 0)).toBe(true);
  });

  it('isMoney mirrors the money() precondition', () => {
    expect(isMoney(12)).toBe(true);
    expect(isMoney(1.2)).toBe(false);
    expect(isMoney(Number.NaN)).toBe(false);
  });
});

describe('roundHalfAwayFromZero', () => {
  it.each([
    [2.5, 3],
    [-2.5, -3],
    [0.5, 1],
    [-0.5, -1],
    [1.4999999, 1],
    [-1.4999999, -1],
    [1.5000001, 2],
    [3, 3],
    [-3, -3],
  ])('%s → %s', (x, expected) => {
    expect(roundHalfAwayFromZero(x)).toBe(expected);
  });

  it('never returns -0', () => {
    expect(Object.is(roundHalfAwayFromZero(-0.4), 0)).toBe(true);
    expect(Object.is(roundHalfAwayFromZero(-0), 0)).toBe(true);
  });

  it('throws on non-finite input', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN)).toThrow(MoneyError);
    expect(() => roundHalfAwayFromZero(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('property: odd symmetry and error ≤ 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
        const r = roundHalfAwayFromZero(x);
        expect(Number.isInteger(r)).toBe(true);
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.5);
        expect(roundHalfAwayFromZero(-x)).toBe(r === 0 ? 0 : -r);
      }),
    );
  });
});

describe('add / sub / sum', () => {
  it('adds and subtracts', () => {
    expect(add(money(150), money(-50))).toBe(100);
    expect(sub(money(150), money(200))).toBe(-50);
    expect(sum([])).toBe(ZERO);
    expect(sum([money(1), money(2), money(3)])).toBe(6);
  });

  it('throws when the result leaves the safe integer range', () => {
    expect(() => add(money(MAX), money(1))).toThrow(MoneyError);
    expect(() => sub(money(-MAX), money(1))).toThrow(MoneyError);
    expect(() => sum([money(MAX), money(1), money(-5)])).toThrow(MoneyError);
  });

  it('property: sum equals left fold of add and is order-independent', () => {
    fc.assert(
      fc.property(fc.array(safeInt, { maxLength: 30 }), (xs) => {
        const ms = xs.map(money);
        const folded = ms.reduce<Money>((acc, m) => add(acc, m), ZERO);
        expect(sum(ms)).toBe(folded);
        expect(sum([...ms].reverse())).toBe(folded);
      }),
    );
  });
});

describe('mul / pct', () => {
  it('rounds half away from zero', () => {
    expect(mul(money(5), 0.5)).toBe(3);
    expect(mul(money(3), 0.5)).toBe(2);
    expect(mul(money(1), 0.4)).toBe(0);
  });

  it('handles negative amounts and factors symmetrically', () => {
    expect(mul(money(-5), 0.5)).toBe(-3);
    expect(mul(money(5), -0.5)).toBe(-3);
    expect(mul(money(-5), -0.5)).toBe(3);
    expect(mul(money(-150), 0.5)).toBe(-75);
    expect(Object.is(mul(money(-1), 0.4), 0)).toBe(true);
  });

  it('pct takes the rate as a fraction (0.2 = 20%)', () => {
    expect(pct(money(12345), 0.2)).toBe(2469);
    expect(pct(money(-12345), 0.2)).toBe(-2469);
    expect(pct(money(250), 0.01)).toBe(3); // 2.5 → 3
  });

  it('throws on overflow or non-finite factor', () => {
    expect(() => mul(money(MAX), 2)).toThrow(MoneyError);
    expect(() => mul(money(100), Number.NaN)).toThrow(MoneyError);
    expect(() => pct(money(100), Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('property: mul(m, -f) = -mul(m, f)', () => {
    fc.assert(
      fc.property(safeInt, fc.double({ min: -10, max: 10, noNaN: true }), (n, f) => {
        const a = mul(money(n), f);
        const b = mul(money(n), -f);
        expect(a + b).toBe(0);
      }),
    );
  });
});

describe('fromFloatCents', () => {
  it('rounds a float number of cents to Money', () => {
    expect(fromFloatCents(123.5)).toBe(124);
    expect(fromFloatCents(-123.5)).toBe(-124);
    expect(fromFloatCents(450 * 351)).toBe(157950);
  });

  it('throws on NaN, Infinity and out-of-range values', () => {
    expect(() => fromFloatCents(Number.NaN)).toThrow(MoneyError);
    expect(() => fromFloatCents(Number.NEGATIVE_INFINITY)).toThrow(MoneyError);
    expect(() => fromFloatCents(2 ** 60)).toThrow(MoneyError);
  });
});

describe('compare', () => {
  it('orders amounts', () => {
    expect(compare(money(1), money(2))).toBe(-1);
    expect(compare(money(2), money(2))).toBe(0);
    expect(compare(money(3), money(-2))).toBe(1);
  });
});

describe('toDisplay', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [99, '$0.99'],
    [100, '$1.00'],
    [123456, '$1,234.56'],
    [-123456, '-$1,234.56'],
    [-5, '-$0.05'],
    [100000000, '$1,000,000.00'],
    [123456789012, '$1,234,567,890.12'],
  ])('%s → %s', (n, expected) => {
    expect(toDisplay(money(n))).toBe(expected);
  });

  it('formats MAX_SAFE_INTEGER exactly', () => {
    expect(toDisplay(money(MAX))).toBe('$90,071,992,547,409.91');
  });
});
