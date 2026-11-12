/** SetStaff (spec §3, economic-model §4.3): staff nguyên ∈ [minStaff, 40]; tuyển thêm thì trộn skill. */
import { MAX_STAFF_PER_STORE } from '../constants';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import {
  companyProblem,
  getCompany,
  getStore,
  isSafeInt,
  OK,
  ownedOpenStoreProblem,
  reject,
  type CommandOf,
} from './common';
import { effectiveNewHireSkill } from '../hr';

export const setStaff = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetStaff'>): Validation {
    const problem =
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
      ownedOpenStoreProblem(state, cmd.companyId, cmd.payload.storeId);
    if (problem) return reject(problem);
    const { staff } = cmd.payload;
    const min = ctx.content.industry.minStaffPerStore;
    if (!isSafeInt(staff) || staff < min || staff > MAX_STAFF_PER_STORE) {
      return reject(
        `số nhân viên (staff) ${String(staff)} không hợp lệ: phải là số nguyên trong [${min}, ${MAX_STAFF_PER_STORE}]`,
      );
    }
    return OK;
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'SetStaff'>): void {
    const store = getStore(draft, cmd.payload.storeId);
    const before = store.staff;
    const after = cmd.payload.staff;
    if (after > before) {
      // skill ← (skill × staff_old + skill0 × Δ) / staff_new; giảm người không đổi skill.
      const hire = effectiveNewHireSkill(ctx.content, getCompany(draft, store.companyId));
      store.skill = (store.skill * before + hire * (after - before)) / after;
    }
    store.staff = after;
  },
};
