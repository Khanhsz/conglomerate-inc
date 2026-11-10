/** SetPrice (spec §3): giá ∈ [0.3, 5] × Pref hiện tại. */
import { PRICE_BAND } from '../constants';
import { money } from '../money';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import {
  companyProblem,
  inBand,
  isSafeInt,
  OK,
  refPrice,
  reject,
  storeRefProblem,
  targetStores,
  type CommandOf,
} from './common';

export const setPrice = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetPrice'>): Validation {
    const problem =
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
      storeRefProblem(state, cmd.companyId, cmd.payload.storeId);
    if (problem) return reject(problem);
    const { price } = cmd.payload;
    const pref = refPrice(state, ctx.content);
    if (!isSafeInt(price) || !inBand(price, pref, PRICE_BAND)) {
      return reject(
        `giá ${String(price)} không hợp lệ: phải là số nguyên cent trong [${PRICE_BAND.min}, ${PRICE_BAND.max}] × Pref (${pref.toFixed(2)})`,
      );
    }
    return OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'SetPrice'>): void {
    const price = money(cmd.payload.price);
    for (const store of targetStores(draft, cmd.companyId, cmd.payload.storeId)) store.price = price;
  },
};
