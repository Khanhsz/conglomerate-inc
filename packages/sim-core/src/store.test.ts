import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from './engine';
import { money } from './money';
import { emptyMonthToDate, storeContribution, storeMonthCosts, storeMonthToDate } from './store';
import { fixtureContent } from './test-support/fixture';
import { must } from './test-support/must';
import type { StoreMonthToDate } from './types/state';

const mtd: StoreMonthToDate = {
  ...emptyMonthToDate(),
  days: 12,
  revenue: money(100_000),
  cogs: money(30_000),
  wagesAccrued: 20_000.4,
  rentAccrued: 10_000.5,
  trainingAccrued: 1_000.5,
  benefitsAccrued: 499.5,
  amenitiesAccrued: 1_000.49,
  amenitiesSetup: money(2_000),
};

describe('storeMonthCosts (shared by month close and the month-to-date view)', () => {
  it('rounds each accrual like the ledger and pays the bonus on positive contribution (§16.4)', () => {
    expect(storeMonthCosts(mtd, 0.1)).toEqual({
      wages: 20_000,
      rent: 10_001,
      training: 1_001,
      benefits: 500,
      amenities: 3_000,
      // trước thưởng: 100,000 − 64,502 = 35,498 → 10% = 3,549.8 → 3,550
      bonus: 3_550,
    });
  });

  it('no bonus when contribution before bonus is not positive', () => {
    expect(storeMonthCosts({ ...mtd, revenue: money(60_000) }, 0.2).bonus).toBe(0);
    expect(storeMonthCosts(mtd, 0).bonus).toBe(0);
  });
});

describe('storeMonthToDate', () => {
  it('is the record month close would write if the month ended today', () => {
    const content = fixtureContent();
    const game = enqueue(createGame(content), {
      type: 'OpenStore',
      companyId: 'player',
      payload: { districtId: 'w' },
    });
    const mid = runDays(game, content, 12);
    const store = must(Object.values(mid.stores).find((s) => s.companyId === 'player'));
    const view = storeMonthToDate(store, 0, 0);
    expect(view.days).toBe(store.mtd.days);
    expect(view.revenue).toBe(store.mtd.revenue);
    expect(view.depreciation).toBe(0);
    const c = storeMonthCosts(store.mtd, 0);
    expect(storeContribution(view)).toBe(
      store.mtd.revenue - store.mtd.cogs - c.wages - c.rent - c.training - c.benefits - c.amenities,
    );
  });
});
