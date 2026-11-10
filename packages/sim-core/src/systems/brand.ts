/** Nhận biết thương hiệu: adstock có bão hòa + truyền miệng (economic-model §5). Chạy trước demand. */
import { DAYS_PER_MONTH } from '../constants';
import type { System } from '../types/context';

/** lift = α(1 − exp(−spendDaily / (halfSat × priceIndex))); chi ≤ 0 → 0. */
export function brandLift(
  alpha: number,
  spendDaily: number,
  halfSaturationDaily: number,
  priceIndex: number,
): number {
  if (spendDaily <= 0) return 0;
  return alpha * (1 - Math.exp(-spendDaily / (halfSaturationDaily * priceIndex)));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A ← A + (1 − A)·lift − δ·A, rồi A ← A + γ·Σ served / dân số thành phố, kẹp [0, 1].
 * `served` là của hôm qua: operations hôm nay chưa chạy nên `store.today` vẫn giữ số của ngày trước.
 */
export const brandSystem: System = (draft, ctx) => {
  const { brand } = ctx.content.industry;
  let cityPopulation = 0;
  for (const d of ctx.content.scenario.city.districts) cityPopulation += d.pop;

  const servedYesterday: Record<string, number> = {};
  for (const id of draft.storeIds) {
    const store = draft.stores[id];
    if (store)
      servedYesterday[store.companyId] = (servedYesterday[store.companyId] ?? 0) + store.today.served;
  }

  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.status === 'bankrupt') continue;
    const spendDaily = company.marketingBudgetMonthly / DAYS_PER_MONTH;
    const lift = brandLift(brand.alpha, spendDaily, brand.halfSaturationDaily, draft.macro.priceIndex);
    let a = company.brandAwareness;
    a = a + (1 - a) * lift - brand.decayPerDay * a;
    if (cityPopulation > 0) a += (brand.wordOfMouth * (servedYesterday[companyId] ?? 0)) / cityPopulation;
    company.brandAwareness = clamp01(a);
  }
};
