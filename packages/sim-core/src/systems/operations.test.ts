import fc from 'fast-check';
import { produce, type Draft } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { money } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { GameState, Store } from '../types/state';
import { moraleTarget, operationsSystem, productivity } from './operations';

const content = fixtureContent();
const base = createGame(content); // ai-1 có store-000001 ở e: giá 350, staff 5, lương 231,000, morale 0.5, skill 0.4, W 0.6
const ID = 'store-000001';

function withStore(edit: (s: Draft<Store>, d: Draft<GameState>) => void, state: GameState = base): GameState {
  return produce(state, (d) => edit(must(d.stores[ID]), d));
}
const runOps = (state: GameState, day = state.clock.day) =>
  produce(state, (d) => operationsSystem(d, ctxAt(state, content, day)));
const storeOf = (s: GameState) => must(s.stores[ID]);

describe('capacity and served (economic-model §3.4, §4.1)', () => {
  it('productivity = 0.7 + 0.6·morale', () => {
    expect(productivity(0)).toBeCloseTo(0.7, 12);
    expect(productivity(0.5)).toBeCloseTo(1.0, 12);
    expect(productivity(1)).toBeCloseTo(1.3, 12);
  });

  it('capacity = staff × customersPerStaffPerDay × productivity; served = min(demand, capacity)', () => {
    const busy = storeOf(runOps(withStore((s) => void (s.today.demand = 600))));
    expect(busy.today).toEqual({ demand: 600, capacity: 450, served: 450, lost: 150 }); // 5 × 90 × 1.0
    const quiet = storeOf(runOps(withStore((s) => void (s.today.demand = 300))));
    expect(quiet.today).toEqual({ demand: 300, capacity: 450, served: 300, lost: 0 });
  });
});

describe('daily sales entries (economic-model §6, D1/D2)', () => {
  it('rounds revenue and COGS per store and posts one sales entry + one COGS payment per company', () => {
    const s = runOps(withStore((st) => void (st.today.demand = 300.4)));
    // doanh thu round(300.4 × 350) = round(105,140) = 105,140; giá vốn round(300.4 × 90 × 1.0 × 1.0) = round(27,036) = 27,036
    expect(storeOf(s).mtd.revenue).toBe(105_140);
    expect(storeOf(s).mtd.cogs).toBe(27_036);
    const b = currentBalances(s.ledger, 'ai-1');
    expect(b[ACC.Revenue]).toBe(105_140);
    expect(b[ACC.COGS]).toBe(27_036);
    const today = s.ledger.entries.slice(base.ledger.entries.length);
    expect(today.map((e) => e.lines.map((l) => [l.account, l.debit, l.credit]))).toEqual([
      [
        [ACC.Cash, 105_140, 0],
        [ACC.Revenue, 0, 105_140],
      ],
      [
        [ACC.COGS, 27_036, 0],
        [ACC.Cash, 0, 27_036],
      ],
    ]);
  });

  it('two stores of one company share one entry whose total is the sum of per-store rounded amounts', () => {
    const c = fixtureContent((d) => {
      must(d.scenario.companies[1]).initialStores = ['w', 'e'];
    });
    const s0 = produce(createGame(c), (d) => {
      must(d.stores['store-000001']).today.demand = 100.5; // 100.5 × 350 = 35,175
      must(d.stores['store-000002']).today.demand = 200.25; // 200.25 × 350 = 70,087.5 → 70,088
    });
    const s = produce(s0, (d) => operationsSystem(d, ctxAt(s0, c)));
    const sales = s.ledger.entries.slice(s0.ledger.entries.length);
    expect(sales[0]?.lines[0]).toEqual({ account: ACC.Cash, debit: 35_175 + 70_088, credit: 0 });
    expect(sales).toHaveLength(2);
  });

  it('uses the company tier for COGS and priceIndex', () => {
    const s0 = produce(
      withStore((st) => void (st.today.demand = 100)),
      (d) => {
        must(d.companies['ai-1']).qualityTier = 'premium';
        d.macro.priceIndex = 1.1;
      },
    );
    expect(storeOf(runOps(s0)).mtd.cogs).toBe(14_850); // 100 × 90 × 1.5 × 1.1
  });
});

describe('morale, skill, service level (economic-model §3.5, §4.2–§4.3)', () => {
  it('higher wage → higher morale target; market wage → 0.5; +20% → ≈ 0.77', () => {
    expect(moraleTarget(1, 6)).toBeCloseTo(0.5, 12);
    expect(moraleTarget(1.2, 6)).toBeCloseTo(0.7685, 4);
    expect(moraleTarget(1.1, 6)).toBeGreaterThan(moraleTarget(1.0, 6));
    expect(moraleTarget(0.9, 6)).toBeLessThan(moraleTarget(1.0, 6));
  });

  it('morale converges to the target (κm = 0.05 per day)', () => {
    let s = withStore((st) => void (st.wageMonthly = money(264_000))); // 1.2 × 220,000
    const once = storeOf(runOps(s)).morale;
    expect(once).toBeCloseTo(0.5 + 0.05 * (moraleTarget(1.2, 6) - 0.5), 12);
    for (let i = 0; i < 300; i++) s = runOps(s);
    expect(storeOf(s).morale).toBeCloseTo(moraleTarget(1.2, 6), 5);
  });

  it('skill grows by skillGainPerDay and stops at 1', () => {
    expect(storeOf(runOps(base)).skill).toBeCloseTo(0.402, 12);
    const high = storeOf(runOps(withStore((st) => void (st.skill = 0.9995)))).skill;
    expect(high).toBe(1);
  });

  it('service level moves toward 0.5·fill + 0.5·morale·skill using start-of-day staff quality', () => {
    // fill = 450 / 600 = 0.75; staffQuality = 0.5 × 0.4 = 0.2; target = 0.475; W = 0.6 + 0.2 × (0.475 − 0.6) = 0.575
    const st = storeOf(runOps(withStore((s) => void (s.today.demand = 600))));
    expect(st.serviceLevel).toBeCloseTo(0.575, 12);
    // không có cầu → fill = 1
    const idle = storeOf(runOps(withStore((s) => void (s.today.demand = 0))));
    expect(idle.serviceLevel).toBeCloseTo(0.6 + 0.2 * (0.5 * 1 + 0.5 * 0.2 - 0.6), 12);
  });
});

describe('accruals (economic-model §6)', () => {
  it('accrues wages and rent per store and marketing per company each day', () => {
    const s0 = produce(base, (d) => {
      must(d.companies['ai-1']).marketingBudgetMonthly = money(300_000);
    });
    const s = runOps(s0);
    expect(storeOf(s).mtd.wagesAccrued).toBeCloseTo((5 * 231_000) / 30, 9);
    expect(storeOf(s).mtd.rentAccrued).toBeCloseTo(700_000 / 30, 9);
    expect(must(s.companies['ai-1']).marketingAccrued).toBeCloseTo(10_000, 9);
    expect(must(s.companies['player']).marketingAccrued).toBe(0);
  });

  it('renews the lease every 360 days at district rent × current priceIndex', () => {
    const s0 = produce(base, (d) => {
      d.macro.priceIndex = 1.03;
    });
    expect(storeOf(runOps(s0, 359)).rentMonthly).toBe(700_000);
    const renewed = storeOf(runOps(s0, 360));
    expect(renewed.rentMonthly).toBe(721_000);
    expect(renewed.rentResetDay).toBe(720);
  });

  it('closed stores and bankrupt companies do nothing', () => {
    const closed = storeOf(
      runOps(
        withStore((st) => {
          st.status = 'closed';
          st.today.demand = 500;
        }),
      ),
    );
    expect(closed.today).toEqual({ demand: 0, served: 0, lost: 0, capacity: 0 });
    expect(closed.mtd.wagesAccrued).toBe(0);
    const bankrupt = produce(
      withStore((st) => void (st.today.demand = 500)),
      (d) => {
        must(d.companies['ai-1']).status = 'bankrupt';
      },
    );
    expect(runOps(bankrupt).ledger.entries).toHaveLength(base.ledger.entries.length);
  });
});

describe('moraleTarget (property)', () => {
  // Với k·(r − 1) lớn, 1/(1 + e^−x) làm tròn đúng bằng 1.0 trong số thực; morale ∈ [0, 1] vẫn đúng.
  it('is in [0, 1] and non-decreasing in the wage ratio', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 3, noNaN: true }),
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 20, noNaN: true }),
        (r, dr, k) => {
          const a = moraleTarget(r, k);
          const b = moraleTarget(r + dr, k);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(1);
          expect(b).toBeGreaterThanOrEqual(a);
        },
      ),
    );
  });
});
