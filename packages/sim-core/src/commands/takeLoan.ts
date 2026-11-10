/** TakeLoan (economic-model §7.1): Nợ Cash / Có Loans; lãi cố định = policyRate + spread(leverage). */
import { LOAN_TERMS_MONTHS } from '../constants';
import { formatId } from '../ids';
import { ACC } from '../ledger/accounts';
import { post } from '../ledger/post';
import { money, ZERO } from '../money';
import { annuityPayment, loanQuote } from '../systems/loans';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { companyProblem, isSafeInt, OK, reject, type CommandOf } from './common';

const TERMS: ReadonlySet<unknown> = new Set(LOAN_TERMS_MONTHS);

export const takeLoan = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'TakeLoan'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    const { principal, termMonths } = cmd.payload;
    if (!isSafeInt(principal) || principal <= 0)
      return reject(`số tiền vay ${String(principal)} phải là số nguyên cent > 0`);
    if (!TERMS.has(termMonths))
      return reject(`kỳ hạn ${String(termMonths)} không hợp lệ (có: ${LOAN_TERMS_MONTHS.join(', ')} tháng)`);
    const quote = loanQuote(state, ctx.content, cmd.companyId, money(principal));
    return quote.ok ? OK : reject(quote.reason);
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'TakeLoan'>): void {
    const principal = money(cmd.payload.principal);
    const quote = loanQuote(draft, ctx.content, cmd.companyId, principal);
    if (!quote.ok) throw new Error(`apply TakeLoan after validate: ${quote.reason}`);
    const id = formatId('loan', draft.nextIds.loan);
    draft.nextIds.loan += 1;
    const paymentMonthly = annuityPayment(principal, quote.annualRate, cmd.payload.termMonths);
    draft.loans[id] = {
      id,
      companyId: cmd.companyId,
      principal,
      outstanding: principal,
      paymentMonthly,
      annualRate: quote.annualRate,
      termMonths: cmd.payload.termMonths,
      takenDay: ctx.day,
      paymentsMade: 0,
    };
    draft.loanIds.push(id);
    post(draft.ledger, {
      day: ctx.day,
      companyId: cmd.companyId,
      memo: `Vay ${id}`,
      refId: id,
      lines: [
        { account: ACC.Cash, debit: principal, credit: ZERO },
        { account: ACC.Loans, debit: ZERO, credit: principal },
      ],
    });
    draft.events.push({
      day: ctx.day,
      kind: 'loanTaken',
      companyId: cmd.companyId,
      loanId: id,
      principal,
      annualRate: quote.annualRate,
      termMonths: cmd.payload.termMonths,
      paymentMonthly,
    });
  },
};
