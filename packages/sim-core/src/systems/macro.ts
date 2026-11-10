/** ConstantMacroSystem (economic-model §1): M1 chỉ có lạm phát đều; M3 thay bằng mô hình động. */
import { DAYS_PER_YEAR } from '../constants';
import type { System } from '../types/context';

/** Tỷ lệ năm → ngày: (1 + annual)^(1/360) − 1 (economic-model §0). */
export function dailyRate(annualRate: number): number {
  return (1 + annualRate) ** (1 / DAYS_PER_YEAR) - 1;
}

/** priceIndex và incomeIndex tăng theo lạm phát mỗi ngày, trừ ngày 0 (quyết định #23). */
export const macroSystem: System = (draft, ctx) => {
  if (ctx.day === 0) return;
  const growth = 1 + dailyRate(draft.macro.inflationAnnual);
  draft.macro.priceIndex *= growth;
  draft.macro.incomeIndex *= growth;
};
