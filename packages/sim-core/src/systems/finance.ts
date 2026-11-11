/** Tài chính hằng ngày (economic-model §7.2): tự trả thấu chi, cộng dồn số dư thấu chi cuối ngày. */
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { post } from '../ledger/post';
import { add, ZERO } from '../money';
import type { System } from '../types/context';
import { dailyRate } from './macro';

export const financeDailySystem: System = (draft, ctx) => {
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.status === 'bankrupt') continue;
    const before = currentBalances(draft.ledger, companyId);
    const cash = before[ACC.Cash];
    const owed = before[ACC.Overdraft];
    const repay = cash < owed ? cash : owed; // min(cash, overdraft)
    if (repay > 0) {
      post(draft.ledger, {
        day: ctx.day,
        companyId,
        memo: 'Tự trả thấu chi',
        lines: [
          { account: ACC.Overdraft, debit: repay, credit: ZERO },
          { account: ACC.Cash, debit: ZERO, credit: repay },
        ],
      });
    }
    const overdraft = currentBalances(draft.ledger, companyId)[ACC.Overdraft];
    company.overdraft.dailyBalanceSum = add(company.overdraft.dailyBalanceSum, overdraft);
    // Phí cam kết trên phần hạn mức tín dụng chưa dùng (§19.1); không có hạn mức thì bỏ qua.
    const { limit } = company.creditLine;
    if (limit > overdraft) {
      company.creditLine.commitmentFeeAccrued +=
        (limit - overdraft) * dailyRate(ctx.content.scenario.finance.creditLine.commitmentFeeAnnual);
    }
  }
};
