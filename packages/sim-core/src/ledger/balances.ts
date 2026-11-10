/**
 * Đọc số dư từ sổ cái. Sổ ghi theo thứ tự ngày không giảm, nên:
 * - `periodTotals` tìm bút toán đầu kỳ bằng binary search rồi chỉ quét trong kỳ;
 * - `balancesAt` lấy số dư hiện tại trừ ngược các bút toán sau `uptoDay` (quét từ cuối).
 * Chốt tháng vì thế chỉ chạm các bút toán của tháng, không quét cả sổ (quan trọng khi chạy trên draft immer).
 */
import { add, sub, ZERO, type Money } from '../money';
import type { CompanyId } from '../types/content';
import type { AccountBalances, AccountTotals, JournalLine, Ledger } from '../types/ledger';
import { ACCOUNT_CODES, ACCOUNTS, mapAccounts, zeroBalances } from './accounts';

const EMPTY: Readonly<AccountBalances> = Object.freeze(zeroBalances());

/** Cộng (sign = 1) hoặc trừ (sign = −1) các dòng vào số dư theo vế tăng của từng tài khoản. Mutate `balances`. */
export function applyLines(balances: AccountBalances, lines: readonly JournalLine[], sign: 1 | -1 = 1): void {
  for (const { account, debit, credit } of lines) {
    const delta = ACCOUNTS[account].normal === 'debit' ? sub(debit, credit) : sub(credit, debit);
    balances[account] = sign === 1 ? add(balances[account], delta) : sub(balances[account], delta);
  }
}

/** Chỉ số bút toán đầu tiên có day ≥ `day` (binary search; sổ đã sort theo ngày). */
function firstIndexFrom(ledger: Ledger, day: number): number {
  const entries = ledger.entries;
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((entries[mid]?.day ?? Infinity) < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Số dư hiện tại (sau bút toán cuối), O(1). Không được mutate kết quả. */
export function currentBalances(ledger: Ledger, companyId: CompanyId): Readonly<AccountBalances> {
  return ledger.balances[companyId] ?? EMPTY;
}

/** Số dư cuối ngày `uptoDay` (gồm ngày đó). `uptoDay = −1` → toàn 0. */
export function balancesAt(ledger: Ledger, companyId: CompanyId, uptoDay: number): AccountBalances {
  if (uptoDay < 0) return zeroBalances();
  const balances = { ...currentBalances(ledger, companyId) };
  for (let i = ledger.entries.length - 1; i >= 0; i--) {
    const entry = ledger.entries[i];
    if (!entry || entry.day <= uptoDay) break;
    if (entry.companyId === companyId) applyLines(balances, entry.lines, -1);
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
  for (let i = firstIndexFrom(ledger, fromDay); i < ledger.entries.length; i++) {
    const entry = ledger.entries[i];
    if (!entry || entry.day > toDay) break;
    if (entry.companyId !== companyId) continue;
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
