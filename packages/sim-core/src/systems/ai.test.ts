import { produce, type Draft } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, runDays } from '../engine';
import { money } from '../money';
import { createRngFactory } from '../rng';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState, Store } from '../types/state';
import { aiPolicy, decideMonthly } from './ai';

const content = fixtureContent();
const rng = () => createRngFactory(7)('ai:test', 30);
const ID = 'store-000001';
/** Sau 1 tháng: AI có lịch sử. Đặt tình huống cửa hàng qua `edit`. */
const month1 = runDays(createGame(content), content, 30);

function decide(
  edit: (store: Draft<Store>, d: Draft<GameState>) => void = () => undefined,
  state = month1,
): Command[] {
  const s = produce(state, (d) => edit(must(d.stores[ID]), d));
  return decideMonthly(s, content, 'ai-1', aiPolicy(content, 'balanced'), rng());
}
const ofType = <T extends Command['type']>(cmds: Command[], type: T) =>
  cmds.filter((c): c is Extract<Command, { type: T }> => c.type === type);

/** Đặt lastMonth của cửa hàng: utilization = served / capacity, cầu trung bình/ngày. */
function lastMonth(store: Draft<Store>, opts: { util: number; demandPerDay?: number }) {
  const capacity = 30 * 450;
  store.lastMonth = {
    ...store.lastMonth,
    days: 30,
    capacity,
    served: capacity * opts.util,
    demand: 30 * (opts.demandPerDay ?? 450 * opts.util),
  };
}

describe('AI price rule (economic-model §9 rule 1)', () => {
  // target balanced = 90 × 1.0 × 3.9 × priceIndex(≈1.0025 ở ngày 30) ≈ 351.9
  it('busy store (utilization > 0.95): target × 1.03, rounded to 5 cents', () => {
    const [cmd] = ofType(
      decide((s) => lastMonth(s, { util: 1 })),
      'SetPrice',
    );
    expect(cmd?.payload).toEqual({ storeId: ID, price: 360 }); // ≈ 362.4 → giới hạn +5% của 350 = 367.5 → 360
  });

  it('quiet store (utilization < 0.6): target × 0.97', () => {
    const [cmd] = ofType(
      decide((s) => lastMonth(s, { util: 0.4 })),
      'SetPrice',
    );
    expect(cmd?.payload).toEqual({ storeId: ID, price: 340 }); // ≈ 341.3 → 340
  });

  it('moves at most ±5% per month toward the target', () => {
    const [cmd] = ofType(
      decide((s) => {
        lastMonth(s, { util: 0.8 });
        s.price = money(200);
      }),
      'SetPrice',
    );
    expect(cmd?.payload.price).toBe(210); // 200 × 1.05
  });

  it('no command when the rounded price is unchanged', () => {
    expect(
      ofType(
        decide((s) => lastMonth(s, { util: 0.8 })),
        'SetPrice',
      ),
    ).toEqual([]);
  });
});

describe('AI staffing rule (rule 2)', () => {
  it('aims for 0.85 expected utilization, at most ±2 staff per month', () => {
    // cầu 600/ngày, morale 0.5 → 90 khách/người → cần ceil(600 / (0.85 × 90)) = 8 → giới hạn 5 + 2 = 7
    const up = ofType(
      decide((s) => {
        lastMonth(s, { util: 1, demandPerDay: 600 });
        s.morale = 0.5;
      }),
      'SetStaff',
    );
    expect(up[0]?.payload).toEqual({ storeId: ID, staff: 7 });
    // cầu 150/ngày → ceil(150 / 76.5) = 2 → giới hạn 5 − 2 = 3
    const down = ofType(
      decide((s) => {
        lastMonth(s, { util: 0.3, demandPerDay: 150 });
        s.morale = 0.5;
      }),
      'SetStaff',
    );
    expect(down[0]?.payload).toEqual({ storeId: ID, staff: 3 });
  });
});

describe('AI wage and marketing rules (3b, 3c)', () => {
  it('keeps wages at wageRatio × market wage × CPI', () => {
    const cmds = decide((_s, d) => {
      d.macro.priceIndex = 1.03;
    });
    expect(ofType(cmds, 'SetWage')[0]?.payload).toEqual({ storeId: 'all', wageMonthly: 237_930 }); // 1.05 × 220,000 × 1.03
  });

  it('sets marketing = share × last month revenue', () => {
    const revenue = must(month1.statements['ai-1']?.[0]).pnl.revenue;
    const [cmd] = ofType(decide(), 'SetMarketingBudget');
    expect(cmd?.payload.monthly).toBe(Math.round(0.04 * revenue));
  });
});

describe('AI close and expansion rules (3, 4)', () => {
  it('closes a store with 3 consecutive negative-contribution months and leaves it alone otherwise', () => {
    const cmds = decide((s) => {
      s.negContributionMonths = 3;
      lastMonth(s, { util: 1 });
    });
    expect(ofType(cmds, 'CloseStore')).toEqual([
      { type: 'CloseStore', companyId: 'ai-1', payload: { storeId: ID } },
    ]);
    expect(
      cmds.filter((c) => 'storeId' in c.payload && c.payload.storeId === ID && c.type !== 'CloseStore'),
    ).toEqual([]);
  });

  /** Lịch sử 1 tháng với lãi đóng góp tùy ý. */
  function withContribution(contribution: number, cash?: number): GameState {
    return produce(month1, (d) => {
      const list = must(d.statements['ai-1']);
      const m = must(list[0]);
      const pnl = { ...m.pnl, revenue: money(contribution + m.pnl.cogs + m.pnl.wages + m.pnl.rent) };
      list[0] = { ...m, pnl };
      if (cash !== undefined) must(d.ledger.balances['ai-1'])[1000] = money(cash);
    });
  }

  it('opens one store in the best district when ROI > 2%/month and cash ≥ 1.5 × capex', () => {
    // capex 12,000,000 (cửa hàng e) → ROI 2.5% ⇒ đóng góp 300,000/tháng; w: 550 / (1 + 0) > e: 708 / (1 + 1)
    const s = withContribution(300_000);
    const opens = ofType(
      decideMonthly(s, content, 'ai-1', aiPolicy(content, 'balanced'), rng()),
      'OpenStore',
    );
    expect(opens).toEqual([{ type: 'OpenStore', companyId: 'ai-1', payload: { districtId: 'w' } }]);
  });

  it('does not expand when ROI is too low, cash is short, or the company is in distress', () => {
    const policy = aiPolicy(content, 'balanced');
    const none = (s: GameState) => ofType(decideMonthly(s, content, 'ai-1', policy, rng()), 'OpenStore');
    expect(none(withContribution(200_000))).toEqual([]); // 1.67%
    expect(none(withContribution(300_000, 14_000_000))).toEqual([]); // cần 1.5 × 10,000,000 = 15,000,000
    const distress = produce(withContribution(300_000), (d) => {
      must(d.companies['ai-1']).status = 'distress';
    });
    expect(none(distress)).toEqual([]);
  });

  it('closing its last store does not trigger a bootstrap re-open in the same decision (review: economist #2)', () => {
    const cmds = decide((st) => {
      st.negContributionMonths = 3;
    });
    expect(ofType(cmds, 'CloseStore')).toHaveLength(1);
    expect(ofType(cmds, 'OpenStore')).toEqual([]);
    // Không còn cửa hàng nào: marketing về 0 thay vì theo doanh thu tháng trước.
    expect(ofType(cmds, 'SetMarketingBudget')[0]?.payload.monthly ?? 0).toBe(0);
  });

  it('a company without stores opens its first affordable store (bootstrap)', () => {
    const s = createGame(content);
    const cmds = decideMonthly(s, content, 'player', aiPolicy(content, 'balanced'), rng());
    expect(ofType(cmds, 'OpenStore')).toEqual([
      { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } },
    ]);
  });
});

describe('aiSystem in the tick (spec §4 step 0)', () => {
  it('runs on day 30, 60…, and its commands go through the normal validation path', () => {
    const before = runDays(createGame(content), content, 29);
    const after = runDays(before, content, 2); // ngày 29 (chốt tháng) và ngày 30 (AI quyết định)
    const ai = must(after.companies['ai-1']);
    const revenue = must(after.statements['ai-1']?.[0]).pnl.revenue;
    expect(ai.marketingBudgetMonthly).toBe(Math.round(0.04 * revenue));
    expect(must(before.companies['ai-1']).marketingBudgetMonthly).toBe(0);
    expect(after.commandQueue).toEqual([]);
  });

  it('never decides for the player', () => {
    const s = runDays(createGame(content), content, 95);
    expect(s.storeIds.filter((id) => s.stores[id]?.companyId === 'player')).toEqual([]);
  });
});
