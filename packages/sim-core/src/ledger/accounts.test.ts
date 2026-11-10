import { describe, expect, it } from 'vitest';
import { ACC, ACCOUNT_CODES, ACCOUNTS, isAccountCode, zeroBalances } from './accounts';

describe('chart of accounts (economic-model §12)', () => {
  it('has exactly the 17 accounts of §12', () => {
    const table = ACCOUNT_CODES.map((code) => [code, ACCOUNTS[code].name, ACCOUNTS[code].type]);
    expect(table).toEqual([
      [1000, 'Cash', 'asset'],
      [1500, 'PPE', 'asset'],
      [1590, 'AccumulatedDepreciation', 'asset'],
      [2000, 'Overdraft', 'liability'],
      [2100, 'TaxPayable', 'liability'],
      [2500, 'Loans', 'liability'],
      [3000, 'ShareCapital', 'equity'],
      [4000, 'Revenue', 'income'],
      [5000, 'COGS', 'expense'],
      [6000, 'Wages', 'expense'],
      [6100, 'Rent', 'expense'],
      [6200, 'Marketing', 'expense'],
      [6300, 'Depreciation', 'expense'],
      [6400, 'Admin', 'expense'],
      [6900, 'LossOnDisposal', 'expense'],
      [7000, 'InterestExpense', 'expense'],
      [8000, 'IncomeTax', 'expense'],
    ]);
  });

  it('ACCOUNT_CODES is sorted and covers every account', () => {
    expect([...ACCOUNT_CODES].sort((a, b) => a - b)).toEqual(ACCOUNT_CODES);
    expect(ACCOUNT_CODES.map(String)).toEqual(Object.keys(ACCOUNTS));
  });

  it('normal balance side follows the account type; AccumulatedDepreciation is a contra asset', () => {
    for (const code of ACCOUNT_CODES) {
      const { type, normal } = ACCOUNTS[code];
      const expected =
        code === ACC.AccumulatedDepreciation
          ? 'credit'
          : type === 'asset' || type === 'expense'
            ? 'debit'
            : 'credit';
      expect(normal, `${code}`).toBe(expected);
    }
    expect(ACCOUNTS[ACC.AccumulatedDepreciation].contra).toBe(true);
  });

  it('ACC maps every name to its code', () => {
    for (const code of ACCOUNT_CODES) expect(ACC[ACCOUNTS[code].name]).toBe(code);
  });

  it('isAccountCode', () => {
    expect(isAccountCode(1000)).toBe(true);
    expect(isAccountCode(1001)).toBe(false);
    expect(isAccountCode('1000')).toBe(false);
  });

  it('zeroBalances returns a fresh all-zero record', () => {
    const a = zeroBalances();
    expect(ACCOUNT_CODES.every((c) => a[c] === 0)).toBe(true);
    expect(zeroBalances()).not.toBe(a);
  });
});
