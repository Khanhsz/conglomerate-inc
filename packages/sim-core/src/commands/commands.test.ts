import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { untyped as untypedJson } from '../test-support/untyped';
import { createGame, enqueue, validateCommand } from '../engine';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { post } from '../ledger/post';
import { money } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { LoadedContent } from '../types/content';
import type { GameState } from '../types/state';
import { applyQueuedCommands } from './registry';

const content = fixtureContent();
const AI_STORE = 'store-000001';

/**
 * Chỉ chạy pha áp dụng lệnh của tick (rồi tăng ngày), tách khỏi operations/brand… để kiểm đúng tác động của lệnh.
 * Thứ tự tick đầy đủ được kiểm trong engine.test.ts.
 */
function run(state: GameState, cmds: Command[], c: LoadedContent = content): GameState {
  const queued = cmds.reduce((s, cmd) => enqueue(s, cmd), state);
  return produce(queued, (d) => {
    applyQueuedCommands(d, ctxAt(queued, c));
    d.clock.day += 1;
  });
}

const cash = (s: GameState, companyId: string) => currentBalances(s.ledger, companyId)[ACC.Cash];
const overdraft = (s: GameState, companyId: string) => currentBalances(s.ledger, companyId)[ACC.Overdraft];
const store = (s: GameState, id: string) => must(s.stores[id], `store ${id}`);
const open = (districtId: string, companyId = 'player'): Command => ({
  type: 'OpenStore',
  companyId,
  payload: { districtId },
});

/** Lệnh bị từ chối: validate trả lý do, và sau step có đúng event đó, state khác không đổi gì do lệnh. */
function expectRejected(state: GameState, cmd: Command, reason: RegExp, c: LoadedContent = content) {
  const v = validateCommand(state, c, cmd);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(reason);
  const after = run(state, [cmd], c);
  const last = after.events[after.events.length - 1];
  expect(last?.kind).toBe('commandRejected');
  if (last?.kind === 'commandRejected') {
    expect(last.commandType).toBe(cmd.type);
    expect(last.reason).toMatch(reason);
  }
}

/** Lệnh dựng từ JSON (giả lập dữ liệu không qua kiểu từ UI/worker). */
const untyped = (json: string): Command => untypedJson<Command>(json);

describe('OpenStore', () => {
  it('opens a store with content defaults and pays capex from cash', () => {
    const s = run(createGame(content), [open('w')]);
    const st = store(s, 'store-000002');
    expect(st).toMatchObject({
      companyId: 'player',
      districtId: 'w',
      openedDay: 0,
      status: 'open',
      price: 350, // Pref × priceIndex (1.0 ở ngày 0)
      staff: 4,
      wageMonthly: 220_000,
      rentMonthly: 500_000,
      rentResetDay: 360,
      capex: 10_000_000,
      accumDep: 0,
      morale: 0.5,
      skill: 0.4,
      serviceLevel: 0.6,
    });
    expect('closedDay' in st).toBe(false);
    expect(s.storeIds).toEqual(['store-000001', 'store-000002']);
    expect(cash(s, 'player')).toBe(15_000_000);
    expect(currentBalances(s.ledger, 'player')[ACC.PPE]).toBe(10_000_000);
    expect(s.events.at(-1)).toEqual({
      day: 0,
      kind: 'storeOpened',
      companyId: 'player',
      storeId: 'store-000002',
      districtId: 'w',
    });
  });

  it('may use the remaining overdraft headroom', () => {
    const c = fixtureContent((d) => {
      must(d.scenario.companies[0]).startingCash = money(10_500_000);
    });
    const s = run(createGame(c), [open('e')], c); // capex 12,000,000 ≤ 10,500,000 + 2,000,000
    expect(cash(s, 'player')).toBe(0);
    expect(overdraft(s, 'player')).toBe(1_500_000);
  });

  it('rejects when cash + overdraft headroom < capex', () => {
    const c = fixtureContent((d) => {
      must(d.scenario.companies[0]).startingCash = money(9_999_999);
    });
    expectRejected(createGame(c), open('e'), /capex/, c); // 9,999,999 + 2,000,000 < 12,000,000
  });

  it('allows at most 3 open stores per district per company', () => {
    const c = fixtureContent((d) => {
      must(d.scenario.companies[0]).startingCash = money(100_000_000);
    });
    const s = run(createGame(c), [open('w'), open('w'), open('w')], c);
    expect(s.storeIds).toHaveLength(4);
    expectRejected(s, open('w'), /3/, c);
  });

  it('rejects unknown districts and companies, and companies not active', () => {
    const s = createGame(content);
    expectRejected(s, open('nowhere'), /nowhere/);
    expectRejected(s, open('w', 'ghost'), /ghost/);
    for (const status of ['distress', 'bankrupt'] as const) {
      const bad = produce(s, (d) => {
        must(d.companies['player']).status = status;
      });
      expectRejected(bad, open('w'), new RegExp(status));
    }
  });
});

describe('CloseStore', () => {
  const opened = run(createGame(content), [open('w')]);
  const close = (storeId: string, companyId = 'player'): Command => ({
    type: 'CloseStore',
    companyId,
    payload: { storeId },
  });

  it('writes off the book value (§6.1) and pays 3 months of rent', () => {
    const s = run(opened, [close('store-000002')]);
    const st = store(s, 'store-000002');
    expect(st.status).toBe('closed');
    expect(st.closedDay).toBe(1);
    const b = currentBalances(s.ledger, 'player');
    expect(b[ACC.PPE]).toBe(0);
    expect(b[ACC.LossOnDisposal]).toBe(10_000_000); // chưa khấu hao: lỗ = toàn bộ capex
    expect(b[ACC.Rent]).toBe(1_500_000); // 3 × 500,000
    expect(cash(s, 'player')).toBe(15_000_000 - 1_500_000);
    expect(s.events.at(-1)).toEqual({
      day: 1,
      kind: 'storeClosed',
      companyId: 'player',
      storeId: 'store-000002',
    });
  });

  it('uses the store’s accumulated depreciation: Dr AccumDep a, Dr Loss capex − a, Cr PP&E capex', () => {
    const depreciated = produce(opened, (d) => {
      post(d.ledger, {
        day: 0,
        companyId: 'player',
        memo: 'test depreciation',
        lines: [
          { account: ACC.Depreciation, debit: money(2_000_000), credit: money(0) },
          { account: ACC.AccumulatedDepreciation, debit: money(0), credit: money(2_000_000) },
        ],
      });
      must(d.stores['store-000002']).accumDep = money(2_000_000);
    });
    const s = run(depreciated, [close('store-000002')]);
    const b = currentBalances(s.ledger, 'player');
    expect(b[ACC.AccumulatedDepreciation]).toBe(0);
    expect(b[ACC.LossOnDisposal]).toBe(8_000_000);
    expect(b[ACC.PPE]).toBe(0);
  });

  it('rejects stores that are closed, unknown, or owned by another company', () => {
    const closed = run(opened, [close('store-000002')]);
    expectRejected(closed, close('store-000002'), /closed|đóng/);
    expectRejected(opened, close('store-999999'), /store-999999/);
    expectRejected(opened, close(AI_STORE), /ai-1|thuộc/);
  });
});

describe('SetPrice', () => {
  const opened = run(createGame(content), [open('w'), open('e')]);
  const setPrice = (storeId: string, price: number, companyId = 'player'): Command => ({
    type: 'SetPrice',
    companyId,
    payload: { storeId, price: money(price) },
  });

  it('accepts the band [0.3, 5] × Pref and rejects outside it', () => {
    // Pref = 350 ở ngày 0–1 (priceIndex tăng rất ít ở ngày 1) → [105, 1750]
    expect(validateCommand(opened, content, setPrice('store-000002', 106)).ok).toBe(true);
    expect(validateCommand(opened, content, setPrice('store-000002', 1749)).ok).toBe(true);
    expectRejected(opened, setPrice('store-000002', 104), /price|giá/i);
    expectRejected(opened, setPrice('store-000002', 1760), /price|giá/i);
  });

  it("'all' sets every open store of the company, not closed ones or other companies'", () => {
    const withClosed = run(opened, [
      { type: 'CloseStore', companyId: 'player', payload: { storeId: 'store-000003' } },
    ]);
    const s = run(withClosed, [setPrice('all', 500)]);
    expect(store(s, 'store-000002').price).toBe(500);
    expect(store(s, 'store-000003').price).toBe(350);
    expect(store(s, AI_STORE).price).toBe(350);
  });

  it('rejects malformed prices without throwing', () => {
    expectRejected(
      opened,
      untyped('{"type":"SetPrice","companyId":"player","payload":{"storeId":"all","price":350.5}}'),
      /price|giá/i,
    );
    expectRejected(
      opened,
      untyped('{"type":"SetPrice","companyId":"player","payload":{"storeId":"all","price":"350"}}'),
      /price|giá/i,
    );
    const nan = untyped('{"type":"SetPrice","companyId":"player","payload":{"storeId":"all","price":0}}');
    Reflect.set(nan.payload, 'price', Number.NaN);
    expectRejected(opened, nan, /price|giá/i);
  });
});

describe('SetStaff', () => {
  const opened = run(createGame(content), [open('w')]);
  const setStaff = (staff: number): Command => ({
    type: 'SetStaff',
    companyId: 'player',
    payload: { storeId: 'store-000002', staff },
  });

  it('accepts integers in [minStaff, 40]', () => {
    expect(store(run(opened, [setStaff(2)]), 'store-000002').staff).toBe(2);
    expect(store(run(opened, [setStaff(40)]), 'store-000002').staff).toBe(40);
    expectRejected(opened, setStaff(1), /staff|nhân viên/i);
    expectRejected(opened, setStaff(41), /staff|nhân viên/i);
    expectRejected(opened, setStaff(2.5), /staff|nhân viên/i);
  });

  it('blends skill when hiring (§4.3) and keeps it when reducing', () => {
    const skilled = produce(opened, (d) => {
      must(d.stores['store-000002']).skill = 1;
    });
    // (1 × 4 + 0.4 × 2) / 6 = 0.8
    expect(store(run(skilled, [setStaff(6)]), 'store-000002').skill).toBeCloseTo(0.8, 12);
    expect(store(run(skilled, [setStaff(3)]), 'store-000002').skill).toBe(1);
  });
});

describe('SetWage', () => {
  const opened = run(createGame(content), [open('w')]);
  const setWage = (wage: number, storeId = 'store-000002'): Command => ({
    type: 'SetWage',
    companyId: 'player',
    payload: { storeId, wageMonthly: money(wage) },
  });

  it('accepts [0.5, 3] × market wage', () => {
    // lương thị trường 220,000 × priceIndex (≈1 ở ngày 1) → [≈110,000, ≈660,000]
    expect(store(run(opened, [setWage(111_000)]), 'store-000002').wageMonthly).toBe(111_000);
    expect(store(run(opened, [setWage(659_000, 'all')]), 'store-000002').wageMonthly).toBe(659_000);
    expectRejected(opened, setWage(109_000), /wage|lương/i);
    expectRejected(opened, setWage(661_000), /wage|lương/i);
  });
});

describe('SetMarketingBudget', () => {
  const s0 = createGame(content);
  const budget = (monthly: number): Command => ({
    type: 'SetMarketingBudget',
    companyId: 'player',
    payload: { monthly: money(monthly) },
  });

  it('accepts 0 … $1M', () => {
    expect(must(run(s0, [budget(0)]).companies['player']).marketingBudgetMonthly).toBe(0);
    expect(must(run(s0, [budget(100_000_000)]).companies['player']).marketingBudgetMonthly).toBe(100_000_000);
    expectRejected(s0, budget(100_000_001), /marketing/i);
    expectRejected(s0, budget(-1), /marketing/i);
  });
});

describe('SetQualityTier', () => {
  const s0 = createGame(content);
  it('sets the company tier and rejects unknown tiers', () => {
    const s = run(s0, [{ type: 'SetQualityTier', companyId: 'player', payload: { tier: 'premium' } }]);
    expect(must(s.companies['player']).qualityTier).toBe('premium');
    expectRejected(
      s0,
      untyped('{"type":"SetQualityTier","companyId":"player","payload":{"tier":"gold"}}'),
      /gold/,
    );
  });
});

describe('validateCommand never throws on garbage', () => {
  it('property: arbitrary JSON commands are rejected or accepted, never thrown', () => {
    const s = run(createGame(content), [open('w')]);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(
            'OpenStore',
            'CloseStore',
            'SetPrice',
            'SetStaff',
            'SetWage',
            'SetMarketingBudget',
            'SetQualityTier',
          ),
          fc.string(),
        ),
        fc.oneof(fc.constant('player'), fc.string()),
        fc.jsonValue(),
        (type, companyId, payload) => {
          const cmd = untyped(JSON.stringify({ type, companyId, payload }));
          const v = validateCommand(s, content, cmd);
          expect(typeof v.ok).toBe('boolean');
          // step cũng không ném: lệnh hợp lệ được áp dụng, lệnh sai thành event.
          expect(() => run(s, [cmd])).not.toThrow();
        },
      ),
      { numRuns: Number(process.env['FC_RUNS'] ?? 100) },
    );
    expect(validateCommand(s, content, untyped('null')).ok).toBe(false);
    expect(validateCommand(s, content, untyped('{"type":"Nope","companyId":"player","payload":{}}')).ok).toBe(
      false,
    );
  });
});
