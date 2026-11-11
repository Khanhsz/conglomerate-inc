import {
  createGame,
  enqueue,
  money,
  runDays,
  validateCommand,
  type Command,
  type GameState,
} from '@game/sim-core';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { computeAlerts, newAlertKeys } from './alerts';
import { loadGameContent } from './content';
import { buildInspection } from './inspection';
import { channelKey, pendingChanges } from './pending';
import { sliderLimits } from './limits';

const content = loadGameContent();
const PLAYER_STORE = 'store-000010';
const opened: GameState = runDays(
  enqueue(createGame(content), { type: 'OpenStore', companyId: 'player', payload: { districtId: 'c' } }),
  content,
  10,
);

describe('sliderLimits (A5): slider ends are exactly what validateCommand accepts', () => {
  const limits = sliderLimits(opened, content);

  it('credit line: max is 2 × revenue of the last 3 months floored to $1,000, at least the overdraft floor', () => {
    const revenue3m = (opened.statements['player'] ?? []).slice(-3).reduce((a, m) => a + m.pnl.revenue, 0);
    const exact = Math.max(content.scenario.finance.overdraftFloor, Math.round(2 * revenue3m));
    expect(limits.creditLine.step).toBe(100_000);
    expect(limits.creditLine.max).toBeLessThanOrEqual(exact);
    expect(limits.creditLine.max).toBeGreaterThan(exact - limits.creditLine.step);
  });
  const ok = (cmd: Command) => validateCommand(opened, content, cmd).ok;
  const price = (p: number): Command => ({
    type: 'SetPrice',
    companyId: 'player',
    payload: { storeId: PLAYER_STORE, price: money(p) },
  });
  const wage = (w: number): Command => ({
    type: 'SetWage',
    companyId: 'player',
    payload: { storeId: PLAYER_STORE, wageMonthly: money(w) },
  });

  it('price: both ends valid, one step beyond rejected, step 5 cents', () => {
    expect(limits.price.step).toBe(5);
    expect(limits.price.min % 5).toBe(0);
    expect(ok(price(limits.price.min)) && ok(price(limits.price.max))).toBe(true);
    expect(ok(price(limits.price.min - 5))).toBe(false);
    expect(ok(price(limits.price.max + 5))).toBe(false);
  });

  it('wage: both ends valid, one step beyond rejected, step $10', () => {
    expect(limits.wage.step).toBe(1_000);
    expect(ok(wage(limits.wage.min)) && ok(wage(limits.wage.max))).toBe(true);
    expect(ok(wage(limits.wage.min - 1_000))).toBe(false);
    expect(ok(wage(limits.wage.max + 1_000))).toBe(false);
  });

  it('staff and marketing follow content and game rules', () => {
    expect(limits.staff).toEqual({ min: 2, max: 40, step: 1 });
    expect(limits.marketing.max).toBe(100_000_000);
  });
});

describe('computeAlerts (A4)', () => {
  type Day = { demand: number; served: number; capacity: number };
  const setDays = (s: GameState, days: Day[]) =>
    produce(s, (d) => {
      const st = d.stores[PLAYER_STORE];
      if (st) st.recentDays = days.map((x, i) => ({ day: 100 + i, ...x }));
    });

  it('overloaded when customers were turned away on ≥ 3 of the last 7 days', () => {
    const busy = setDays(opened, [
      ...Array<Day>(4).fill({ demand: 400, served: 400, capacity: 450 }),
      ...Array<Day>(3).fill({ demand: 600, served: 450, capacity: 450 }),
    ]);
    expect(computeAlerts(busy).map((a) => a.kind)).toContain('overloaded');
    const ok = setDays(opened, Array<Day>(7).fill({ demand: 400, served: 400, capacity: 450 }));
    expect(computeAlerts(ok).map((a) => a.kind)).not.toContain('overloaded');
  });

  it('underused when utilization stayed below 50% for the whole week', () => {
    const quiet = setDays(opened, Array<Day>(7).fill({ demand: 150, served: 150, capacity: 450 }));
    const alert = computeAlerts(quiet).find((a) => a.kind === 'underused');
    expect(alert?.storeId).toBe(PLAYER_STORE);
  });

  it('low morale and negative contribution', () => {
    const sad = produce(opened, (d) => {
      const st = d.stores[PLAYER_STORE];
      if (!st) return;
      st.morale = 0.3;
      st.lastMonth = {
        ...st.lastMonth,
        days: 30,
        revenue: money(100),
        cogs: money(50),
        wages: money(1_000),
        rent: money(500),
      };
    });
    const kinds = computeAlerts(sad).map((a) => a.kind);
    expect(kinds).toContain('lowMorale');
    expect(kinds).toContain('negativeContribution');
  });

  it('a rival opening in a district where the player has a store', () => {
    const rival = produce(opened, (d) => {
      d.events.push({
        day: d.clock.day - 1,
        kind: 'storeOpened',
        companyId: 'ai-bean',
        storeId: 'store-000099',
        districtId: 'c',
      });
    });
    expect(computeAlerts(rival).find((a) => a.kind === 'rivalNearby')?.severity).toBe('warning');
  });

  it('rivals that were already there before the player opened are not news', () => {
    // Ở quận c, AI đã có cửa hàng từ ngày 0; người chơi mở ở ngày 0 lúc bắt đầu tick → không cảnh báo.
    const early = produce(opened, (d) => {
      const mine = d.stores[PLAYER_STORE];
      if (mine) mine.openedDay = 5;
      d.events.push({
        day: 2,
        kind: 'storeOpened',
        companyId: 'ai-bean',
        storeId: 'store-000098',
        districtId: 'c',
      });
    });
    expect(computeAlerts(early).some((a) => a.key === 'rivalNearby:store-000098')).toBe(false);
    // Lúc bắt đầu game mọi công ty mở cùng ngày 0 → cũng không cảnh báo.
    expect(computeAlerts(opened).some((a) => a.kind === 'rivalNearby')).toBe(false);
  });

  it('newAlertKeys returns only alerts that were not there before', () => {
    const a = [{ key: 'x', kind: 'lowMorale' as const, severity: 'warning' as const, message: '' }];
    const b = [...a, { key: 'y', kind: 'overloaded' as const, severity: 'warning' as const, message: '' }];
    expect(newAlertKeys(a, b)).toEqual(['y']);
    expect(newAlertKeys(b, a)).toEqual([]);
  });
});

describe('buildInspection (A1–A3 for the UI)', () => {
  it('describes a player store, with a 25-point price curve and the current estimate', () => {
    const view = buildInspection(opened, content, PLAYER_STORE);
    expect(view?.storeId).toBe(PLAYER_STORE);
    expect(view?.curve).toHaveLength(25);
    expect(view?.current.price).toBe(opened.stores[PLAYER_STORE]?.price);
    expect(view?.recentDays).toHaveLength(10);
    expect(view?.report.bySegment.length).toBeGreaterThan(0);
  });

  it('refuses rival stores (only public data for rivals)', () => {
    expect(buildInspection(opened, content, 'store-000001')).toBeNull();
    expect(buildInspection(opened, content, 'store-999999')).toBeNull();
  });
});

describe('pendingChanges (queued player commands, applied next tick)', () => {
  it('shows the last queued value per store, expands "all", ignores AI commands', () => {
    const queued = [
      { type: 'SetPrice', companyId: 'player', payload: { storeId: PLAYER_STORE, price: money(400) } },
      { type: 'SetPrice', companyId: 'player', payload: { storeId: PLAYER_STORE, price: money(420) } },
      { type: 'SetWage', companyId: 'player', payload: { storeId: 'all', wageMonthly: money(250_000) } },
      { type: 'SetStaff', companyId: 'ai-bean', payload: { storeId: 'store-000001', staff: 9 } },
      { type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(500_000) } },
      {
        type: 'SetChannelBudget',
        companyId: 'player',
        payload: { channel: 'flyers', target: 'c', monthly: money(30_000) },
      },
      {
        type: 'SetChannelBudget',
        companyId: 'player',
        payload: { channel: 'flyers', target: 'c', monthly: money(40_000) },
      },
    ] satisfies Command[];
    const state = queued.reduce<GameState>((s, c) => enqueue(s, c), opened);
    const pending = pendingChanges(state);
    expect(pending.stores[PLAYER_STORE]).toEqual({ price: 420, wageMonthly: 250_000 });
    expect(pending.stores['store-000001']).toBeUndefined();
    expect(pending.marketingBudgetMonthly).toBe(500_000);
    // Ngân sách kênh: khóa `kênh|mục tiêu`, lệnh sau ghi đè lệnh trước.
    expect(pending.channelBudgets).toEqual({ [channelKey('flyers', 'c')]: 40_000 });
    // Sau một tick hàng đợi trống.
    expect(pendingChanges(runDays(state, content, 1))).toEqual({
      stores: {},
      marketingBudgetMonthly: null,
      channelBudgets: {},
    });
  });
});
