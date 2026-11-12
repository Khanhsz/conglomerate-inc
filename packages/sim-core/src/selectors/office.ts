/** Đọc văn phòng và phòng ban cho UI và balance (economic-model §15). Hàm thuần. */
import { LEASE_TERMINATION_MONTHS } from '../constants';
import { mul, sub, sum, type Money } from '../money';
import { departmentOpeningCost, officeCapex, officeRent } from '../office';
import {
  DEPARTMENTS,
  OFFICE_SIZES,
  type CompanyId,
  type Department,
  type DistrictId,
  type LoadedContent,
  type OfficeSize,
} from '../types/content';
import type { GameState } from '../types/state';
import { worldDistricts } from '../world';

export interface LeaseOption {
  readonly districtId: DistrictId;
  readonly size: OfficeSize;
  readonly slots: number;
  readonly capex: Money;
  readonly rentMonthly: Money;
  readonly overheadMonthly: Money;
}

export interface DepartmentStatus {
  readonly dept: Department;
  readonly openedDay: number | null;
  /** Theo giá hôm nay (đã nhân CPI). */
  readonly openingCost: Money;
  readonly fixedMonthly: Money;
}

export interface OfficeView {
  readonly office: {
    readonly districtId: DistrictId;
    readonly size: OfficeSize;
    readonly openedDay: number;
    readonly slots: number;
    readonly slotsUsed: number;
    readonly rentMonthly: Money;
    readonly overheadMonthly: Money;
    readonly bookValue: Money;
    /** Phí chấm dứt nếu trả văn phòng hôm nay (3 tháng thuê). */
    readonly releaseFee: Money;
  } | null;
  readonly departments: readonly DepartmentStatus[];
  /** Thuê + overhead + chi phí cố định các phòng đang mở, mỗi tháng theo giá hôm nay. */
  readonly monthlyCost: Money;
  /** Mọi quận × quy mô, để UI không phải tính tiền. */
  readonly leaseOptions: readonly LeaseOption[];
}

export function officeView(
  state: GameState,
  content: LoadedContent,
  companyId: CompanyId,
): OfficeView | null {
  const company = state.companies[companyId];
  if (!company) return null;
  const { industry } = content;
  const priceIndex = state.macro.priceIndex;
  const departments = DEPARTMENTS.map((dept) => ({
    dept,
    openedDay: company.departments[dept]?.openedDay ?? null,
    openingCost: departmentOpeningCost(state, content, dept),
    fixedMonthly: mul(industry.departments[dept].fixedMonthly, priceIndex),
  }));
  const o = company.office;
  const office =
    o === null
      ? null
      : {
          districtId: o.districtId,
          size: o.size,
          openedDay: o.openedDay,
          slots: industry.office.sizes[o.size].slots,
          slotsUsed: departments.filter((d) => d.openedDay !== null).length,
          rentMonthly: o.rentMonthly,
          overheadMonthly: mul(industry.office.sizes[o.size].overheadMonthly, priceIndex),
          bookValue: sub(o.capex, o.accumDep),
          releaseFee: mul(o.rentMonthly, LEASE_TERMINATION_MONTHS),
        };
  const monthlyCost =
    office === null
      ? sum([])
      : sum([
          office.rentMonthly,
          office.overheadMonthly,
          ...departments.filter((d) => d.openedDay !== null).map((d) => d.fixedMonthly),
        ]);
  const leaseOptions = worldDistricts(content).flatMap((district) =>
    OFFICE_SIZES.map((size) => ({
      districtId: district.id,
      size,
      slots: industry.office.sizes[size].slots,
      capex: officeCapex(state, content, size),
      rentMonthly: officeRent(state, content, district, size),
      overheadMonthly: mul(industry.office.sizes[size].overheadMonthly, priceIndex),
    })),
  );
  return { office, departments, monthlyCost, leaseOptions };
}
