/** RepayLoan (economic-model §7.1): trả hết gốc còn lại + phí trả sớm (ghi InterestExpense, #14e). */
import { ACC } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { add, pct, toDisplay, ZERO } from '../money';
import type { Validation } from '../types/commands';
import type { LoadedContent } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState, Loan } from '../types/state';
import { companyProblem, OK, reject, spendingPower, type CommandOf } from './common';

function earlyFee(loan: Loan, content: LoadedContent) {
  return pct(loan.outstanding, content.scenario.finance.earlyRepaymentFee);
}

export const repayLoan = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'RepayLoan'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    const { loanId } = cmd.payload;
    const loan = typeof loanId === 'string' ? state.loans[loanId] : undefined;
    if (!loan) return reject(`khoản vay "${String(loanId)}" không tồn tại`);
    if (loan.companyId !== cmd.companyId)
      return reject(`khoản vay ${loan.id} thuộc công ty ${loan.companyId}`);
    if (loan.outstanding <= 0) return reject(`khoản vay ${loan.id} đã trả hết`);
    const cost = add(loan.outstanding, earlyFee(loan, ctx.content));
    if (spendingPower(state, cmd.companyId) < cost) {
      return reject(`không đủ tiền trả ${toDisplay(cost)} (gốc + phí trả sớm) kể cả hạn mức thấu chi`);
    }
    return OK;
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'RepayLoan'>): void {
    const loan = draft.loans[cmd.payload.loanId];
    if (!loan) throw new Error(`apply RepayLoan: unknown loan ${cmd.payload.loanId}`);
    const principal = loan.outstanding;
    const fee = earlyFee(loan, ctx.content);
    pay(draft.ledger, {
      companyId: cmd.companyId,
      day: ctx.day,
      memo: `Trả sớm ${loan.id}`,
      refId: loan.id,
      debits: [
        { account: ACC.Loans, amount: principal },
        { account: ACC.InterestExpense, amount: fee },
      ],
    });
    loan.outstanding = ZERO;
    draft.events.push({
      day: ctx.day,
      kind: 'loanRepaid',
      companyId: cmd.companyId,
      loanId: loan.id,
      principal,
      fee,
    });
  },
};
