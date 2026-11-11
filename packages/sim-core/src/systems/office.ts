/**
 * Văn phòng và phòng ban mỗi ngày (economic-model §15): gia hạn thuê văn phòng (index CPI mỗi 12 tháng),
 * cộng dồn thuê, overhead văn phòng và chi phí cố định các phòng đang mở. Ghi sổ ở chốt tháng.
 */
import { DAYS_PER_MONTH, RENT_TERM_DAYS } from '../constants';
import { officeRent } from '../office';
import { DEPARTMENTS } from '../types/content';
import type { System } from '../types/context';

export const officeSystem: System = (draft, ctx) => {
  const { industry, scenario } = ctx.content;
  const priceIndex = draft.macro.priceIndex;
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    const office = company?.office;
    if (!company || !office || company.status === 'bankrupt') continue;
    if (ctx.day >= office.rentResetDay) {
      const district = scenario.city.districts.find((d) => d.id === office.districtId);
      if (district) office.rentMonthly = officeRent(draft, ctx.content, district, office.size);
      office.rentResetDay += RENT_TERM_DAYS;
    }
    const accrued = company.officeAccrued;
    accrued.rent += office.rentMonthly / DAYS_PER_MONTH;
    accrued.overhead += (industry.office.sizes[office.size].overheadMonthly * priceIndex) / DAYS_PER_MONTH;
    for (const dept of DEPARTMENTS) {
      if (company.departments[dept] !== null) {
        accrued.departments[dept] += (industry.departments[dept].fixedMonthly * priceIndex) / DAYS_PER_MONTH;
      }
    }
  }
};
