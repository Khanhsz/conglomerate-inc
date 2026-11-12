/**
 * Hồi quy M1 (spec M1.6 §1): cấu hình mặc định (không văn phòng, menu `core`, kênh `general`, chính sách mặc định)
 * phải cho ledger và báo cáo **giống hệt từng cent** với M1. Hash dưới đây được tạo từ code M1 trước khi thêm M1.6.
 * Chỉ chiếu các trường đã có ở M1, nên thêm trường mới (bằng 0) vào state hay báo cáo không làm đổi hash.
 */
import { createGame, enqueue, hashValue, money, runDays, type Command, type GameState } from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { loadDefaultContent } from './content';

const content = loadDefaultContent();

/** Kịch bản người chơi cố định: mở 2 cửa hàng, chỉnh giá / nhân viên / lương / marketing / tier, vay rồi trả sớm. */
const SCRIPT: readonly (readonly [day: number, cmd: Command])[] = [
  [0, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'c' } }],
  [0, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'nw' } }],
  [20, { type: 'SetPrice', companyId: 'player', payload: { storeId: 'all', price: money(380) } }],
  [31, { type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(300_000) } }],
  [45, { type: 'SetStaff', companyId: 'player', payload: { storeId: 'store-000010', staff: 6 } }],
  [60, { type: 'SetWage', companyId: 'player', payload: { storeId: 'all', wageMonthly: money(250_000) } }],
  [120, { type: 'SetQualityTier', companyId: 'player', payload: { tier: 'premium' } }],
  [125, { type: 'SetPrice', companyId: 'player', payload: { storeId: 'store-000011', price: money(450) } }],
  [245, { type: 'TakeLoan', companyId: 'player', payload: { principal: money(2_000_000), termMonths: 24 } }],
  [500, { type: 'RepayLoan', companyId: 'player', payload: { loanId: 'loan-000001' } }],
];
const DAYS = 720;

function play(): GameState {
  let state = createGame(content);
  let day = 0;
  for (const [at, cmd] of SCRIPT) {
    state = runDays(state, content, at - day);
    day = at;
    state = enqueue(state, cmd);
  }
  return runDays(state, content, DAYS - day);
}

const PNL = [
  'revenue',
  'cogs',
  'grossProfit',
  'wages',
  'rent',
  'marketing',
  'admin',
  'ebitda',
  'depreciation',
  'lossOnDisposal',
  'ebit',
  'interest',
  'preTax',
  'incomeTax',
  'netIncome',
] as const;
const BS = [
  'cash',
  'ppe',
  'accumulatedDepreciation',
  'totalAssets',
  'overdraft',
  'loans',
  'taxPayable',
  'totalLiabilities',
  'shareCapital',
  'retainedEarnings',
  'totalEquity',
] as const;
const CF = [
  'openingCash',
  'netIncome',
  'depreciation',
  'lossOnDisposal',
  'changeInTaxPayable',
  'cfo',
  'capex',
  'cfi',
  'equityIssued',
  'borrowings',
  'principalRepaid',
  'changeInOverdraft',
  'cff',
  'netChange',
  'closingCash',
] as const;
const pick = <K extends string>(o: Readonly<Record<K, unknown>>, keys: readonly K[]) => keys.map((k) => o[k]);

describe('M1 regression (default configuration reproduces M1 exactly)', () => {
  const state = play();
  const entries = state.ledger.entries.map((e) => [
    e.day,
    e.companyId,
    e.memo,
    e.lines.map((l) => [l.account, l.debit, l.credit]),
  ]);
  const statements = state.companyIds.map((id) =>
    (state.statements[id] ?? []).map((s) => [
      s.month,
      pick(s.pnl, PNL),
      pick(s.balanceSheet, BS),
      pick(s.cashFlow, CF),
    ]),
  );

  it('the scripted player actually did things (guards against a silent no-op script)', () => {
    const player = state.storeIds.filter((id) => state.stores[id]?.companyId === 'player');
    expect(player).toHaveLength(2);
    expect(state.events.some((e) => e.kind === 'loanRepaid')).toBe(true);
    expect(state.events.filter((e) => e.kind === 'commandRejected')).toEqual([]);
  });

  it('ledger entries are identical to M1', () => {
    expect({ count: entries.length, hash: hashValue(entries) }).toMatchInlineSnapshot(`
      {
        "count": 5665,
        "hash": "82971f63ee843cd9",
      }
    `);
  });

  it('monthly statements are identical to M1', () => {
    expect(hashValue(statements)).toMatchInlineSnapshot(`"1f781a5649ad431f"`);
  });
}, 60_000);
