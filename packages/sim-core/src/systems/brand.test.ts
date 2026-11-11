import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { money } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { GameState } from '../types/state';
import { brandLift, brandSystem } from './brand';

const content = fixtureContent();
const base = createGame(content);
const runBrand = (s: GameState, c = content) => produce(s, (d) => brandSystem(d, ctxAt(s, c)));
const awareness = (s: GameState, id = 'player') => must(s.companies[id]).brandAwareness;
const withBudget = (s: GameState, monthly: number, id = 'player') =>
  produce(s, (d) => {
    must(d.companies[id]).marketingBudgetMonthly = money(monthly);
  });

describe('brandSystem (economic-model §5)', () => {
  it('lift = α(1 − exp(−spendDaily / (halfSat × priceIndex)))', () => {
    expect(brandLift(0.01, 10_000, 10_000, 1)).toBeCloseTo(0.01 * (1 - Math.exp(-1)), 15);
    expect(brandLift(0.01, 10_000, 10_000, 2)).toBeCloseTo(0.01 * (1 - Math.exp(-0.5)), 15);
    expect(brandLift(0.01, 0, 10_000, 1)).toBe(0);
  });

  it('without spending or sales awareness decays by δ', () => {
    expect(awareness(runBrand(base))).toBeCloseTo(0.05 - 0.003 * 0.05, 15);
  });

  it('more spending → higher awareness', () => {
    const lo = awareness(runBrand(withBudget(base, 100_000)));
    const hi = awareness(runBrand(withBudget(base, 1_000_000)));
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(awareness(runBrand(base)));
  });

  it('constant spend converges to lift / (lift + δ) when word of mouth is off', () => {
    const c = fixtureContent((d) => {
      d.industry.brand.wordOfMouth = 0;
    });
    let s = withBudget(createGame(c), 300_000); // $100/ngày = halfSat
    for (let i = 0; i < 3000; i++) s = runBrand(s, c);
    const lift = 0.01 * (1 - Math.exp(-1));
    expect(awareness(s)).toBeCloseTo(lift / (lift + 0.003), 6); // ≈ 0.678
  });

  it("adds word of mouth from yesterday's served customers / city population", () => {
    const s0 = produce(base, (d) => {
      must(d.stores['store-000001']).today.served = 1100;
    });
    const a = awareness(runBrand(s0), 'ai-1');
    expect(a).toBeCloseTo(0.05 - 0.003 * 0.05 + (0.002 * 1100) / 22_000, 15);
  });

  it('stays in [0, 1] and skips bankrupt companies', () => {
    const s0 = produce(withBudget(base, 100_000_000), (d) => {
      must(d.companies['player']).brandAwareness = 0.9999;
      must(d.stores['store-000001']).today.served = 1e9;
    });
    const s = runBrand(s0);
    expect(awareness(s)).toBeLessThanOrEqual(1);
    expect(awareness(s, 'ai-1')).toBe(1);
    const broke = produce(base, (d) => {
      must(d.companies['player']).status = 'bankrupt';
    });
    expect(awareness(runBrand(broke))).toBe(0.05);
  });
});

describe('brandLift (property)', () => {
  it('is in [0, α] and non-decreasing in spend', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 0, max: 1e7, noNaN: true }),
        fc.double({ min: 1, max: 1e6, noNaN: true }),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        (alpha, s1, extra, halfSat, priceIndex) => {
          const a = brandLift(alpha, s1, halfSat, priceIndex);
          const b = brandLift(alpha, s1 + extra, halfSat, priceIndex);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(alpha);
          expect(b).toBeGreaterThanOrEqual(a);
        },
      ),
    );
  });
});
