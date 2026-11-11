/** Vay kỳ hạn (economic-model §7.1): báo giá theo leverage và trả góp đều. */
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { fromFloatCents, type Money, mul } from '../money';
import type { FinanceParams, LoadedContent } from '../types/content';
import type { GameState, Loan } from '../types/state';

/** payment = round(P·r / (1 − (1 + r)^−n)), r = rate / 12 (lãi đơn theo tháng, có chủ đích). */
export function annuityPayment(principal: Money, annualRate: number, termMonths: number): Money {
  const r = annualRate / 12;
  if (r === 0) return mul(principal, 1 / termMonths);
  return mul(principal, r / (1 - (1 + r) ** -termMonths));
}

export type LoanQuote =
  | { readonly ok: true; readonly leverage: number; readonly spread: number; readonly annualRate: number }
  | { readonly ok: false; readonly reason: string };

/**
 * leverage = (Loans + Overdraft + principal) / max(1, EBITDA 12 tháng gần nhất, năm hóa nếu ít hơn 12 tháng).
 * Spread lấy bậc đầu tiên có maxLeverage ≥ leverage; vượt bậc cuối → từ chối.
 */
export function loanQuote(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  principal: Money,
): LoanQuote {
  const history = state.statements[companyId] ?? [];
  if (history.length === 0)
    return { ok: false, reason: 'chưa có lịch sử EBITDA (cần ít nhất một tháng đã chốt)' };
  const recent = history.slice(-12);
  let ebitda = 0;
  for (const s of recent) ebitda += s.pnl.ebitda;
  const annualEbitda = (ebitda * 12) / recent.length;
  const b = currentBalances(state.ledger, companyId);
  const leverage = (b[ACC.Loans] + b[ACC.Overdraft] + principal) / Math.max(1, annualEbitda);
  const tiers = content.scenario.finance.loanSpreads;
  const tier = tiers.find((t) => leverage <= t.maxLeverage);
  if (!tier) {
    const max = tiers[tiers.length - 1]?.maxLeverage ?? 0;
    return { ok: false, reason: `leverage ${leverage.toFixed(2)} vượt mức tối đa ${max} (nợ / EBITDA năm)` };
  }
  return { ok: true, leverage, spread: tier.spread, annualRate: state.macro.policyRateAnnual + tier.spread };
}

/** Kỳ trả góp: lãi = round(dư nợ × r); gốc = payment − lãi; kỳ cuối trả hết dư nợ. */
export function installment(loan: Loan): { interest: Money; principal: Money } {
  const interest = mul(loan.outstanding, loan.annualRate / 12);
  const last = loan.paymentsMade + 1 >= loan.termMonths;
  const scheduled = Math.max(0, loan.paymentMonthly - interest);
  const principal = last ? loan.outstanding : fromFloatCents(Math.min(loan.outstanding, scheduled));
  return { interest, principal };
}

/** Hạn mức tín dụng tối đa = max(sàn thấu chi, revenueMultiple × doanh thu 3 tháng) (economic-model §19.1). */
export function creditLineMax(finance: FinanceParams, revenue3m: Money): Money {
  const byRevenue = mul(revenue3m, finance.creditLine.revenueMultiple);
  return byRevenue > finance.overdraftFloor ? byRevenue : finance.overdraftFloor;
}

/** Doanh thu 3 tháng đã chốt gần nhất (cùng nguồn với hạn mức thấu chi §7.2). */
export function revenueTrailing3m(state: GameState, companyId: string): Money {
  let total = 0;
  for (const s of (state.statements[companyId] ?? []).slice(-3)) total += s.pnl.revenue;
  return fromFloatCents(total);
}

/**
 * Leverage hiện tại = (Loans + Overdraft + thêm) / EBITDA năm.
 * null nếu chưa có tháng nào hoặc EBITDA năm ≤ 0 (không đo được khả năng trả nợ, mọi hạn mức đều không cấp).
 */
export function currentLeverage(state: GameState, companyId: string, extraDebt = 0): number | null {
  const history = state.statements[companyId] ?? [];
  if (history.length === 0) return null;
  const recent = history.slice(-12);
  let ebitda = 0;
  for (const s of recent) ebitda += s.pnl.ebitda;
  const b = currentBalances(state.ledger, companyId);
  const annual = (ebitda * 12) / recent.length;
  if (annual <= 0) return null;
  return (b[ACC.Loans] + b[ACC.Overdraft] + extraDebt) / annual;
}
