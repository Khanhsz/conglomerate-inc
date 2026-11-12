import { describe, expect, it } from 'vitest';
import { money } from '../money';
import type { JournalLine } from '../types/ledger';
import { ACC, type AccountCode } from './accounts';
import { balancesAt, currentBalances, periodTotals, retainedEarnings } from './balances';
import { createLedger, post } from './post';

const dr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(n), credit: money(0) });
const cr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(0), credit: money(n) });

function sample() {
  const ledger = createLedger();
  post(ledger, {
    day: 0,
    companyId: 'a',
    memo: 'capital',
    lines: [dr(ACC.Cash, 1000), cr(ACC.ShareCapital, 1000)],
  });
  post(ledger, {
    day: 0,
    companyId: 'b',
    memo: 'capital',
    lines: [dr(ACC.Cash, 50), cr(ACC.ShareCapital, 50)],
  });
  post(ledger, { day: 10, companyId: 'a', memo: 'sale', lines: [dr(ACC.Cash, 200), cr(ACC.Revenue, 200)] });
  post(ledger, { day: 29, companyId: 'a', memo: 'rent', lines: [dr(ACC.Rent, 80), cr(ACC.Cash, 80)] });
  post(ledger, {
    day: 30,
    companyId: 'a',
    memo: 'tax refund',
    lines: [dr(ACC.TaxPayable, 15), cr(ACC.IncomeTax, 15)],
  });
  return ledger;
}

describe('balancesAt', () => {
  it('includes uptoDay and filters by company', () => {
    const ledger = sample();
    expect(balancesAt(ledger, 'a', 9)[ACC.Cash]).toBe(1000);
    expect(balancesAt(ledger, 'a', 10)[ACC.Cash]).toBe(1200);
    expect(balancesAt(ledger, 'a', 29)[ACC.Cash]).toBe(1120);
    expect(balancesAt(ledger, 'b', 29)[ACC.Cash]).toBe(50);
  });

  it('returns all zeros before day 0 and for unknown companies', () => {
    const ledger = sample();
    expect(Object.values(balancesAt(ledger, 'a', -1)).every((v) => v === 0)).toBe(true);
    expect(Object.values(balancesAt(ledger, 'nobody', 100)).every((v) => v === 0)).toBe(true);
  });

  it('uses the normal side: contra/credit accounts are positive, a refund makes TaxPayable negative', () => {
    const b = balancesAt(sample(), 'a', 30);
    expect(b[ACC.ShareCapital]).toBe(1000);
    expect(b[ACC.Revenue]).toBe(200);
    expect(b[ACC.TaxPayable]).toBe(-15);
    expect(b[ACC.IncomeTax]).toBe(-15);
  });

  it('matches currentBalances at the last day', () => {
    const ledger = sample();
    expect(balancesAt(ledger, 'a', 1e6)).toEqual(currentBalances(ledger, 'a'));
  });
});

describe('periodTotals', () => {
  it('is inclusive at both ends and separates debit/credit', () => {
    const ledger = sample();
    const t = periodTotals(ledger, 'a', 10, 29);
    expect(t[ACC.Cash]).toEqual({ debit: 200, credit: 80 });
    expect(t[ACC.Revenue]).toEqual({ debit: 0, credit: 200 });
    expect(t[ACC.ShareCapital]).toEqual({ debit: 0, credit: 0 });
    expect(periodTotals(ledger, 'a', 0, 0)[ACC.Cash]).toEqual({ debit: 1000, credit: 0 });
    expect(periodTotals(ledger, 'a', 30, 59)[ACC.TaxPayable]).toEqual({ debit: 15, credit: 0 });
  });
});

describe('retainedEarnings', () => {
  it('= Σ income − Σ expense (normal-side balances)', () => {
    const ledger = sample();
    expect(retainedEarnings(balancesAt(ledger, 'a', 29))).toBe(120); // 200 − 80
    expect(retainedEarnings(balancesAt(ledger, 'a', 30))).toBe(135); // IncomeTax −15 → +15
  });
});
