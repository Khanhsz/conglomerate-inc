import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { EVENTS_KEEP } from './constants';
import { createGame, enqueue, makeContext, runSystems, step } from './engine';
import { stableStringify } from './hash';
import { hashState } from './invariants';
import { money } from './money';
import { fixtureContent } from './test-support/fixture';
import { must } from './test-support/must';
import type { Command } from './types/commands';
import type { LoadedContent } from './types/content';
import type { GameState } from './types/state';
import { beginTick } from './tick';

/** Thành phố gấp 3 dân số: mọi công ty có lãi, chạy đủ 2 năm không phá sản (để mọi nhánh đều chạy). */
const content = fixtureContent((d) => {
  for (const district of d.scenario.city.districts) district.pop *= 3;
});
const RUNS = Number(process.env['FC_RUNS'] ?? 100);

/** Cách cũ (ADR-0001): cùng các system, chạy trên draft immer. Là chuẩn để so. */
function stepImmer(state: GameState, c: LoadedContent): GameState {
  const ctx = makeContext(state, c);
  return produce(state, (draft) => runSystems(draft, ctx));
}

/** Kịch bản chạm mọi system và lệnh M1.6/M1.7: cửa hàng, giá, nhân sự, văn phòng, phòng ban, HR, tiện ích, vay. */
const SCRIPT: readonly (readonly [number, Command])[] = [
  [0, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } }],
  [0, { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'w', size: 'medium' } }],
  [1, { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'hr' } }],
  [1, { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'finance' } }],
  [
    2,
    {
      type: 'SetHrPolicy',
      companyId: 'player',
      payload: { trainingLevel: 2, benefitsLevel: 1, bonusRate: 0.1, wageRatio: 1.1 },
    },
  ],
  [
    3,
    {
      type: 'SetStoreAmenity',
      companyId: 'player',
      payload: { storeId: 'store-000002', amenity: 'wifi', on: true },
    },
  ],
  [10, { type: 'SetPrice', companyId: 'player', payload: { storeId: 'all', price: money(380) } }],
  [12, { type: 'SetStaff', companyId: 'player', payload: { storeId: 'store-000002', staff: 6 } }],
  [20, { type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(200_000) } }],
  [65, { type: 'TakeLoan', companyId: 'player', payload: { principal: money(1_000_000), termMonths: 12 } }],
  [70, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'e' } }],
  [100, { type: 'SetCreditLine', companyId: 'player', payload: { limit: money(2_000_000) } }],
  [200, { type: 'CloseStore', companyId: 'player', payload: { storeId: 'store-000003' } }],
  [250, { type: 'CloseDepartment', companyId: 'player', payload: { dept: 'hr' } }],
];

function play(stepFn: (s: GameState, c: LoadedContent) => GameState, days: number, seed?: number): string[] {
  let state = createGame(content, seed === undefined ? {} : { seed });
  const hashes: string[] = [];
  for (let day = 0; day < days; day++) {
    for (const [at, cmd] of SCRIPT) if (at === day) state = enqueue(state, cmd);
    state = stepFn(state, content);
    if (state.clock.day % 30 === 0) hashes.push(hashState(state));
  }
  return hashes;
}

describe('tick without immer (ADR-0002)', () => {
  it('gives exactly the same states as the immer tick over 2 years (hash every month)', () => {
    expect(play(step, 720)).toEqual(play(stepImmer, 720));
  }, 60_000);

  it('property: same result as immer for any seed (1 year)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        expect(play(step, 360, seed)).toEqual(play(stepImmer, 360, seed));
      }),
      { numRuns: Math.max(3, Math.floor(RUNS / 25)) },
    );
  }, 120_000);

  it('never touches the input state', () => {
    let state = createGame(content);
    for (const [at, cmd] of SCRIPT) if (at === 0) state = enqueue(state, cmd);
    const before = stableStringify(state);
    step(state, content);
    expect(stableStringify(state)).toBe(before);
  });

  it('beginTick copies every mutable branch: writes to the copy leave the frozen original intact', () => {
    // Chế độ kiểm tra bật trong test: state sau step bị đóng băng sâu, nên ghi vào nhánh chưa sao chép sẽ ném.
    const state = step(enqueue(createGame(content), must(SCRIPT[0])[1]), content);
    const before = stableStringify(state);
    const copy = beginTick(state);
    const store = must(copy.stores['store-000002']);
    store.today.demand = -1;
    store.mtd.revenue = money(-1);
    store.recentDays.push({ day: -1, demand: 0, served: 0, capacity: 0 });
    must(copy.companies['player']).officeAccrued.departments.hr = 5;
    copy.events.push({ day: -1, kind: 'officeReleased', companyId: 'player' });
    expect(stableStringify(state)).toBe(before);
  });
});

describe('events window (#54)', () => {
  it('keeps at most EVENTS_KEEP events while eventSeq counts every event', () => {
    let state = createGame(content);
    const initial = state.eventSeq;
    expect(initial).toBe(state.events.length);
    // Mỗi ngày một lệnh bị từ chối = một event.
    const bad: Command = { type: 'CloseStore', companyId: 'player', payload: { storeId: 'store-999999' } };
    for (let d = 0; d < EVENTS_KEEP + 20; d++) state = step(enqueue(state, bad), content);
    expect(state.events.length).toBeLessThanOrEqual(EVENTS_KEEP);
    expect(state.eventSeq).toBeGreaterThanOrEqual(initial + EVENTS_KEEP + 20);
    expect(state.events[state.events.length - 1]?.kind).toBe('commandRejected');
  }, 60_000);
});
