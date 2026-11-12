import { describe, expect, it } from 'vitest';
import { money } from '../money';
import { untyped } from '../test-support/untyped';
import type { CashFlow, MonthlyStatements, PnL } from '../types/statements';
import { cashTrend, forecastNetCash, topExpenses } from './forecast';

const pnl = (over: Partial<Record<keyof PnL, number>>): PnL => {
  const keys: (keyof PnL)[] = [
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
  ];
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = over[k] ?? 0;
  return untyped<PnL>(JSON.stringify(out));
};

const month = (cfo: number, cfi: number, principalRepaid: number, borrowings = 0): MonthlyStatements => {
  const cf: Partial<Record<keyof CashFlow, number>> = { cfo, cfi, principalRepaid, borrowings };
  return untyped<MonthlyStatements>(JSON.stringify({ cashFlow: cf }));
};

describe('topExpenses (economic-model §8)', () => {
  it('returns the 3 largest expense lines, largest first, ignoring negatives', () => {
    const items = topExpenses(
      pnl({ cogs: 500, wages: 2_000, rent: 900, admin: 300, interest: 1_000, incomeTax: -50 }),
    );
    expect(items).toEqual([
      { label: 'Wages', amount: 2_000 },
      { label: 'InterestExpense', amount: 1_000 },
      { label: 'Rent', amount: 900 },
    ]);
  });

  it('breaks ties by P&L order and skips zeros', () => {
    expect(topExpenses(pnl({ rent: 100, cogs: 100 }))).toEqual([
      { label: 'COGS', amount: 100 },
      { label: 'Rent', amount: 100 },
    ]);
  });
});

describe('cash forecast (decision B)', () => {
  it('trend = average of the last 3 months of CFO − principal repaid (capex and new borrowing ignored)', () => {
    const history = [month(999, 0, 0), month(-100, -50, 10, 5_000), month(-200, 0, 0), month(-300, -30, 20)];
    // 3 tháng cuối: −110, −200, −320 (bỏ CFI −50, −30 và khoản vay 5,000) → trung bình −210
    expect(cashTrend(history)).toBeCloseTo(-210, 12);
    // Một tháng đầu tư lớn không làm dự báo âm
    expect(cashTrend([month(1_000, -250_000, 0)])).toBe(1_000);
    expect(cashTrend([])).toBe(0);
    expect(cashTrend([month(30, 0, 0)])).toBe(30);
  });

  it('forecast = net cash + months × trend, rounded to cents', () => {
    expect(forecastNetCash(money(1_000), -400, 3)).toBe(-200);
    expect(forecastNetCash(money(1_000), -100.5, 91 / 30)).toBe(money(Math.round(1_000 - 100.5 * (91 / 30))));
  });
});
