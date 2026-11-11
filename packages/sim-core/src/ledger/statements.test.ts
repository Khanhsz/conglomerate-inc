import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lastDayOfMonth, monthOf } from '../calendar';
import { money, type Money } from '../money';
import type { JournalLine, Ledger } from '../types/ledger';
import type { MonthlyStatements } from '../types/statements';
import { ACC, type AccountCode } from './accounts';
import { balancesAt, currentBalances, retainedEarnings } from './balances';
import { pay } from './payments';
import { createLedger, post } from './post';
import { buildMonthlyStatements, checkStatements } from './statements';

const dr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(n), credit: money(0) });
const cr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(0), credit: money(n) });
const ops = { storeCount: 1, avgUtilization: 0.9 };

// ---------------------------------------------------------------------------
// Ví dụ tháng 0 kiểm tay được (đơn vị: cent; $1 = 100).
//
//   ngày 0   góp vốn                   Nợ Cash 25,000,000 / Có ShareCapital
//   ngày 0   mua TSCĐ (fit-out)        Nợ PPE  14,000,000 / Có Cash
//   ngày 10  doanh thu                 Nợ Cash  4,725,000 / Có Revenue
//   ngày 10  giá vốn                   Nợ COGS  1,215,000 / Có Cash
//   ngày 15  vay                       Nợ Cash  5,000,000 / Có Loans
//   ngày 29  lương 1,155,000 + thuê 900,000 + admin 300,000 / Có Cash 2,355,000
//   ngày 29  khấu hao floor(14,000,000 / 60) = 233,333   Nợ Depreciation / Có AccumDep
//   ngày 29  thuế round(20% × 921,667) = round(184,333.4) = 184,333   Nợ IncomeTax / Có TaxPayable
//
// P&L:  gross profit = 4,725,000 − 1,215,000 = 3,510,000
//       EBITDA = 3,510,000 − 1,155,000 − 900,000 − 300,000 = 1,155,000
//       EBIT = 1,155,000 − 233,333 = 921,667 = pre-tax
//       net income = 921,667 − 184,333 = 737,334
// Cash: 25,000,000 − 14,000,000 + 4,725,000 − 1,215,000 + 5,000,000 − 2,355,000 = 17,155,000
// BS:   tài sản = 17,155,000 + 14,000,000 − 233,333 = 30,921,667
//       nợ = 5,000,000 + 184,333 = 5,184,333;  vốn chủ = 25,000,000 + 737,334 = 25,737,334
//       5,184,333 + 25,737,334 = 30,921,667 ✓
// CF:   CFO = 737,334 + 233,333 + 0 + 184,333 = 1,155,000
//       CFI = −14,000,000;  CFF = 25,000,000 + 5,000,000 = 30,000,000
//       1,155,000 − 14,000,000 + 30,000,000 = 17,155,000 = ΔCash ✓
// ---------------------------------------------------------------------------
function exampleLedger(): Ledger {
  const l = createLedger();
  const c = 'player';
  post(l, {
    day: 0,
    companyId: c,
    memo: 'capital',
    lines: [dr(ACC.Cash, 25_000_000), cr(ACC.ShareCapital, 25_000_000)],
  });
  pay(l, {
    companyId: c,
    day: 0,
    memo: 'fit-out',
    debits: [{ account: ACC.PPE, amount: money(14_000_000) }],
  });
  post(l, {
    day: 10,
    companyId: c,
    memo: 'sales',
    lines: [dr(ACC.Cash, 4_725_000), cr(ACC.Revenue, 4_725_000)],
  });
  pay(l, { companyId: c, day: 10, memo: 'cogs', debits: [{ account: ACC.COGS, amount: money(1_215_000) }] });
  post(l, {
    day: 15,
    companyId: c,
    memo: 'loan',
    lines: [dr(ACC.Cash, 5_000_000), cr(ACC.Loans, 5_000_000)],
  });
  pay(l, {
    companyId: c,
    day: 29,
    memo: 'month close',
    debits: [
      { account: ACC.Wages, amount: money(1_155_000) },
      { account: ACC.Rent, amount: money(900_000) },
      { account: ACC.Admin, amount: money(300_000) },
    ],
  });
  post(l, {
    day: 29,
    companyId: c,
    memo: 'depreciation',
    lines: [dr(ACC.Depreciation, 233_333), cr(ACC.AccumulatedDepreciation, 233_333)],
  });
  post(l, {
    day: 29,
    companyId: c,
    memo: 'tax',
    lines: [dr(ACC.IncomeTax, 184_333), cr(ACC.TaxPayable, 184_333)],
  });
  return l;
}

describe('buildMonthlyStatements — hand-checked month', () => {
  const s = buildMonthlyStatements(exampleLedger(), 'player', 0, ops);

  it('P&L', () => {
    expect(s.pnl).toEqual({
      revenue: 4_725_000,
      cogs: 1_215_000,
      grossProfit: 3_510_000,
      wages: 1_155_000,
      amenities: 0,
      rent: 900_000,
      marketing: 0,
      admin: 300_000,
      officeRent: 0,
      departments: 0,
      research: 0,
      ebitda: 1_155_000,
      depreciation: 233_333,
      lossOnDisposal: 0,
      ebit: 921_667,
      interest: 0,
      preTax: 921_667,
      incomeTax: 184_333,
      netIncome: 737_334,
    });
  });

  it('balance sheet', () => {
    expect(s.balanceSheet).toEqual({
      cash: 17_155_000,
      ppe: 14_000_000,
      accumulatedDepreciation: 233_333,
      totalAssets: 30_921_667,
      overdraft: 0,
      loans: 5_000_000,
      taxPayable: 184_333,
      totalLiabilities: 5_184_333,
      shareCapital: 25_000_000,
      retainedEarnings: 737_334,
      totalEquity: 25_737_334,
    });
  });

  it('cash flow (indirect)', () => {
    expect(s.cashFlow).toEqual({
      openingCash: 0,
      netIncome: 737_334,
      depreciation: 233_333,
      lossOnDisposal: 0,
      changeInTaxPayable: 184_333,
      cfo: 1_155_000,
      capex: 14_000_000,
      cfi: -14_000_000,
      equityIssued: 25_000_000,
      borrowings: 5_000_000,
      principalRepaid: 0,
      changeInOverdraft: 0,
      cff: 30_000_000,
      netChange: 17_155_000,
      closingCash: 17_155_000,
    });
  });

  it('KPIs', () => {
    expect(s.kpis.grossMargin).toBeCloseTo(3_510_000 / 4_725_000, 12); // 0.742857
    expect(s.kpis.ebitdaMargin).toBeCloseTo(1_155_000 / 4_725_000, 12); // 0.244444
    expect(s.kpis.avgUtilization).toBe(0.9);
    expect(s.kpis.revenuePerStore).toBe(4_725_000);
    expect(s.kpis.roeAnnualized).toBeCloseTo((12 * 737_334) / 25_737_334, 12); // 0.343780
    expect(s.kpis.netDebtToEbitda).toBeCloseTo((5_000_000 - 17_155_000) / (12 * 1_155_000), 12); // −0.876984
  });

  it('metadata and self-check', () => {
    expect([s.companyId, s.month, s.fromDay, s.toDay]).toEqual(['player', 0, 0, 29]);
    expect(checkStatements(s)).toEqual([]);
  });

  it('an empty following month carries cash over and has null margins', () => {
    const next = buildMonthlyStatements(exampleLedger(), 'player', 1, {
      storeCount: 0,
      avgUtilization: null,
    });
    expect(next.cashFlow.openingCash).toBe(17_155_000);
    expect(next.cashFlow.netChange).toBe(0);
    expect(next.pnl.netIncome).toBe(0);
    expect(next.balanceSheet.retainedEarnings).toBe(737_334);
    expect(next.kpis).toEqual({
      grossMargin: null,
      ebitdaMargin: null,
      avgUtilization: null,
      revenuePerStore: null,
      roeAnnualized: 0,
      netDebtToEbitda: null,
    });
  });

  it('negative equity and negative EBITDA give null ROE and leverage', () => {
    const l = createLedger();
    post(l, {
      day: 0,
      companyId: 'x',
      memo: 'capital',
      lines: [dr(ACC.Cash, 100), cr(ACC.ShareCapital, 100)],
    });
    post(l, { day: 1, companyId: 'x', memo: 'sale', lines: [dr(ACC.Cash, 50), cr(ACC.Revenue, 50)] });
    pay(l, { companyId: 'x', day: 2, memo: 'rent', debits: [{ account: ACC.Rent, amount: money(500) }] });
    const s2 = buildMonthlyStatements(l, 'x', 0, ops);
    expect(s2.balanceSheet.overdraft).toBe(350);
    expect(s2.balanceSheet.totalEquity).toBe(-350);
    expect(s2.kpis.roeAnnualized).toBeNull();
    expect(s2.kpis.netDebtToEbitda).toBeNull();
    expect(s2.kpis.ebitdaMargin).toBeCloseTo(-9, 12);
    expect(checkStatements(s2)).toEqual([]);
  });
});

describe('checkStatements', () => {
  const s = buildMonthlyStatements(exampleLedger(), 'player', 0, ops);

  it('flags an unbalanced balance sheet', () => {
    const bad = { ...s, balanceSheet: { ...s.balanceSheet, cash: money(s.balanceSheet.cash + 1) } };
    expect(checkStatements(bad).length).toBeGreaterThan(0);
  });

  it('flags a cash flow that does not reconcile', () => {
    const bad = { ...s, cashFlow: { ...s.cashFlow, cfo: money(s.cashFlow.cfo + 1) } };
    expect(checkStatements(bad).length).toBeGreaterThan(0);
  });

  it('flags P&L arithmetic errors', () => {
    const bad = { ...s, pnl: { ...s.pnl, ebitda: money(s.pnl.ebitda + 1) } };
    expect(checkStatements(bad).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Property test: chuỗi nghiệp vụ ngẫu nhiên hợp lệ cho 2 công ty, trải nhiều tháng.
// ---------------------------------------------------------------------------
const KINDS = [
  'contribute',
  'sale',
  'expense',
  'buyAsset',
  'depreciate',
  'dispose',
  'borrow',
  'repayPrincipal',
  'repayOverdraft',
  'taxAccrue',
  'taxSettle',
] as const;
const EXPENSES = [ACC.COGS, ACC.Wages, ACC.Rent, ACC.Marketing, ACC.Admin, ACC.InterestExpense] as const;

// Nghiệp vụ phụ thuộc trạng thái (khấu hao, thanh lý, trả nợ…) chỉ ghi sổ khi đã có số dư tương ứng,
// nên được chọn nhiều hơn; độ phủ thực tế được kiểm ở cuối property test.
const SOURCE_KINDS = ['contribute', 'sale', 'expense', 'borrow', 'taxAccrue'] as const;
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCE_KINDS);
const DEPENDENT_KINDS = KINDS.filter((k) => !SOURCE_SET.has(k));

const stepArb = fc.record({
  company: fc.constantFrom('a', 'b'),
  dayStep: fc.integer({ min: 0, max: 5 }),
  kind: fc.oneof(
    { arbitrary: fc.constantFrom(...SOURCE_KINDS), weight: 2 },
    { arbitrary: fc.constantFrom(...DEPENDENT_KINDS), weight: 3 },
  ),
  amount: fc.integer({ min: 1, max: 5_000_000 }),
  fraction: fc.double({ min: 0, max: 1, noNaN: true }),
  fraction2: fc.double({ min: 0, max: 1, noNaN: true }),
  expense: fc.constantFrom(...EXPENSES),
  negative: fc.boolean(),
});
type Step = typeof stepArb extends fc.Arbitrary<infer T> ? T : never;

const share = (x: number, f: number) => Math.round(x * f);

function apply(l: Ledger, step: Step, day: number): void {
  const c = step.company;
  const b = currentBalances(l, c);
  const memo = step.kind;
  const p = (lines: JournalLine[]) => post(l, { day, companyId: c, memo, lines });
  const payOne = (account: AccountCode, amount: number) => {
    if (amount > 0) pay(l, { companyId: c, day, memo, debits: [{ account, amount: money(amount) }] });
  };
  switch (step.kind) {
    case 'contribute':
      return void p([dr(ACC.Cash, step.amount), cr(ACC.ShareCapital, step.amount)]);
    case 'sale':
      return void p([dr(ACC.Cash, step.amount), cr(ACC.Revenue, step.amount)]);
    case 'expense':
      return payOne(step.expense, step.amount);
    case 'buyAsset':
      return payOne(ACC.PPE, step.amount);
    case 'depreciate': {
      const amount = share(b[ACC.PPE] - b[ACC.AccumulatedDepreciation], step.fraction);
      if (amount > 0) p([dr(ACC.Depreciation, amount), cr(ACC.AccumulatedDepreciation, amount)]);
      return;
    }
    case 'dispose': {
      // §6.1: Nợ AccumDep a, Nợ LossOnDisposal g − a, Có PPE g; giữ AccumDep ≤ PPE sau thanh lý.
      const ppe = b[ACC.PPE];
      const ad = b[ACC.AccumulatedDepreciation];
      const g = share(ppe, step.fraction);
      if (g === 0) return;
      const aMin = Math.max(0, g - (ppe - ad));
      const aMax = Math.min(ad, g);
      const a = aMin + share(aMax - aMin, step.fraction2);
      const lines = [cr(ACC.PPE, g)];
      if (a > 0) lines.unshift(dr(ACC.AccumulatedDepreciation, a));
      if (g - a > 0) lines.unshift(dr(ACC.LossOnDisposal, g - a));
      return void p(lines);
    }
    case 'borrow':
      return void p([dr(ACC.Cash, step.amount), cr(ACC.Loans, step.amount)]);
    case 'repayPrincipal':
      return payOne(ACC.Loans, share(b[ACC.Loans], step.fraction));
    case 'repayOverdraft': {
      const x = Math.min(b[ACC.Cash], b[ACC.Overdraft]);
      if (x > 0) p([dr(ACC.Overdraft, x), cr(ACC.Cash, x)]);
      return;
    }
    case 'taxAccrue':
      if (step.negative) return void p([dr(ACC.TaxPayable, step.amount), cr(ACC.IncomeTax, step.amount)]);
      return void p([dr(ACC.IncomeTax, step.amount), cr(ACC.TaxPayable, step.amount)]);
    case 'taxSettle': {
      const tp = b[ACC.TaxPayable];
      if (tp > 0) payOne(ACC.TaxPayable, tp);
      else if (tp < 0) p([dr(ACC.Cash, 0 - tp), cr(ACC.TaxPayable, 0 - tp)]);
      return;
    }
  }
}

/** Tài sản − (nợ + vốn chủ) từ số dư; phải bằng 0. */
function imbalance(b: ReturnType<typeof currentBalances>): number {
  const assets = b[ACC.Cash] + b[ACC.PPE] - b[ACC.AccumulatedDepreciation];
  const liabilities = b[ACC.Overdraft] + b[ACC.TaxPayable] + b[ACC.Loans];
  const equity = b[ACC.ShareCapital] + retainedEarnings(b);
  return assets - liabilities - equity;
}

const RUNS = Number(process.env['FC_RUNS'] ?? 100);

describe('property: random valid business transactions', () => {
  it('keeps every accounting invariant (economic-model §13: 1, 2, 3, 9)', () => {
    const posted = new Map<string, number>(); // độ phủ: số bút toán thực sự ghi theo loại nghiệp vụ
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 40, maxLength: 160 }), (steps) => {
        const l = createLedger();
        let day = 0;
        for (const step of steps) {
          day += step.dayStep;
          const before = l.entries.length;
          apply(l, step, day);
          if (l.entries.length > before) posted.set(step.kind, (posted.get(step.kind) ?? 0) + 1);
          const b = currentBalances(l, step.company);
          expect(b[ACC.Cash]).toBeGreaterThanOrEqual(0); // bất biến 3
          expect(b[ACC.Overdraft]).toBeGreaterThanOrEqual(0);
          expect(imbalance(b)).toBe(0); // bất biến 2 sau mỗi bút toán
        }

        // Bất biến 1: mọi bút toán cân, mọi số tiền là safe integer > 0, đúng một vế.
        for (const e of l.entries) {
          let d = 0;
          let k = 0;
          for (const line of e.lines) {
            expect(line.debit > 0 !== line.credit > 0).toBe(true);
            expect(Number.isSafeInteger(line.debit) && Number.isSafeInteger(line.credit)).toBe(true);
            d += line.debit;
            k += line.credit;
          }
          expect(d).toBe(k);
        }

        for (const c of ['a', 'b']) {
          // currentBalances khớp với quét lại toàn bộ sổ.
          expect(balancesAt(l, c, day)).toEqual(currentBalances(l, c));

          let prev: MonthlyStatements | undefined;
          let sumNetIncome = 0;
          for (let m = 0; m <= monthOf(day); m++) {
            const s = buildMonthlyStatements(l, c, m, { storeCount: 1, avgUtilization: null });
            expect(checkStatements(s)).toEqual([]); // gồm BS cân và CFO + CFI + CFF = ΔCash
            expect(s.cashFlow.cfo + s.cashFlow.cfi + s.cashFlow.cff).toBe(
              s.cashFlow.closingCash - s.cashFlow.openingCash,
            );
            expect(s.balanceSheet.totalAssets).toBe(
              s.balanceSheet.totalLiabilities + s.balanceSheet.totalEquity,
            );
            expect(s.cashFlow.closingCash).toBe(balancesAt(l, c, lastDayOfMonth(m))[ACC.Cash]);
            const prevRE: Money | 0 = prev ? prev.balanceSheet.retainedEarnings : 0;
            expect(s.pnl.netIncome).toBe(s.balanceSheet.retainedEarnings - prevRE);
            expect(s.cashFlow.openingCash).toBe(prev ? prev.cashFlow.closingCash : 0);
            sumNetIncome += s.pnl.netIncome;
            prev = s;
          }
          expect(sumNetIncome).toBe(retainedEarnings(currentBalances(l, c)));
        }
        for (const e of l.entries) {
          if (e.lines.some((x) => x.account === ACC.LossOnDisposal))
            posted.set('lossOnDisposal', (posted.get('lossOnDisposal') ?? 0) + 1);
          if (e.lines.some((x) => x.account === ACC.Overdraft && x.credit > 0))
            posted.set('overdraftDraw', (posted.get('overdraftDraw') ?? 0) + 1);
          if (
            e.lines.some((x) => x.account === ACC.TaxPayable && x.credit > 0) &&
            e.lines.some((x) => x.account === ACC.Cash && x.debit > 0)
          ) {
            posted.set('taxRefund', (posted.get('taxRefund') ?? 0) + 1);
          }
        }
      }),
      { numRuns: RUNS },
    );
    // Bộ sinh phải thực sự tạo ra mọi loại nghiệp vụ, kể cả thanh lý có lỗ, rút thấu chi và hoàn thuế.
    for (const kind of [...KINDS, 'lossOnDisposal', 'overdraftDraw', 'taxRefund']) {
      expect(posted.get(kind) ?? 0, `generator never posted ${kind}`).toBeGreaterThanOrEqual(10);
    }
  }, 120_000); // FC_RUNS lớn (ví dụ 2000) chạy lâu hơn timeout mặc định 5s
});
