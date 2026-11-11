/** Lệnh của phòng Tài chính (economic-model §19.1, spec M1.6 §3). */
import { LOAN_TERMS_MONTHS } from '../constants';
import { ACC } from '../ledger/accounts';
import { post } from '../ledger/post';
import { add, money, toDisplay, ZERO } from '../money';
import { departmentProblem } from '../office';
import { creditLineMax, currentLeverage, loanQuote, revenueTrailing3m } from '../systems/loans';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { JournalLine } from '../types/ledger';
import type { GameState } from '../types/state';
import { companyProblem, getCompany, isSafeInt, OK, reject, type CommandOf } from './common';
import { earlyFee } from './repayLoan';
import { createLoan } from './takeLoan';

const TERMS: ReadonlySet<unknown> = new Set(LOAN_TERMS_MONTHS);

function financeProblem(state: GameState, companyId: unknown): string | null {
  const problem = companyProblem(state, companyId, 'notBankrupt');
  if (problem || typeof companyId !== 'string') return problem;
  return departmentProblem(getCompany(state, companyId), 'finance');
}

export const refinanceLoan = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'RefinanceLoan'>): Validation {
    const problem = financeProblem(state, cmd.companyId);
    if (problem) return reject(problem);
    const { loanId, termMonths } = cmd.payload;
    const loan = typeof loanId === 'string' ? state.loans[loanId] : undefined;
    if (!loan) return reject(`khoản vay "${String(loanId)}" không tồn tại`);
    if (loan.companyId !== cmd.companyId)
      return reject(`khoản vay ${loan.id} thuộc công ty ${loan.companyId}`);
    if (loan.outstanding <= 0) return reject(`khoản vay ${loan.id} đã trả hết`);
    if (!TERMS.has(termMonths))
      return reject(`kỳ hạn ${String(termMonths)} không hợp lệ (có: ${LOAN_TERMS_MONTHS.join(', ')} tháng)`);
    // Nợ mới = dư nợ cũ + phí, nên nợ tăng thêm đúng bằng phí.
    const quote = loanQuote(state, ctx.content, cmd.companyId, earlyFee(loan, ctx.content));
    return quote.ok ? OK : reject(quote.reason);
  },

  /** Một bút toán, không qua tiền mặt: Nợ Loans (dư nợ cũ) + Nợ InterestExpense (phí) / Có Loans (khoản mới). */
  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'RefinanceLoan'>): void {
    const old = draft.loans[cmd.payload.loanId];
    if (!old) throw new Error(`apply RefinanceLoan: unknown loan ${cmd.payload.loanId}`);
    const fee = earlyFee(old, ctx.content);
    const quote = loanQuote(draft, ctx.content, cmd.companyId, fee);
    if (!quote.ok) throw new Error(`apply RefinanceLoan after validate: ${quote.reason}`);
    const repaid = old.outstanding;
    const principal = add(repaid, fee);
    const { id, paymentMonthly } = createLoan(draft, {
      companyId: cmd.companyId,
      principal,
      annualRate: quote.annualRate,
      termMonths: cmd.payload.termMonths,
      day: ctx.day,
    });
    const lines: JournalLine[] = [{ account: ACC.Loans, debit: repaid, credit: ZERO }];
    if (fee > 0) lines.push({ account: ACC.InterestExpense, debit: fee, credit: ZERO });
    lines.push({ account: ACC.Loans, debit: ZERO, credit: principal });
    post(draft.ledger, {
      day: ctx.day,
      companyId: cmd.companyId,
      memo: `Tái cấp vốn ${old.id} → ${id}`,
      refId: id,
      lines,
    });
    old.outstanding = ZERO;
    draft.events.push(
      { day: ctx.day, kind: 'loanRepaid', companyId: cmd.companyId, loanId: old.id, principal: repaid, fee },
      {
        day: ctx.day,
        kind: 'loanTaken',
        companyId: cmd.companyId,
        loanId: id,
        principal,
        annualRate: quote.annualRate,
        termMonths: cmd.payload.termMonths,
        paymentMonthly,
      },
    );
  },
};

export const setCreditLine = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetCreditLine'>): Validation {
    const problem = financeProblem(state, cmd.companyId);
    if (problem) return reject(problem);
    const { limit } = cmd.payload;
    if (!isSafeInt(limit) || limit < 0) return reject(`hạn mức ${String(limit)} phải là số nguyên cent ≥ 0`);
    if (limit === 0) return OK;
    const { finance } = ctx.content.scenario;
    const max = creditLineMax(finance, revenueTrailing3m(state, cmd.companyId));
    if (limit > max)
      return reject(
        `hạn mức tối đa hiện tại là ${toDisplay(max)} (${finance.creditLine.revenueMultiple} × doanh thu 3 tháng)`,
      );
    const leverage = currentLeverage(state, cmd.companyId);
    if (leverage === null)
      return reject('cần EBITDA năm dương (ít nhất một tháng đã chốt) để được cấp hạn mức');
    if (leverage > finance.creditLine.maxLeverage)
      return reject(
        `leverage ${leverage.toFixed(2)} vượt ${finance.creditLine.maxLeverage} (nợ / EBITDA năm)`,
      );
    return OK;
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'SetCreditLine'>): void {
    const company = getCompany(draft, cmd.companyId);
    const limit = money(cmd.payload.limit);
    company.creditLine.limit = limit;
    company.overdraft.limit = limit > 0 ? limit : defaultOverdraftLimit(draft, ctx, cmd.companyId);
  },
};

/** Hạn mức thấu chi mặc định §7.2 = max(sàn, doanh thu 3 tháng). */
export function defaultOverdraftLimit(state: GameState, ctx: SimContext, companyId: string) {
  const revenue3m = revenueTrailing3m(state, companyId);
  const floor = ctx.content.scenario.finance.overdraftFloor;
  return revenue3m > floor ? revenue3m : floor;
}
