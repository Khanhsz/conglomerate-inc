/** Đầu tháng: áp lại chính sách công ty theo giá hôm nay (economic-model §16.1: lương chuẩn theo CPI). */
import { applyWagePolicy } from '../hr';
import type { System } from '../types/context';

export const monthlyPolicySystem: System = (draft) => {
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (company && company.status !== 'bankrupt') applyWagePolicy(draft, company);
  }
};
