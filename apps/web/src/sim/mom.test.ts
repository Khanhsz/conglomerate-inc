import { createGame, enqueue, runDays } from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from './content';
import { momRow, monthOverMonth, storeMonthOverMonth } from './mom';

describe('monthOverMonth (finance tables compare with the previous month)', () => {
  it('a row: signed delta, percentage of |previous|, null without a previous month or when previous is 0', () => {
    expect(momRow('a', 'A', 120, 100)).toMatchObject({ delta: 20, pct: 0.2 });
    expect(momRow('a', 'A', 80, 100)).toMatchObject({ delta: -20, pct: -0.2 });
    expect(momRow('a', 'A', 50, -100)).toMatchObject({ delta: 150, pct: 1.5 });
    expect(momRow('a', 'A', 50, 0)).toMatchObject({ delta: 50, pct: null });
    expect(momRow('a', 'A', 50, null)).toMatchObject({ delta: null, pct: null });
  });

  it('uses the last two closed months; the first month has no comparison', () => {
    const content = loadGameContent();
    const game = enqueue(createGame(content), {
      type: 'OpenStore',
      companyId: 'player',
      payload: { districtId: 'c' },
    });
    const one = runDays(game, content, 30);
    const first = monthOverMonth(one.statements['player'] ?? []);
    expect(first.pnl?.previousMonth).toBeNull();
    expect(first.pnl?.rows.every((r) => r.delta === null)).toBe(true);
    const two = runDays(one, content, 30);
    const s = two.statements['player'] ?? [];
    const mom = monthOverMonth(s);
    const revenue = mom.pnl?.rows.find((r) => r.key === 'revenue');
    expect(revenue?.current).toBe(s[1]?.pnl.revenue);
    expect(revenue?.previous).toBe(s[0]?.pnl.revenue);
    expect(revenue?.delta).toBe((s[1]?.pnl.revenue ?? 0) - (s[0]?.pnl.revenue ?? 0));
    expect(mom.balanceSheet?.rows.find((r) => r.key === 'cash')?.current).toBe(s[1]?.balanceSheet.cash);
    expect(mom.cashFlow?.month).toBe(1);
  });
});

describe('storeMonthOverMonth', () => {
  const m = (month: number, revenue: number, served: number) => ({
    month,
    days: 30,
    served,
    capacity: 3000,
    revenue,
    cogs: 100,
    wagesTotal: 200,
    rent: 300,
    amenities: 0,
    contribution: revenue - 600,
  });
  it('compares the last two months; null when there is no month', () => {
    expect(storeMonthOverMonth([])).toBeNull();
    const t = storeMonthOverMonth([m(0, 1000, 1500), m(1, 1500, 1800)]);
    expect(t?.previousMonth).toBe(0);
    const get = (k: string) => t?.rows.find((r) => r.key === k);
    expect(get('revenue')).toMatchObject({ current: 1500, previous: 1000, delta: 500, pct: 0.5 });
    expect(get('customersPerDay')).toMatchObject({ current: 60, previous: 50, delta: 10, unit: 'count' });
    expect(get('utilization')?.delta).toBeCloseTo(0.1);
    expect(get('contribution')).toMatchObject({ current: 900, previous: 400, delta: 500, strong: true });
  });
});
