import { describe, expect, it } from 'vitest';
import { money } from '../money';
import { ACC } from './accounts';
import { currentBalances } from './balances';
import { pay } from './payments';
import { createLedger, post } from './post';

function withCash(cash: number) {
  const ledger = createLedger();
  if (cash > 0) {
    post(ledger, {
      day: 0,
      companyId: 'p',
      memo: 'capital',
      lines: [
        { account: ACC.Cash, debit: money(cash), credit: money(0) },
        { account: ACC.ShareCapital, debit: money(0), credit: money(cash) },
      ],
    });
  }
  return ledger;
}

describe('pay (economic-model §7.2)', () => {
  it('pays from cash when cash is enough', () => {
    const ledger = withCash(1000);
    const e = pay(ledger, {
      companyId: 'p',
      day: 1,
      memo: 'rent',
      debits: [{ account: ACC.Rent, amount: money(400) }],
    });
    expect(e?.lines).toEqual([
      { account: ACC.Rent, debit: 400, credit: 0 },
      { account: ACC.Cash, debit: 0, credit: 400 },
    ]);
    expect(currentBalances(ledger, 'p')[ACC.Cash]).toBe(600);
    expect(currentBalances(ledger, 'p')[ACC.Overdraft]).toBe(0);
  });

  it('draws the shortfall from overdraft in the same entry', () => {
    const ledger = withCash(1000);
    const e = pay(ledger, {
      companyId: 'p',
      day: 29,
      memo: 'month close',
      refId: 'store-000001',
      debits: [
        { account: ACC.Wages, amount: money(900) },
        { account: ACC.Rent, amount: money(300) },
      ],
    });
    expect(e?.refId).toBe('store-000001');
    expect(e?.lines).toEqual([
      { account: ACC.Wages, debit: 900, credit: 0 },
      { account: ACC.Rent, debit: 300, credit: 0 },
      { account: ACC.Cash, debit: 0, credit: 1000 },
      { account: ACC.Overdraft, debit: 0, credit: 200 },
    ]);
    const b = currentBalances(ledger, 'p');
    expect(b[ACC.Cash]).toBe(0);
    expect(b[ACC.Overdraft]).toBe(200);
  });

  it('uses only overdraft when cash is zero', () => {
    const ledger = withCash(0);
    const e = pay(ledger, {
      companyId: 'p',
      day: 0,
      memo: 'cogs',
      debits: [{ account: ACC.COGS, amount: money(50) }],
    });
    expect(e?.lines).toEqual([
      { account: ACC.COGS, debit: 50, credit: 0 },
      { account: ACC.Overdraft, debit: 0, credit: 50 },
    ]);
  });

  it('skips zero debits and posts nothing when the total is zero', () => {
    const ledger = withCash(100);
    const before = ledger.entries.length;
    expect(
      pay(ledger, {
        companyId: 'p',
        day: 1,
        memo: 'none',
        debits: [{ account: ACC.Marketing, amount: money(0) }],
      }),
    ).toBeNull();
    expect(ledger.entries).toHaveLength(before);
    const e = pay(ledger, {
      companyId: 'p',
      day: 1,
      memo: 'mixed',
      debits: [
        { account: ACC.Marketing, amount: money(0) },
        { account: ACC.Admin, amount: money(10) },
      ],
    });
    expect(e?.lines.map((l) => l.account)).toEqual([ACC.Admin, ACC.Cash]);
  });

  it('rejects negative amounts and paying into Cash or Overdraft', () => {
    const ledger = withCash(100);
    expect(() =>
      pay(ledger, { companyId: 'p', day: 1, memo: 'x', debits: [{ account: ACC.Rent, amount: money(-1) }] }),
    ).toThrow();
    expect(() =>
      pay(ledger, { companyId: 'p', day: 1, memo: 'x', debits: [{ account: ACC.Cash, amount: money(1) }] }),
    ).toThrow();
    expect(() =>
      pay(ledger, {
        companyId: 'p',
        day: 1,
        memo: 'x',
        debits: [{ account: ACC.Overdraft, amount: money(1) }],
      }),
    ).toThrow();
  });
});
