/** SetWage (spec §3): lương ∈ [0.5, 3] × lương thị trường hiện tại. */
import { WAGE_BAND } from '../constants';
import { money } from '../money';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import {
  companyProblem,
  inBand,
  isSafeInt,
  marketWage,
  OK,
  reject,
  storeRefProblem,
  targetStores,
  type CommandOf,
} from './common';

export const setWage = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'SetWage'>): Validation {
    const problem =
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
      storeRefProblem(state, cmd.companyId, cmd.payload.storeId);
    if (problem) return reject(problem);
    const { wageMonthly } = cmd.payload;
    const market = marketWage(state);
    if (!isSafeInt(wageMonthly) || !inBand(wageMonthly, market, WAGE_BAND)) {
      return reject(
        `lương ${String(wageMonthly)} không hợp lệ: phải là số nguyên cent trong [${WAGE_BAND.min}, ${WAGE_BAND.max}] × lương thị trường (${market.toFixed(0)})`,
      );
    }
    return OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'SetWage'>): void {
    const wage = money(cmd.payload.wageMonthly);
    for (const store of targetStores(draft, cmd.companyId, cmd.payload.storeId)) {
      store.wageMonthly = wage;
      store.overrides.wage = true; // đặt tay: không theo lương chuẩn của công ty nữa (§16.1)
    }
  },
};
