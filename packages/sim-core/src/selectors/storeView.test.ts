import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { money } from '../money';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { areaShares, storeReviews, toStars } from './storeView';

const content = fixtureContent();
const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const game = runDays(
  enqueue(createGame(content), { type: 'OpenStore', companyId: 'player', payload: { districtId: 'e' } }),
  content,
  5,
);
const MINE = 'store-000002';

describe('toStars (spec M1.7: stars = 1 + 4x, half steps)', () => {
  it('maps the ends and stays in [1, 5] on half steps (property)', () => {
    expect(toStars(0)).toBe(1);
    expect(toStars(1)).toBe(5);
    expect(toStars(0.5)).toBe(3);
    fc.assert(
      fc.property(fc.double({ min: -2, max: 3, noNaN: true }), (x) => {
        const s = toStars(x);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(5);
        expect(s * 2).toBe(Math.round(s * 2));
      }),
      { numRuns: RUNS },
    );
  });
});

describe('storeReviews', () => {
  it('price: reference price → 3 stars, half → 5, double → 1; higher price never scores better', () => {
    const at = (p: number) =>
      must(
        storeReviews(
          produce(game, (d) => {
            must(d.stores[MINE]).price = money(p);
          }),
          content,
          MINE,
        ),
      ).stars.price;
    const pref = 350 * game.macro.priceIndex;
    expect(at(Math.round(pref))).toBe(3);
    expect(at(Math.round(pref / 2))).toBe(5);
    expect(at(Math.round(pref * 2))).toBe(1);
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 1700 }), fc.integer({ min: 0, max: 200 }), (p, bump) => {
        expect(at(p + bump)).toBeLessThanOrEqual(at(p));
      }),
      { numRuns: RUNS },
    );
  });

  it('product follows the quality tier; overall is the mean of the four criteria', () => {
    const r = must(storeReviews(game, content, MINE));
    expect(r.stars.product).toBe(toStars(0.6));
    const mean = (r.stars.price + r.stars.product + r.stars.service + r.stars.atmosphere) / 4;
    expect(r.overall).toBeCloseTo(mean, 1);
  });
});

describe('areaShares', () => {
  it('splits residents of the store district between companies and "no purchase", summing to 1', () => {
    const shares = must(areaShares(game, content, MINE));
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 12);
    expect(shares.map((s) => s.companyId)).toEqual(['ai-1', 'player', null]); // theo thứ tự companyIds
    for (const s of shares) expect(s.share).toBeGreaterThanOrEqual(0);
  });
});
