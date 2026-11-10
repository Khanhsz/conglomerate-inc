/** Giải thích và dự báo cho distress / cảnh báo sớm (economic-model §8). Hàm thuần. */
import { FORECAST_TREND_MONTHS } from '../constants';
import { fromFloatCents, type Money } from '../money';
import type { ExpenseItem } from '../types/state';
import type { MonthlyStatements, PnL } from '../types/statements';

const EXPENSE_LINES: readonly (readonly [string, keyof PnL])[] = [
  ['COGS', 'cogs'],
  ['Wages', 'wages'],
  ['Rent', 'rent'],
  ['Marketing', 'marketing'],
  ['Admin', 'admin'],
  ['Depreciation', 'depreciation'],
  ['LossOnDisposal', 'lossOnDisposal'],
  ['InterestExpense', 'interest'],
  ['IncomeTax', 'incomeTax'],
];

/** n khoản chi lớn nhất của tháng (bỏ khoản ≤ 0); bằng nhau thì theo thứ tự P&L. */
export function topExpenses(pnl: PnL, n = 3): ExpenseItem[] {
  return EXPENSE_LINES.map(([label, key]) => ({ label, amount: pnl[key] }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/**
 * Xu hướng dòng tiền tháng = trung bình 3 tháng gần nhất của CFO + CFI − trả gốc
 * (không tính góp vốn và tiền vay mới vì không lặp lại). Chưa có lịch sử → 0.
 */
export function cashTrend(statements: readonly MonthlyStatements[]): number {
  const recent = statements.slice(-FORECAST_TREND_MONTHS);
  if (recent.length === 0) return 0;
  let total = 0;
  for (const s of recent) total += s.cashFlow.cfo + s.cashFlow.cfi - s.cashFlow.principalRepaid;
  return total / recent.length;
}

/** Tiền ròng (cash − overdraft) dự báo sau `months` tháng. */
export function forecastNetCash(netCash: number, trend: number, months: number): Money {
  return fromFloatCents(netCash + trend * months);
}
