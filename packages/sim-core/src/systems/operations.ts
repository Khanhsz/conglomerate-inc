/**
 * Vận hành cửa hàng hằng ngày (economic-model §3.4–§4, §6): công suất, khách phục vụ, doanh thu và giá vốn
 * (bút toán D1/D2), cộng dồn lương/thuê/marketing, gia hạn thuê, rồi cập nhật cuối ngày serviceLevel, morale, skill.
 */
import { DAYS_PER_MONTH, RENT_TERM_DAYS, STORE_RECENT_DAYS } from '../constants';
import { ACC } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { add, type Money, mul, ZERO } from '../money';
import { policyMoraleTarget } from '../hr';
import type { System } from '../types/context';

/** productivity = 0.7 + 0.6 × morale ∈ [0.7, 1.3] (economic-model §4.1). */
export function productivity(morale: number): number {
  return 0.7 + 0.6 * morale;
}

/** morale_target = 1 / (1 + exp(−k (wageRatio − 1))) (economic-model §4.2). */
export function moraleTarget(wageRatio: number, sensitivity: number): number {
  return 1 / (1 + Math.exp(-sensitivity * (wageRatio - 1)));
}

export const operationsSystem: System = (draft, ctx) => {
  const { industry, scenario } = ctx.content;
  const priceIndex = draft.macro.priceIndex;
  const marketWage = draft.macro.marketWageMonthly * priceIndex;
  const revenueByCompany: Record<string, Money> = {};
  const cogsByCompany: Record<string, Money> = {};

  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.status === 'bankrupt') continue;
    company.marketingAccrued += company.marketingBudgetMonthly / DAYS_PER_MONTH;
    // Kênh ngoài `general` (§18.2) cộng dồn riêng để không đổi phép tính M1 khi không dùng kênh nào.
    for (const b of company.channelBudgets) company.marketingAccrued += b.monthly / DAYS_PER_MONTH;
  }

  for (const id of draft.storeIds) {
    const store = draft.stores[id];
    if (!store) continue;
    const company = draft.companies[store.companyId];
    if (store.status !== 'open' || !company || company.status === 'bankrupt') {
      store.today = { demand: 0, served: 0, lost: 0, capacity: 0 };
      continue;
    }

    if (ctx.day >= store.rentResetDay) {
      const district = scenario.city.districts.find((d) => d.id === store.districtId);
      if (district) store.rentMonthly = mul(district.rentMonthly, priceIndex);
      store.rentResetDay += RENT_TERM_DAYS;
    }

    const morale0 = store.morale;
    const skill0 = store.skill;
    const capacity = store.staff * industry.customersPerStaffPerDay * productivity(morale0);
    const demand = store.today.demand;
    const served = Math.min(demand, capacity);
    const costFactor = industry.qualityTiers[company.qualityTier].unitCostMultiplier * priceIndex;
    const revenue = mul(store.price, served);
    const cogs = mul(industry.unitCost, served * costFactor);

    store.today = { demand, served, lost: demand - served, capacity };
    store.mtd.demand += demand;
    store.mtd.served += served;
    store.mtd.capacity += capacity;
    store.mtd.days += 1;
    store.mtd.revenue = add(store.mtd.revenue, revenue);
    store.mtd.cogs = add(store.mtd.cogs, cogs);
    store.mtd.wagesAccrued += (store.staff * store.wageMonthly) / DAYS_PER_MONTH;
    store.mtd.rentAccrued += store.rentMonthly / DAYS_PER_MONTH;
    for (const a of store.amenities) {
      const def = industry.storeAmenities[a];
      if (def) store.mtd.amenitiesAccrued += (def.monthlyCost * priceIndex) / DAYS_PER_MONTH;
    }
    const hr = company.hrPolicy;
    const hrParams = industry.hrPolicies;
    store.mtd.trainingAccrued +=
      (store.staff * hrParams.trainingCostPerStaffMonthly[hr.trainingLevel] * priceIndex) / DAYS_PER_MONTH;
    store.mtd.benefitsAccrued +=
      (store.staff * store.wageMonthly * hrParams.benefitsShare[hr.benefitsLevel]) / DAYS_PER_MONTH;
    revenueByCompany[company.id] = add(revenueByCompany[company.id] ?? ZERO, revenue);
    cogsByCompany[company.id] = add(cogsByCompany[company.id] ?? ZERO, cogs);

    // Cuối ngày, dùng cho ngày mai (§3.5): W dùng chất lượng nhân sự đầu ngày.
    const fill = demand > 0 ? served / demand : 1;
    const serviceTarget = 0.5 * fill + 0.5 * morale0 * skill0;
    store.serviceLevel += industry.serviceAdjustRate * (serviceTarget - store.serviceLevel);
    // §16: thưởng tháng trước cộng vào lương, phúc lợi cộng vào mục tiêu, đào tạo nhân tốc độ tăng kỹ năng.
    const sigmoid = moraleTarget(
      (store.wageMonthly + store.bonusPerHead) / marketWage,
      industry.moraleWageSensitivity,
    );
    const target = policyMoraleTarget(sigmoid, hrParams, hr);
    store.morale += industry.moraleAdjustRate * (target - store.morale);
    store.skill = Math.min(1, skill0 + industry.skillGainPerDay * hrParams.trainingMult[hr.trainingLevel]);

    store.recentDays.push({ day: ctx.day, demand, served, capacity });
    if (store.recentDays.length > STORE_RECENT_DAYS)
      store.recentDays.splice(0, store.recentDays.length - STORE_RECENT_DAYS);
  }

  for (const companyId of draft.companyIds) {
    const revenue = revenueByCompany[companyId] ?? ZERO;
    const cogs = cogsByCompany[companyId] ?? ZERO;
    if (revenue > 0) {
      post(draft.ledger, {
        day: ctx.day,
        companyId,
        memo: 'Doanh thu bán hàng',
        lines: [
          { account: ACC.Cash, debit: revenue, credit: ZERO },
          { account: ACC.Revenue, debit: ZERO, credit: revenue },
        ],
      });
    }
    pay(draft.ledger, {
      companyId,
      day: ctx.day,
      memo: 'Giá vốn hàng bán',
      debits: [{ account: ACC.COGS, amount: cogs }],
    });
  }
};
