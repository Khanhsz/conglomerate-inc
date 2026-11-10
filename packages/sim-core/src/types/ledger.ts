/** Kiểu của sổ cái kép (economic-model §6, §12). Dữ liệu thuần, serializable. */
import type { AccountCode } from '../ledger/accounts';
import type { Money } from '../money';
import type { CompanyId } from './content';

/** Một dòng bút toán: đúng một vế > 0, vế kia = 0. */
export interface JournalLine {
  readonly account: AccountCode;
  readonly debit: Money;
  readonly credit: Money;
}

export interface JournalEntry {
  readonly id: number;
  readonly day: number;
  readonly companyId: CompanyId;
  readonly memo: string;
  readonly refId?: string;
  readonly lines: readonly JournalLine[];
}

export type NewJournalEntry = Omit<JournalEntry, 'id'>;

/** Số dư theo vế tăng của từng tài khoản (dương = bình thường; TaxPayable có thể âm). */
export type AccountBalances = { [C in AccountCode]: Money };

/** Phát sinh Nợ / Có trong một kỳ. */
export type AccountTotals = { [C in AccountCode]: { readonly debit: Money; readonly credit: Money } };

export interface Ledger {
  /** Chỉ ghi nối tiếp, theo thứ tự `day` không giảm. */
  entries: JournalEntry[];
  nextEntryId: number;
  /** Số dư hiện tại theo công ty, cập nhật trong `post()` (thêm so với spec §2 để `pay()` đọc O(1)). */
  balances: Record<CompanyId, AccountBalances>;
}
