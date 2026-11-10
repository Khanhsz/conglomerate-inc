/** SetQualityTier (spec §3): tier áp cho mọi cửa hàng của công ty (economic-model §4.4). */
import type { Validation } from '../types/commands';
import { QUALITY_TIERS } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { companyProblem, getCompany, OK, reject, type CommandOf } from './common';

const TIERS: ReadonlySet<unknown> = new Set(QUALITY_TIERS);

export const setQualityTier = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'SetQualityTier'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    if (!TIERS.has(cmd.payload.tier)) {
      return reject(`tier "${String(cmd.payload.tier)}" không tồn tại (có: ${QUALITY_TIERS.join(', ')})`);
    }
    return OK;
  },

  apply(draft: GameState, _ctx: SimContext, cmd: CommandOf<'SetQualityTier'>): void {
    getCompany(draft, cmd.companyId).qualityTier = cmd.payload.tier;
  },
};
