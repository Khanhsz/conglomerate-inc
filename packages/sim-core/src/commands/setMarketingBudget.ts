/** SetMarketingBudget (spec §3): 0 ≤ ngân sách tháng ≤ $1M. */
import { MAX_MARKETING_BUDGET_MONTHLY } from '../constants';
import { money, toDisplay } from '../money';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { companyProblem, getCompany, isSafeInt, OK, reject, type CommandOf } from './common';

export const setMarketingBudget = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'SetMarketingBudget'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    const { monthly } = cmd.payload;
    if (!isSafeInt(monthly) || monthly < 0 || monthly > MAX_MARKETING_BUDGET_MONTHLY) {
      return reject(
        `ngân sách marketing ${String(monthly)} không hợp lệ: phải là số nguyên cent trong [0, ${toDisplay(money(MAX_MARKETING_BUDGET_MONTHLY))}]`,
      );
    }
    return OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'SetMarketingBudget'>): void {
    getCompany(draft, cmd.companyId).marketingBudgetMonthly = money(cmd.payload.monthly);
  },
};
