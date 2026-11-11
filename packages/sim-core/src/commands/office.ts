/** Văn phòng và phòng ban (economic-model §15, spec M1.6 §3). */
import { LEASE_TERMINATION_MONTHS, RENT_TERM_DAYS } from '../constants';
import { ACC, DEPARTMENT_ACCOUNT } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { money, mul, sub, toDisplay, ZERO, type Money } from '../money';
import { DEPARTMENT_LABEL, departmentOpeningCost, officeCapex, officeRent, openDepartments } from '../office';
import type { Validation } from '../types/commands';
import { DEPARTMENTS, OFFICE_SIZES, type Department, type OfficeSize } from '../types/content';
import type { SimContext } from '../types/context';
import type { JournalLine, Ledger } from '../types/ledger';
import type { Company, GameState, Office } from '../types/state';
import {
  companyProblem,
  findDistrict,
  getCompany,
  OK,
  reject,
  spendingPower,
  type CommandOf,
} from './common';
import { defaultOverdraftLimit } from './finance';

const SIZES: ReadonlySet<unknown> = new Set(OFFICE_SIZES);
const DEPTS: ReadonlySet<unknown> = new Set(DEPARTMENTS);
const isSize = (v: unknown): v is OfficeSize => SIZES.has(v);
const isDept = (v: unknown): v is Department => DEPTS.has(v);

function affordable(state: GameState, companyId: string, cost: Money, what: string): Validation {
  const available = spendingPower(state, companyId);
  return available < cost
    ? reject(
        `không đủ tiền cho ${what} ${toDisplay(cost)}: tiền mặt + hạn mức thấu chi còn lại = ${toDisplay(money(available))}`,
      )
    : OK;
}

/** Ghi giảm GTCL văn phòng (như §6.1): Nợ AccumDep + LossOnDisposal / Có PP&E. */
export function disposeOffice(
  ledger: Ledger,
  companyId: string,
  office: Office,
  day: number,
  memo: string,
): void {
  if (office.capex <= 0) return;
  const lines: JournalLine[] = [];
  if (office.accumDep > 0)
    lines.push({ account: ACC.AccumulatedDepreciation, debit: office.accumDep, credit: ZERO });
  const loss = sub(office.capex, office.accumDep);
  if (loss > 0) lines.push({ account: ACC.LossOnDisposal, debit: loss, credit: ZERO });
  lines.push({ account: ACC.PPE, debit: ZERO, credit: office.capex });
  post(ledger, { day, companyId, memo, refId: 'office', lines });
}

/**
 * Đóng một phòng: chức năng tắt, chính sách do phòng đặt về mặc định M1 (economic-model §15.2).
 * Khoản cộng dồn tới hôm nay vẫn ghi ở chốt tháng.
 */
function closeOne(draft: GameState, ctx: SimContext, company: Company, dept: Department): void {
  company.departments[dept] = null;
  if (dept === 'finance' && company.creditLine.limit > 0) {
    company.creditLine.limit = ZERO;
    company.overdraft.limit = defaultOverdraftLimit(draft, ctx, company.id);
  }
  draft.events.push({ day: ctx.day, kind: 'departmentClosed', companyId: company.id, dept });
}

function closeAllDepartments(draft: GameState, ctx: SimContext, company: Company): void {
  for (const dept of openDepartments(company)) closeOne(draft, ctx, company, dept);
}

export const leaseOffice = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'LeaseOffice'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'active');
    if (problem) return reject(problem);
    const company = getCompany(state, cmd.companyId);
    if (company.office) return reject('đã có văn phòng; trả văn phòng hiện tại trước khi thuê nơi khác');
    if (!findDistrict(ctx.content, cmd.payload.districtId))
      return reject(`quận "${String(cmd.payload.districtId)}" không tồn tại`);
    const size: unknown = cmd.payload.size;
    if (!isSize(size))
      return reject(`quy mô văn phòng "${String(size)}" không tồn tại (có: ${OFFICE_SIZES.join(', ')})`);
    return affordable(state, cmd.companyId, officeCapex(state, ctx.content, size), 'capex văn phòng');
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'LeaseOffice'>): void {
    const district = findDistrict(ctx.content, cmd.payload.districtId);
    if (!district) throw new Error(`apply LeaseOffice: unknown district ${String(cmd.payload.districtId)}`);
    const { size } = cmd.payload;
    const company = getCompany(draft, cmd.companyId);
    const capex = officeCapex(draft, ctx.content, size);
    pay(draft.ledger, {
      companyId: company.id,
      day: ctx.day,
      memo: `Sửa sang văn phòng (${size}) ở quận ${district.id}`,
      refId: 'office',
      debits: [{ account: ACC.PPE, amount: capex }],
    });
    company.office = {
      districtId: district.id,
      size,
      openedDay: ctx.day,
      rentMonthly: officeRent(draft, ctx.content, district, size),
      rentResetDay: ctx.day + RENT_TERM_DAYS,
      capex,
      accumDep: ZERO,
    };
    draft.events.push({
      day: ctx.day,
      kind: 'officeLeased',
      companyId: company.id,
      districtId: district.id,
      size,
    });
  },
};

export const releaseOffice = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'ReleaseOffice'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    return getCompany(state, cmd.companyId).office ? OK : reject('chưa có văn phòng');
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'ReleaseOffice'>): void {
    const company = getCompany(draft, cmd.companyId);
    const office = company.office;
    if (!office) throw new Error('apply ReleaseOffice: no office');
    disposeOffice(draft.ledger, company.id, office, ctx.day, 'Thanh lý văn phòng');
    pay(draft.ledger, {
      companyId: company.id,
      day: ctx.day,
      memo: `Phí chấm dứt thuê văn phòng (${LEASE_TERMINATION_MONTHS} tháng)`,
      refId: 'office',
      debits: [{ account: ACC.OfficeRent, amount: mul(office.rentMonthly, LEASE_TERMINATION_MONTHS) }],
    });
    company.office = null;
    closeAllDepartments(draft, ctx, company);
    draft.events.push({ day: ctx.day, kind: 'officeReleased', companyId: company.id });
  },
};

export const openDepartment = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'OpenDepartment'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'active');
    if (problem) return reject(problem);
    const dept: unknown = cmd.payload.dept;
    if (!isDept(dept)) return reject(`phòng "${String(dept)}" không tồn tại (có: ${DEPARTMENTS.join(', ')})`);
    const company = getCompany(state, cmd.companyId);
    if (!company.office) return reject('cần thuê văn phòng trước khi mở phòng ban');
    if (company.departments[dept]) return reject(`phòng ${DEPARTMENT_LABEL[dept]} đã mở`);
    const slots = ctx.content.industry.office.sizes[company.office.size].slots;
    if (openDepartments(company).length >= slots)
      return reject(`văn phòng ${company.office.size} chỉ có ${slots} chỗ cho phòng ban, đã dùng hết`);
    return affordable(state, cmd.companyId, departmentOpeningCost(state, ctx.content, dept), 'phí mở phòng');
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'OpenDepartment'>): void {
    const { dept } = cmd.payload;
    const company = getCompany(draft, cmd.companyId);
    pay(draft.ledger, {
      companyId: company.id,
      day: ctx.day,
      memo: `Mở phòng ${DEPARTMENT_LABEL[dept]}`,
      refId: `dept:${dept}`,
      debits: [
        { account: DEPARTMENT_ACCOUNT[dept], amount: departmentOpeningCost(draft, ctx.content, dept) },
      ],
    });
    company.departments[dept] = { openedDay: ctx.day };
    draft.events.push({ day: ctx.day, kind: 'departmentOpened', companyId: company.id, dept });
  },
};

export const closeDepartment = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'CloseDepartment'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    const dept: unknown = cmd.payload.dept;
    if (!isDept(dept)) return reject(`phòng "${String(dept)}" không tồn tại`);
    return getCompany(state, cmd.companyId).departments[dept]
      ? OK
      : reject(`phòng ${DEPARTMENT_LABEL[dept]} chưa mở`);
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'CloseDepartment'>): void {
    closeOne(draft, ctx, getCompany(draft, cmd.companyId), cmd.payload.dept);
  },
};
