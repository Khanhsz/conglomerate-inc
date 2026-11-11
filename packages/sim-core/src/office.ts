/** Giá trị rỗng và phép tính thuần cho văn phòng và phòng ban (economic-model §15). */
import { mul, type Money } from './money';
import {
  DEPARTMENTS,
  type Department,
  type DistrictDef,
  type LoadedContent,
  type OfficeSize,
} from './types/content';
import type { Company, GameState, HrPolicy, OfficeAccrued } from './types/state';

export function noDepartments(): Company['departments'] {
  return { hr: null, product: null, finance: null, marketing: null, board: null };
}

export function emptyOfficeAccrued(): OfficeAccrued {
  return { rent: 0, overhead: 0, departments: { hr: 0, product: 0, finance: 0, marketing: 0, board: 0 } };
}

export function officeCapex(state: GameState, content: LoadedContent, size: OfficeSize): Money {
  return mul(content.industry.office.sizes[size].fitOut, state.macro.priceIndex);
}

export function officeRent(
  state: GameState,
  content: LoadedContent,
  district: DistrictDef,
  size: OfficeSize,
): Money {
  return mul(
    district.rentMonthly,
    content.industry.office.sizes[size].rentMultiplier * state.macro.priceIndex,
  );
}

export function departmentOpeningCost(state: GameState, content: LoadedContent, dept: Department): Money {
  return mul(content.industry.departments[dept].openingCost, state.macro.priceIndex);
}

export function openDepartments(company: Company): Department[] {
  return DEPARTMENTS.filter((d) => company.departments[d] !== null);
}

/** Lý do từ chối khi lệnh cần phòng `dept` (economic-model §15.2), hoặc null. */
export function departmentProblem(company: Company, dept: Department): string | null {
  return company.departments[dept] === null ? `cần mở phòng ${DEPARTMENT_LABEL[dept]} trước` : null;
}

export const DEPARTMENT_LABEL: { readonly [D in Department]: string } = {
  hr: 'Nhân sự',
  product: 'Sản phẩm',
  finance: 'Tài chính',
  marketing: 'Marketing',
  board: 'Ban điều hành',
};

export const OFFICE_SIZE_LABEL: { readonly [S in OfficeSize]: string } = {
  small: 'nhỏ',
  medium: 'vừa',
  large: 'lớn',
};

/** Chính sách nhân sự mặc định = như M1 (economic-model §16). */
export function defaultHrPolicy(): HrPolicy {
  return { wageRatio: null, trainingLevel: 0, benefitsLevel: 0, bonusRate: 0 };
}
