/** Thanh toán bằng tiền mặt có thấu chi tự động (economic-model §7.2, quyết định #7). */
import { sub, sum, ZERO, type Money } from '../money';
import type { CompanyId } from '../types/content';
import type { JournalEntry, JournalLine, Ledger } from '../types/ledger';
import { ACC, type AccountCode } from './accounts';
import { currentBalances } from './balances';
import { LedgerError, post } from './post';

export interface Payment {
  readonly companyId: CompanyId;
  readonly day: number;
  readonly memo: string;
  readonly refId?: string;
  /** Các khoản Nợ (chi phí, TSCĐ, trả gốc, nộp thuế…). Khoản 0 bị bỏ qua. */
  readonly debits: readonly { readonly account: AccountCode; readonly amount: Money }[];
}

/**
 * Ghi một bút toán: Nợ các khoản / Có Cash phần tiền mặt có, Có Overdraft phần thiếu.
 * Không kiểm hạn mức (khoản bắt buộc được vượt; lệnh tự nguyện validate ở command). Tổng 0 → không ghi, trả null.
 */
export function pay(ledger: Ledger, payment: Payment): JournalEntry | null {
  const lines: JournalLine[] = [];
  for (const { account, amount } of payment.debits) {
    if (account === ACC.Cash || account === ACC.Overdraft) {
      throw new LedgerError(`pay: cannot pay into ${account === ACC.Cash ? 'Cash' : 'Overdraft'}`);
    }
    if (amount < 0) throw new LedgerError(`pay: negative amount ${amount} for account ${account}`);
    if (amount > 0) lines.push({ account, debit: amount, credit: ZERO });
  }
  const total = sum(lines.map((l) => l.debit));
  if (total === 0) return null;

  const cash = currentBalances(ledger, payment.companyId)[ACC.Cash];
  const fromCash = total <= cash ? total : cash;
  const fromOverdraft = sub(total, fromCash);
  if (fromCash > 0) lines.push({ account: ACC.Cash, debit: ZERO, credit: fromCash });
  if (fromOverdraft > 0) lines.push({ account: ACC.Overdraft, debit: ZERO, credit: fromOverdraft });

  return post(ledger, {
    companyId: payment.companyId,
    day: payment.day,
    memo: payment.memo,
    ...(payment.refId === undefined ? {} : { refId: payment.refId }),
    lines,
  });
}
