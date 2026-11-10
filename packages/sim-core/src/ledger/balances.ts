/**
 * Đọc số dư từ sổ cái. `balancesAt` / `periodTotals` quét tuyến tính và dừng sớm nhờ sổ ghi theo thứ tự ngày.
 * Khi cần nhanh hơn: thêm số dư lũy kế theo tháng vào Ledger, cập nhật trong `post()` (điểm ghi duy nhất).
 */
import { add, sub, ZERO, type Money } from '../money';
import type { CompanyId } from '../types/content';
import type { AccountBalances, AccountTotals, JournalLine, Ledger } from '../types/ledger';
import { ACCOUNT_CODES, ACCOUNTS, mapAccounts, zeroBalances } from './accounts';

const EMPTY: Readonly<AccountBalances> = Object.freeze(zeroBalances());

/** Cộng các dòng vào số dư (theo vế tăng của từng tài khoản). Mutate `balances`. */
export function applyLines(balances: AccountBalances, lines: readonly JournalLine[]): void {
  for (const { account, debit, credit } of lines) {
    const delta = ACCOUNTS[account].normal === 'debit' ? sub(debit, credit) : sub(credit, debit);
    balances[account] = add(balances[account], delta);
  }
}

/** Số dư hiện tại (sau bút toán cuối), O(1). Không được mutate kết quả. */
export function currentBalances(ledger: Ledger, companyId: CompanyId): Readonly<AccountBalances> {
  return ledger.balances[companyId] ?? EMPTY;
}

/** Số dư cuối ngày `uptoDay` (gồm ngày đó). `uptoDay = −1` → toàn 0. */
export function balancesAt(ledger: Ledger, companyId: CompanyId, uptoDay: number): AccountBalances {
  const balances = zeroBalances();
  for (const entry of ledger.entries) {
    if (entry.day > uptoDay) break;
    if (entry.companyId === companyId) applyLines(balances, entry.lines);
  }
  return balances;
}

/** Phát sinh Nợ / Có trong [fromDay, toDay], gồm cả hai đầu. */
export function periodTotals(
  ledger: Ledger,
  companyId: CompanyId,
  fromDay: number,
  toDay: number,
): AccountTotals {
  const totals = mapAccounts((): { debit: Money; credit: Money } => ({ debit: ZERO, credit: ZERO }));
  for (const entry of ledger.entries) {
    if (entry.day > toDay) break;
    if (entry.day < fromDay || entry.companyId !== companyId) continue;
    for (const { account, debit, credit } of entry.lines) {
      const t = totals[account];
      t.debit = add(t.debit, debit);
      t.credit = add(t.credit, credit);
    }
  }
  return totals;
}

/** Lợi nhuận giữ lại = Σ thu nhập − Σ chi phí (không có tài khoản riêng, economic-model §11). */
export function retainedEarnings(balances: Readonly<AccountBalances>): Money {
  let re = ZERO;
  for (const code of ACCOUNT_CODES) {
    const { type } = ACCOUNTS[code];
    if (type === 'income') re = add(re, balances[code]);
    else if (type === 'expense') re = sub(re, balances[code]);
  }
  return re;
}
