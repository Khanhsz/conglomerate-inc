/** Lệnh của phòng Nhân sự (economic-model §16, spec M1.6 §3). */
import { WAGE_BAND } from '../constants';
import { applyWagePolicy, policyWage } from '../hr';
import { departmentProblem } from '../office';
import type { Validation } from '../types/commands';
import { POLICY_LEVELS, type PolicyLevel } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import {
  companyProblem,
  getCompany,
  getStore,
  OK,
  ownedOpenStoreProblem,
  reject,
  type CommandOf,
} from './common';

const LEVELS: ReadonlySet<unknown> = new Set(POLICY_LEVELS);
const isLevel = (v: unknown): v is PolicyLevel => LEVELS.has(v);

function hrProblem(state: GameState, companyId: unknown): string | null {
  const problem = companyProblem(state, companyId, 'notBankrupt');
  if (problem || typeof companyId !== 'string') return problem;
  return departmentProblem(getCompany(state, companyId), 'hr');
}

export const setHrPolicy = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetHrPolicy'>): Validation {
    const problem = hrProblem(state, cmd.companyId);
    if (problem) return reject(problem);
    const { wageRatio, trainingLevel, benefitsLevel, bonusRate } = cmd.payload;
    if (wageRatio !== undefined && wageRatio !== null) {
      if (typeof wageRatio !== 'number' || !(wageRatio >= WAGE_BAND.min && wageRatio <= WAGE_BAND.max))
        return reject(
          `lương chuẩn phải trong [${WAGE_BAND.min}, ${WAGE_BAND.max}] × lương thị trường hoặc bỏ đặt`,
        );
    }
    if (trainingLevel !== undefined && !isLevel(trainingLevel))
      return reject('mức đào tạo phải là 0, 1, 2 hoặc 3');
    if (benefitsLevel !== undefined && !isLevel(benefitsLevel))
      return reject('mức phúc lợi phải là 0, 1, 2 hoặc 3');
    const max = ctx.content.industry.hrPolicies.bonusRateMax;
    if (bonusRate !== undefined && (typeof bonusRate !== 'number' || !(bonusRate >= 0 && bonusRate <= max)))
      return reject(`tỷ lệ thưởng phải trong [0, ${max}]`);
    return OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'SetHrPolicy'>): void {
    const company = getCompany(draft, cmd.companyId);
    const { wageRatio, trainingLevel, benefitsLevel, bonusRate } = cmd.payload;
    const policy = company.hrPolicy;
    if (wageRatio !== undefined) policy.wageRatio = wageRatio;
    if (trainingLevel !== undefined) policy.trainingLevel = trainingLevel;
    if (benefitsLevel !== undefined) policy.benefitsLevel = benefitsLevel;
    if (bonusRate !== undefined) policy.bonusRate = bonusRate;
    applyWagePolicy(draft, company);
  },
};

export const clearOverride = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'ClearOverride'>): Validation {
    const problem =
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
      ownedOpenStoreProblem(state, cmd.companyId, cmd.payload.storeId);
    if (problem) return reject(problem);
    const field: unknown = cmd.payload.field;
    if (field !== 'wage') return reject(`không có trường ghi đè "${String(field)}"`);
    const company = getCompany(state, cmd.companyId);
    const dept = departmentProblem(company, 'hr');
    if (dept) return reject(dept);
    return policyWage(state, company.hrPolicy) === null ? reject('chưa đặt lương chuẩn của công ty') : OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'ClearOverride'>): void {
    const store = getStore(draft, cmd.payload.storeId);
    store.overrides.wage = false;
    applyWagePolicy(draft, getCompany(draft, cmd.companyId));
  },
};
