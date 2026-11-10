/** CloseStore (spec §3, economic-model §6.1): ghi giảm GTCL và trả phí chấm dứt 3 tháng thuê. */
import { LEASE_TERMINATION_MONTHS } from '../constants';
import { ACC } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { mul, sub, ZERO } from '../money';
import type { Validation } from '../types/commands';
import type { JournalLine } from '../types/ledger';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { companyProblem, fromProblem, getStore, ownedOpenStoreProblem, type CommandOf } from './common';

export const closeStore = {
  validate(state: GameState, _ctx: SimContext, cmd: CommandOf<'CloseStore'>): Validation {
    return fromProblem(
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
        ownedOpenStoreProblem(state, cmd.companyId, cmd.payload.storeId),
    );
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'CloseStore'>): void {
    const store = getStore(draft, cmd.payload.storeId);
    const accumulated = store.accumDep;
    const loss = sub(store.capex, accumulated);
    if (store.capex > 0) {
      // Nợ AccumDep (khấu hao lũy kế) / Nợ LossOnDisposal (GTCL) / Có PP&E (nguyên giá)
      const lines: JournalLine[] = [];
      if (accumulated > 0)
        lines.push({ account: ACC.AccumulatedDepreciation, debit: accumulated, credit: ZERO });
      if (loss > 0) lines.push({ account: ACC.LossOnDisposal, debit: loss, credit: ZERO });
      lines.push({ account: ACC.PPE, debit: ZERO, credit: store.capex });
      post(draft.ledger, {
        day: ctx.day,
        companyId: store.companyId,
        memo: `Thanh lý cửa hàng ${store.id}`,
        refId: store.id,
        lines,
      });
    }
    pay(draft.ledger, {
      companyId: store.companyId,
      day: ctx.day,
      memo: `Phí chấm dứt thuê cửa hàng ${store.id} (${LEASE_TERMINATION_MONTHS} tháng)`,
      refId: store.id,
      debits: [{ account: ACC.Rent, amount: mul(store.rentMonthly, LEASE_TERMINATION_MONTHS) }],
    });
    store.accumDep = ZERO;
    store.status = 'closed';
    store.closedDay = ctx.day;
    draft.events.push({ day: ctx.day, kind: 'storeClosed', companyId: store.companyId, storeId: store.id });
  },
};
