import {
  createGame,
  enqueue,
  money,
  runDays,
  stableStringify,
  step,
  type Command,
  type GameState,
} from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from './content';
import { buildSnapshot, shouldPause } from './snapshot';

const content = loadGameContent();
const open: Command = { type: 'OpenStore', companyId: 'player', payload: { districtId: 'c' } };

describe('buildSnapshot', () => {
  const s0 = createGame(content);
  const snap = buildSnapshot(s0, content, 0);

  it('describes a new game: calendar, player money, 3×3 map with AI stores', () => {
    expect(snap.calendar).toEqual({ day: 0, year: 1, month: 1, dayOfMonth: 1 });
    expect(snap.player).toMatchObject({ id: 'player', cash: 25_000_000, overdraft: 0, status: 'active' });
    expect(snap.city).toMatchObject({ name: 'Riverton', gridW: 3, gridH: 3 });
    expect(snap.districts).toHaveLength(9);
    const c = snap.districts.find((d) => d.id === 'c');
    expect(c).toMatchObject({ x: 1, y: 1, pop: 30_000, rentMonthly: 900_000, capex: 14_000_000 });
    expect(c?.stores).toEqual([
      { companyId: 'ai-aura', count: 1 },
      { companyId: 'ai-daily', count: 1 },
    ]);
    expect(snap.stores).toEqual([]);
    expect(snap.statements).toEqual([]);
    expect(snap.companies.map((x) => x.id)).toEqual(['player', 'ai-aura', 'ai-bean', 'ai-daily']);
    expect(snap.gameOver).toBeNull();
  });

  it("shows the player's own events and only public events of rivals", () => {
    // Một lệnh sai của AI tạo event riêng tư (commandRejected) trong state.
    const aiMistake: Command = {
      type: 'SetStaff',
      companyId: 'ai-bean',
      payload: { storeId: 'store-000004', staff: 99 },
    };
    const s = runDays(enqueue(enqueue(s0, open), aiMistake), content, 95);
    expect(s.events.some((e) => e.companyId === 'ai-bean' && e.kind === 'commandRejected')).toBe(true);
    const later = buildSnapshot(s, content, 0);
    expect(later.events.some((e) => e.companyId === 'ai-bean' && e.kind === 'commandRejected')).toBe(false);
    for (const e of later.events) {
      if (e.companyId !== 'player')
        expect(['storeOpened', 'storeClosed', 'distress', 'bankrupt']).toContain(e.kind);
    }
    expect(later.events.some((e) => e.companyId === 'player')).toBe(true);
  });

  it('is small and serializable: no ledger entries, no NaN', () => {
    expect(() => stableStringify(snap)).not.toThrow();
    expect(JSON.stringify(snap)).not.toContain('"entries"');
  });

  it('after opening a store in c and playing 60 days: one store row, two months of P&L with revenue', () => {
    const s = runDays(enqueue(s0, open), content, 60);
    const later = buildSnapshot(s, content, 16);
    expect(later.speed).toBe(16);
    expect(later.calendar).toEqual({ day: 60, year: 1, month: 3, dayOfMonth: 1 });
    expect(later.stores.map((r) => r.districtId)).toEqual(['c']);
    expect(later.statements.map((m) => m.month)).toEqual([0, 1]);
    for (const m of later.statements) expect(m.pnl.revenue).toBeGreaterThan(0);
    const player = later.companies.find((x) => x.id === 'player');
    expect(player?.storeCount).toBe(1);
    expect(player?.marketShare).toBeGreaterThan(0);
    expect(later.events[0]?.day).toBeGreaterThanOrEqual(later.events[later.events.length - 1]?.day ?? 0); // mới nhất trước
  });

  it('marketing: awareness per district, the four channels after general, locked until the department opens', () => {
    expect(snap.marketing.open).toBe(false);
    expect(snap.marketing.byDistrict).toHaveLength(9);
    for (const a of snap.marketing.byDistrict) expect(a).toBeCloseTo(0.05, 12);
    expect(snap.marketing.view.channels.map((c) => c.channel)).toEqual([
      'general',
      'events',
      'flyers',
      'outdoor',
      'social',
    ]);
    expect(snap.limits.channelBudget).toEqual({ min: 0, max: 100_000_000, step: 10_000 });
    const setup: Command[] = [
      { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'c', size: 'small' } },
      { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'marketing' } },
      {
        type: 'SetChannelBudget',
        companyId: 'player',
        payload: { channel: 'flyers', target: 'c', monthly: money(30_000) },
      },
    ];
    const withDept = runDays(
      setup.reduce<GameState>((s, c) => enqueue(s, c), s0),
      content,
      10,
    );
    const later = buildSnapshot(withDept, content, 0).marketing;
    expect(later.open).toBe(true);
    const c = snap.districts.findIndex((d) => d.id === 'c');
    // Chỉ quận c được chi tờ rơi: nhận biết trung bình của quận đó cao nhất.
    expect(later.byDistrict[c]).toBe(Math.max(...later.byDistrict));
    expect(later.view.channels.find((x) => x.channel === 'flyers')?.monthlySpend).toBe(30_000);
  });

  it('keeps only the last 12 months of statements and 50 events', () => {
    const s = runDays(s0, content, 15 * 30);
    const later = buildSnapshot(s, content, 0);
    expect(later.statements.map((m) => m.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(later.events.length).toBeLessThanOrEqual(50);
  }, 30_000);
});

describe('shouldPause', () => {
  it('asks to pause when a step adds a distress or bankrupt event for the player, not otherwise', () => {
    const plan: Command[] = [
      open,
      { type: 'SetPrice', companyId: 'player', payload: { storeId: 'all', price: money(105) } },
      { type: 'SetWage', companyId: 'player', payload: { storeId: 'all', wageMonthly: money(660_000) } },
      { type: 'SetStaff', companyId: 'player', payload: { storeId: 'store-000010', staff: 40 } },
    ];
    let s: GameState = plan.reduce((acc, c) => enqueue(acc, c), createGame(content));
    const pauses: number[] = [];
    for (let i = 0; i < 6 * 30; i++) {
      const next = step(s, content);
      if (shouldPause(s, next)) pauses.push(next.clock.day);
      s = next;
    }
    expect(pauses.length).toBeGreaterThanOrEqual(1);
    expect(pauses.every((d) => d % 30 === 0)).toBe(true); // chỉ ở lúc chốt tháng
    expect(buildSnapshot(s, content, 0).gameOver?.kind).toBe('bankrupt');
  }, 30_000);
});
