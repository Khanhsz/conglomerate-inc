/** Thuế TNDN lũy kế trong năm, có chuyển lỗ (economic-model §6.2). Hàm thuần. */
import { money, pct, sub, add, type Money } from '../money';

export interface TaxState {
  readonly preTaxProfitYTD: Money;
  readonly taxBookedYTD: Money;
  readonly lossCarryforward: Money;
}

/**
 * taxableYTD = max(0, preTaxYTD − lossCarryforward); taxDueYTD = round(τ × taxableYTD);
 * chi phí thuế tháng = taxDueYTD − taxBookedYTD (âm = hoàn nhập trong năm).
 * Cuối năm: lỗ cả năm cộng vào lossCarryforward, lãi cả năm trừ dần lossCarryforward (không âm); reset YTD.
 */
export function accrueMonthlyTax(
  tax: TaxState,
  preTaxMonth: Money,
  rate: number,
  isYearEnd: boolean,
): { expense: Money; next: TaxState } {
  const ytd = add(tax.preTaxProfitYTD, preTaxMonth);
  const taxable = money(Math.max(0, ytd - tax.lossCarryforward));
  const due = pct(taxable, rate);
  const expense = sub(due, tax.taxBookedYTD);
  if (!isYearEnd)
    return {
      expense,
      next: { preTaxProfitYTD: ytd, taxBookedYTD: due, lossCarryforward: tax.lossCarryforward },
    };
  const lossCarryforward =
    ytd < 0 ? sub(tax.lossCarryforward, ytd) : money(Math.max(0, tax.lossCarryforward - ytd));
  return { expense, next: { preTaxProfitYTD: money(0), taxBookedYTD: money(0), lossCarryforward } };
}
