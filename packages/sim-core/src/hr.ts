/** Chính sách phòng Nhân sự (economic-model §16): phép tính thuần dùng chung cho lệnh và system. */
import { mul, type Money } from './money';
import type { HrPolicyParams, LoadedContent } from './types/content';
import type { Company, GameState, HrPolicy } from './types/state';

/** Lương chuẩn theo chính sách hôm nay; null nếu công ty chưa đặt (§16.1). */
export function policyWage(state: GameState, policy: HrPolicy): Money | null {
  return policy.wageRatio === null
    ? null
    : mul(state.macro.marketWageMonthly, policy.wageRatio * state.macro.priceIndex);
}

/** Kỹ năng người mới tuyển: newHireSkill + trainingNewHire[mức đào tạo] (§16.2). */
export function effectiveNewHireSkill(content: LoadedContent, company: Company): number {
  return Math.min(
    1,
    content.industry.newHireSkill +
      content.industry.hrPolicies.trainingNewHire[company.hrPolicy.trainingLevel],
  );
}

/** morale_target = clamp01(σ(k(wageRatio_eff − 1)) + benefitsMorale[mức]) (§16.3, §16.4). */
export function policyMoraleTarget(sigmoid: number, params: HrPolicyParams, policy: HrPolicy): number {
  const t = sigmoid + params.benefitsMorale[policy.benefitsLevel];
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Áp lương chuẩn cho mọi cửa hàng đang mở không ghi đè lương (§16.1). */
export function applyWagePolicy(draft: GameState, company: Company): void {
  const wage = policyWage(draft, company.hrPolicy);
  if (wage === null) return;
  for (const id of draft.storeIds) {
    const s = draft.stores[id];
    if (s && s.companyId === company.id && s.status === 'open' && !s.overrides.wage) s.wageMonthly = wage;
  }
}
