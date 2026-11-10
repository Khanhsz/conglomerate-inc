import {
  ACC,
  checkInvariants,
  createGame,
  currentBalances,
  enqueue,
  expectedDemand,
  hashState,
  money,
  runDays,
  selectors,
  step,
  type GameState,
} from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { loadDefaultContent } from './content';

const content = loadDefaultContent();

describe('m1-default: initial state', () => {
  const s = createGame(content);

  it('opens the 9 AI stores in sorted company order and pays capex', () => {
    expect(s.companyIds).toEqual(['ai-aura', 'ai-bean', 'ai-daily', 'player']);
    expect(s.storeIds.map((id) => [s.stores[id]?.companyId, s.stores[id]?.districtId])).toEqual([
      ['ai-aura', 'ne'],
      ['ai-aura', 'se'],
      ['ai-aura', 'c'],
      ['ai-bean', 'sw'],
      ['ai-bean', 's'],
      ['ai-bean', 'w'],
      ['ai-daily', 'c'],
      ['ai-daily', 'n'],
      ['ai-daily', 'e'],
    ]);
    const cash = (id: string) => currentBalances(s.ledger, id)[ACC.Cash];
    expect(cash('ai-aura')).toBe(60_000_000 - (13_000_000 + 13_000_000 + 14_000_000));
    expect(cash('ai-bean')).toBe(60_000_000 - (10_000_000 + 11_000_000 + 11_000_000));
    expect(cash('ai-daily')).toBe(60_000_000 - (14_000_000 + 12_000_000 + 12_000_000));
    expect(cash('player')).toBe(25_000_000);
  });

  it('AI stores start at target prices (rounded to 5 cents) and personality wages', () => {
    const byCompany = (id: string) =>
      s.storeIds.map((sid) => s.stores[sid]).filter((st) => st?.companyId === id);
    expect(byCompany('ai-bean').map((st) => [st?.price, st?.wageMonthly, st?.staff])).toEqual(
      Array(3).fill([250, 209_000, 5]), // 90 × 0.75 × 3.7 = 249.75 → 250; 0.95 × 220,000
    );
    expect(byCompany('ai-daily').map((st) => [st?.price, st?.wageMonthly])).toEqual(
      Array(3).fill([350, 231_000]),
    );
    expect(byCompany('ai-aura').map((st) => [st?.price, st?.wageMonthly])).toEqual(
      Array(3).fill([540, 264_000]),
    );
    expect(checkInvariants(s, content)).toEqual([]);
  });

  // Số tham chiếu từ một script độc lập (cùng công thức economic-model §3, viết riêng ở kickoff),
  // chạy với đúng điều kiện ngày 0: giá đã làm tròn, A = 0.05, W = 0.6, priceIndex = 1.
  it('expected demand on day 0 matches the independent back-of-envelope script', () => {
    const snap = expectedDemand(s, content);
    expect(snap.potential).toBeCloseTo(8949.55, 6);
    expect(snap.captured).toBeCloseTo(4007.3798446855603, 6);
    const reference: Record<string, number> = {
      'store-000001': 337.498583,
      'store-000002': 314.089982,
      'store-000003': 470.54321,
      'store-000004': 365.001799,
      'store-000005': 471.962469,
      'store-000006': 509.261255,
      'store-000007': 575.910477, // cửa hàng balanced ở quận c
      'store-000008': 502.418349,
      'store-000009': 460.693722,
    };
    for (const [id, value] of Object.entries(reference)) expect(snap.byStore[id]).toBeCloseTo(value, 5);
    const shares = selectors.marketShares(s, content);
    expect(shares.industryShare).toBeCloseTo(0.44777445175294406, 9);
    expect(shares.byCompany['player']).toBe(0);
  });
});

describe('m1-default: 360 days', () => {
  function play(seed: number, check: boolean): GameState {
    let s = createGame(content, { seed });
    s = enqueue(s, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'c' } });
    for (let day = 0; day < 360; day++) {
      if (day === 45)
        s = enqueue(s, {
          type: 'SetPrice',
          companyId: 'player',
          payload: { storeId: 'all', price: money(380) },
        });
      s = step(s, content);
      if (check) expect(checkInvariants(s, content)).toEqual([]);
    }
    return s;
  }

  it('keeps every invariant each day and is deterministic per seed', () => {
    const a = play(42, true);
    expect(a.clock.day).toBe(360);
    expect(a.macro.priceIndex).toBeCloseTo(1.03 / (1 + (1.03 ** (1 / 360) - 1)), 9); // 359 lần nhân (ngày 1…359)
    expect(hashState(play(42, false))).toBe(hashState(a));
    expect(hashState(play(43, false))).not.toBe(hashState(a));
  }, 60_000); // checkInvariants quét lại toàn sổ mỗi ngày

  it('runDays reaches the same state as stepping', () => {
    const s0 = createGame(content);
    let stepped = s0;
    for (let i = 0; i < 60; i++) stepped = step(stepped, content);
    expect(hashState(runDays(s0, content, 60))).toBe(hashState(stepped));
  });
});
