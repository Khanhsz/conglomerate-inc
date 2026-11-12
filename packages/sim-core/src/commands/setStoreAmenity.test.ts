import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from '../engine';
import { checkInvariants } from '../invariants';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { money } from '../money';
import { storePnl } from '../selectors/finance';
import { storeReviews, toStars } from '../selectors/storeView';
import { expectedDemand } from '../systems/demand';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';

const content = fixtureContent();
const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const P = 'player';
const STORE = 'store-000002';
const amenity = (a: string, on: boolean, storeId = STORE): Command => ({
  type: 'SetStoreAmenity',
  companyId: P,
  payload: { storeId, amenity: a, on },
});
const play = (s: GameState, cmds: Command[], days = 1) =>
  runDays(
    cmds.reduce((acc, c) => enqueue(acc, c), s),
    content,
    days,
  );
const reason = (s: GameState, c: Command) => {
  const v = validateCommand(s, content, c);
  return v.ok ? null : v.reason;
};
const base = play(createGame(content), [{ type: 'OpenStore', companyId: P, payload: { districtId: 'e' } }]);

describe('SetStoreAmenity (economic-model §21)', () => {
  const on = play(base, [amenity('wifi', true)]);

  it('turning on pays the setup cost to StoreAmenities and marks the store', () => {
    expect(must(on.stores[STORE]).amenities).toEqual(['wifi']);
    const setup = Math.round(50_000 * base.macro.priceIndex);
    expect(currentBalances(on.ledger, P)[ACC.StoreAmenities]).toBe(setup);
    expect(must(on.stores[STORE]).mtd.amenitiesSetup).toBe(setup);
  });

  it('rejects unknown amenities, duplicates and turning off what is not on', () => {
    expect(reason(on, amenity('wifi', true))).toMatch(/đã bật/);
    expect(reason(base, amenity('lounge', false))).toMatch(/chưa bật/);
    expect(reason(base, amenity('pool', true))).toMatch(/không tồn tại/);
    expect(must(play(on, [amenity('wifi', false)]).stores[STORE]).amenities).toEqual([]);
  });

  it('monthly cost accrues while on; store P&L carries setup + monthly; invariants hold', () => {
    const month = runDays(on, content, 29); // ngày 1–29, chốt tháng 0
    const pnl = must(month.statements[P]?.[0]).pnl;
    const lm = must(month.stores[STORE]).lastMonth;
    expect(lm.amenities).toBe(pnl.amenities);
    // lắp đặt + ~29/30 tháng × $300
    expect(pnl.amenities).toBeGreaterThan(50_000 + 28_000);
    expect(pnl.amenities).toBeLessThan(50_000 + 30_500);
    expect(must(storePnl(month, P, 0)).corporate.amenities).toBe(0);
    expect(checkInvariants(month, content)).toEqual([]);
  });

  it('"Không gian" stars = share of review weight switched on (wifi 1 of 3)', () => {
    expect(must(storeReviews(on, content, STORE)).stars.atmosphere).toBe(toStars(1 / 3));
    expect(must(storeReviews(base, content, STORE)).stars.atmosphere).toBe(1);
  });
});

describe('amenities and demand (property)', () => {
  it('switching amenities on never lowers own expected demand and never raises a rival’s', () => {
    fc.assert(
      fc.property(fc.subarray(['wifi', 'lounge']), fc.integer({ min: 200, max: 900 }), (list, price) => {
        const before = produce(base, (d) => {
          must(d.stores[STORE]).price = money(price);
        });
        const after = produce(before, (d) => {
          must(d.stores[STORE]).amenities = [...list].sort();
        });
        const a = expectedDemand(before, content).byStore;
        const b = expectedDemand(after, content).byStore;
        expect(must(b[STORE])).toBeGreaterThanOrEqual(must(a[STORE]) - 1e-9);
        expect(must(b['store-000001'])).toBeLessThanOrEqual(must(a['store-000001']) + 1e-9);
      }),
      { numRuns: RUNS },
    );
  });
});
