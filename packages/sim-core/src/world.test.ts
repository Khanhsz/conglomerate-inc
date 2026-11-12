import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from './engine';
import { checkInvariants } from './invariants';
import { money } from './money';
import { brandLift, brandSystem } from './systems/brand';
import { expectedDemand } from './systems/demand';
import { ctxAt } from './test-support/context';
import { fixtureContent, twoCityContent } from './test-support/fixture';
import { must } from './test-support/must';
import type { Command } from './types/commands';
import type { GameState } from './types/state';
import { cityOfDistrict, districtById, worldOf } from './world';

// Hai thành phố giống hệt nhau: Testville [w, e] và Eastville [w2, e2]; phân khúc [office, students].
// Ô nhận biết: [w·office, w·students, e·office, e·students, w2·office, w2·students, e2·office, e2·students].
const one = fixtureContent();
const two = twoCityContent();
const DELTA = 0.003;
const runBrand = (s: GameState, c = two) => produce(s, (d) => brandSystem(d, ctxAt(s, c)));
const cells = (s: GameState, id = 'player') => must(s.companies[id]).awareness;
const play = (state: GameState, cmds: Command[], days = 1, c = two): GameState =>
  runDays(
    cmds.reduce((s, cmd) => enqueue(s, cmd), state),
    c,
    days,
  );
const open = (districtId: string): Command => ({
  type: 'OpenStore',
  companyId: 'player',
  payload: { districtId },
});
const budget = (monthly: number): Command => ({
  type: 'SetMarketingBudget',
  companyId: 'player',
  payload: { monthly: money(monthly) },
});

describe('world (ADR-0003): flat list of districts across cities', () => {
  it('orders districts by city then by position, with city lookups and populations', () => {
    const w = worldOf(two);
    expect(w.districts.map((d) => d.id)).toEqual(['w', 'e', 'w2', 'e2']);
    expect(w.cityOf).toEqual([0, 0, 1, 1]);
    expect(w.cityPop).toEqual([22_000, 22_000]);
    expect(w.cityStart).toEqual([0, 2]);
    expect(w.citySize).toEqual([2, 2]);
    expect(districtById(two, 'e2')?.pop).toBe(12_000);
    expect(cityOfDistrict(two, 'w2')?.id).toBe('eastville');
    expect(cityOfDistrict(two, 'nowhere')).toBeUndefined();
    expect(worldOf(two)).toBe(w); // cache theo scenario
  });

  it('a game on two cities has awareness cells and district ids for the whole world', () => {
    const s = createGame(two);
    expect(cells(s)).toHaveLength(8);
    expect(s.city.districtIds).toEqual(['w', 'e', 'w2', 'e2']);
    expect(checkInvariants(s, two)).toEqual([]);
  });
});

describe('demand across cities (economic-model §2)', () => {
  it('customers only buy in their own city: an empty second city changes nothing, bit for bit', () => {
    const a = expectedDemand(createGame(one), one);
    const b = expectedDemand(createGame(two), two);
    expect(b.byStore).toEqual(a.byStore);
    expect(b.captured).toBe(a.captured);
    // Tiềm năng gấp đôi: dân thành phố thứ hai không có cửa hàng nào trong tầm.
    expect(b.potential).toBeCloseTo(2 * a.potential, 9);
  });

  it('a store in the second city serves only that city, even at the same grid position', () => {
    const s = play(createGame(two), [open('e2')]);
    const storeId = must(s.storeIds.find((id) => s.stores[id]?.companyId === 'player'));
    const demand = expectedDemand(s, two);
    const ai = must(s.storeIds.find((id) => s.stores[id]?.companyId === 'ai-1'));
    // Cửa hàng AI ở `e` (Testville) không mất khách vì cửa hàng mới ở `e2` (Eastville).
    const baseline = play(createGame(two), []); // cùng 1 ngày, không mở cửa hàng
    expect(demand.byStore[ai]).toBe(expectedDemand(baseline, two).byStore[ai]);
    expect(must(demand.byStore[storeId])).toBeGreaterThan(0);
    expect(checkInvariants(runDays(s, two, 40), two)).toEqual([]);
  });
});

describe('brand across cities (economic-model §5, M1.8)', () => {
  it('word of mouth stays in the city where customers were served', () => {
    const s0 = produce(createGame(two), (d) => {
      must(d.stores['store-000001']).today.served = 1100; // cửa hàng AI ở Testville
    });
    const a = cells(runBrand(s0), 'ai-1');
    const withWom = 0.05 - DELTA * 0.05 + (0.002 * 1100) / 22_000;
    const without = 0.05 - DELTA * 0.05;
    expect(a.slice(0, 4)).toEqual([withWom, withWom, withWom, withWom]);
    expect(a.slice(4)).toEqual([without, without, without, without]);
  });

  it('general budget goes to the cities where the company has open stores', () => {
    // Chỉ có cửa hàng ở Eastville: toàn bộ ngân sách cho Eastville, Testville không được gì.
    const s = runBrand(play(createGame(two), [open('w2'), budget(300_000)]));
    const lift = brandLift(0.01, 300_000 / 30, 10_000, 1);
    const a = cells(s);
    expect(must(a[0])).toBeCloseTo(must(a[1]), 15);
    expect(must(a[4])).toBeGreaterThan(must(a[0]) + 0.9 * 0.95 * lift);
    // Testville chỉ suy giảm (người chơi không phục vụ ai ở đó).
    expect(new Set(a.slice(0, 4)).size).toBe(1);
  });

  it('split by population when the company is in several cities; everywhere when it has no store', () => {
    const both = play(createGame(two), [open('w'), open('w2'), budget(300_000)]);
    const before = cells(both);
    const after = cells(
      runBrand(
        produce(both, (d) => {
          for (const id of d.storeIds) must(d.stores[id]).today.served = 0;
        }),
      ),
    );
    // Hai thành phố cùng dân số: mỗi nơi nhận nửa ngân sách.
    const half = brandLift(0.01, 300_000 / 30 / 2, 10_000, 1);
    for (const i of [0, 4]) {
      const b = must(before[i]);
      expect(must(after[i])).toBeCloseTo(b + (1 - b) * half - DELTA * b, 15);
    }
    const none = runBrand(
      produce(createGame(two), (d) => {
        must(d.companies['player']).marketingBudgetMonthly = money(300_000);
      }),
    );
    expect(new Set(cells(none)).size).toBe(1);
    expect(must(cells(none)[0])).toBeCloseTo(0.05 + 0.95 * half - DELTA * 0.05, 15);
  });

  it('a city channel only lifts the city it targets; the target must be a city id', () => {
    const ready = play(createGame(two), [
      { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'w', size: 'small' } },
      { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'marketing' } },
    ]);
    const social = (target: string): Command => ({
      type: 'SetChannelBudget',
      companyId: 'player',
      payload: { channel: 'social', target, monthly: money(240_000) },
    });
    expect(validateCommand(ready, two, social('eastville')).ok).toBe(true);
    expect(validateCommand(ready, two, social('w2')).ok).toBe(false);
    expect(validateCommand(ready, two, social('city')).ok).toBe(false);
    const s = play(ready, [social('eastville')], 3);
    const a = cells(s);
    expect(must(a[5])).toBeGreaterThan(must(a[1]) + 0.02); // students ở Eastville so với Testville
    expect(new Set(a.slice(0, 4)).size).toBe(1);
    expect(must(s.companies['player']).channelBudgets).toEqual([
      { channel: 'social', target: 'eastville', monthly: 240_000 },
    ]);
    expect(checkInvariants(s, two)).toEqual([]);
  });
});
