/** Hệ thống tài khoản (economic-model §12). */
import { ZERO, type Money } from '../money';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type NormalSide = 'debit' | 'credit';

export interface AccountDef {
  readonly name: string;
  readonly type: AccountType;
  /** Vế làm tăng số dư. */
  readonly normal: NormalSide;
  /** Tài khoản điều chỉnh giảm (AccumulatedDepreciation: loại tài sản nhưng vế Có). */
  readonly contra: boolean;
}

export const ACCOUNTS = {
  1000: { name: 'Cash', type: 'asset', normal: 'debit', contra: false },
  1500: { name: 'PPE', type: 'asset', normal: 'debit', contra: false },
  1590: { name: 'AccumulatedDepreciation', type: 'asset', normal: 'credit', contra: true },
  2000: { name: 'Overdraft', type: 'liability', normal: 'credit', contra: false },
  2100: { name: 'TaxPayable', type: 'liability', normal: 'credit', contra: false },
  2500: { name: 'Loans', type: 'liability', normal: 'credit', contra: false },
  3000: { name: 'ShareCapital', type: 'equity', normal: 'credit', contra: false },
  4000: { name: 'Revenue', type: 'income', normal: 'credit', contra: false },
  5000: { name: 'COGS', type: 'expense', normal: 'debit', contra: false },
  6000: { name: 'Wages', type: 'expense', normal: 'debit', contra: false },
  6100: { name: 'Rent', type: 'expense', normal: 'debit', contra: false },
  6200: { name: 'Marketing', type: 'expense', normal: 'debit', contra: false },
  6300: { name: 'Depreciation', type: 'expense', normal: 'debit', contra: false },
  6400: { name: 'Admin', type: 'expense', normal: 'debit', contra: false },
  6900: { name: 'LossOnDisposal', type: 'expense', normal: 'debit', contra: false },
  7000: { name: 'InterestExpense', type: 'expense', normal: 'debit', contra: false },
  8000: { name: 'IncomeTax', type: 'expense', normal: 'debit', contra: false },
} as const satisfies Record<number, AccountDef>;

export type AccountCode = keyof typeof ACCOUNTS;
export type AccountName = (typeof ACCOUNTS)[AccountCode]['name'];

/** Tên → mã, để code đọc được (`ACC.Cash`). */
export const ACC = {
  Cash: 1000,
  PPE: 1500,
  AccumulatedDepreciation: 1590,
  Overdraft: 2000,
  TaxPayable: 2100,
  Loans: 2500,
  ShareCapital: 3000,
  Revenue: 4000,
  COGS: 5000,
  Wages: 6000,
  Rent: 6100,
  Marketing: 6200,
  Depreciation: 6300,
  Admin: 6400,
  LossOnDisposal: 6900,
  InterestExpense: 7000,
  IncomeTax: 8000,
} as const satisfies { readonly [N in AccountName]: AccountCode };

/** Mọi mã, tăng dần. Duyệt tài khoản bằng mảng này, không dùng Object.keys. */
export const ACCOUNT_CODES = [
  1000, 1500, 1590, 2000, 2100, 2500, 3000, 4000, 5000, 6000, 6100, 6200, 6300, 6400, 6900, 7000, 8000,
] as const satisfies readonly AccountCode[];

const CODE_SET: ReadonlySet<unknown> = new Set(ACCOUNT_CODES);

export function isAccountCode(n: unknown): n is AccountCode {
  return CODE_SET.has(n);
}

/** Dựng một record đủ 17 tài khoản (TS kiểm tra đủ key, không cần ép kiểu). */
export function mapAccounts<T>(f: (code: AccountCode) => T): { [C in AccountCode]: T } {
  return {
    1000: f(1000),
    1500: f(1500),
    1590: f(1590),
    2000: f(2000),
    2100: f(2100),
    2500: f(2500),
    3000: f(3000),
    4000: f(4000),
    5000: f(5000),
    6000: f(6000),
    6100: f(6100),
    6200: f(6200),
    6300: f(6300),
    6400: f(6400),
    6900: f(6900),
    7000: f(7000),
    8000: f(8000),
  };
}

export function zeroBalances(): { [C in AccountCode]: Money } {
  return mapAccounts(() => ZERO);
}
