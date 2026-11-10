import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stableStringify } from '../hash';
import { money } from '../money';
import type { JournalLine, NewJournalEntry } from '../types/ledger';
import { ACC, ACCOUNT_CODES, type AccountCode } from './accounts';
import { currentBalances } from './balances';
import { createLedger, LedgerError, post } from './post';

const dr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(n), credit: money(0) });
const cr = (account: AccountCode, n: number): JournalLine => ({ account, debit: money(0), credit: money(n) });
const entry = (lines: JournalLine[], day = 0, companyId = 'player'): NewJournalEntry => ({
  day,
  companyId,
  memo: 'test',
  lines,
});

/** Dữ liệu không qua kiểu (giả lập input sai); JSON.parse trả any nên không cần ép kiểu. */
const untyped = (v: unknown): NewJournalEntry => JSON.parse(JSON.stringify(v));

describe('post', () => {
  it('assigns increasing ids and updates current balances', () => {
    const ledger = createLedger();
    const a = post(ledger, entry([dr(ACC.Cash, 1000), cr(ACC.ShareCapital, 1000)]));
    const b = post(ledger, entry([dr(ACC.Rent, 300), cr(ACC.Cash, 300)], 5));
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(ledger.nextEntryId).toBe(3);
    expect(ledger.entries).toHaveLength(2);
    const bal = currentBalances(ledger, 'player');
    expect(bal[ACC.Cash]).toBe(700);
    expect(bal[ACC.ShareCapital]).toBe(1000);
    expect(bal[ACC.Rent]).toBe(300);
    expect(currentBalances(ledger, 'other')[ACC.Cash]).toBe(0);
  });

  it('keeps refId only when given and copies lines', () => {
    const ledger = createLedger();
    const lines = [dr(ACC.Cash, 10), cr(ACC.Revenue, 10)];
    const withRef = post(ledger, { ...entry(lines), refId: 'store-000001' });
    const noRef = post(ledger, entry(lines));
    expect(withRef.refId).toBe('store-000001');
    expect('refId' in noRef).toBe(false);
    lines.push(dr(ACC.Cash, 999));
    expect(ledger.entries[0]?.lines).toHaveLength(2);
  });

  it('allows several lines per side', () => {
    const ledger = createLedger();
    post(ledger, entry([dr(ACC.Cash, 1000), cr(ACC.ShareCapital, 1000)]));
    post(ledger, entry([dr(ACC.Wages, 300), dr(ACC.Rent, 200), cr(ACC.Cash, 450), cr(ACC.Overdraft, 50)]));
    expect(currentBalances(ledger, 'player')[ACC.Cash]).toBe(550);
  });

  const rejections: [string, NewJournalEntry][] = [
    ['unbalanced', entry([dr(ACC.Cash, 100), cr(ACC.ShareCapital, 99)])],
    [
      'a single line',
      untyped({ day: 0, companyId: 'player', memo: 'x', lines: [{ account: 1000, debit: 0, credit: 0 }] }),
    ],
    ['no lines', untyped({ day: 0, companyId: 'player', memo: 'x', lines: [] })],
    ['a zero line', entry([dr(ACC.Cash, 100), cr(ACC.ShareCapital, 100), dr(ACC.Rent, 0)])],
    [
      'a negative amount',
      untyped({
        day: 0,
        companyId: 'p',
        memo: 'x',
        lines: [
          { account: 1000, debit: 100, credit: 0 },
          { account: 6100, debit: -5, credit: 0 },
          { account: 3000, debit: 0, credit: 95 },
        ],
      }),
    ],
    [
      'both sides on one line',
      untyped({
        day: 0,
        companyId: 'p',
        memo: 'x',
        lines: [
          { account: 1000, debit: 5, credit: 5 },
          { account: 6100, debit: 3, credit: 0 },
          { account: 3000, debit: 0, credit: 3 },
        ],
      }),
    ],
    [
      'a fractional amount',
      untyped({
        day: 0,
        companyId: 'p',
        memo: 'x',
        lines: [
          { account: 1000, debit: 1.5, credit: 0 },
          { account: 3000, debit: 0, credit: 1.5 },
        ],
      }),
    ],
    [
      'an unknown account',
      untyped({
        day: 0,
        companyId: 'p',
        memo: 'x',
        lines: [
          { account: 1234, debit: 5, credit: 0 },
          { account: 3000, debit: 0, credit: 5 },
        ],
      }),
    ],
    ['a negative day', entry([dr(ACC.Cash, 100), cr(ACC.ShareCapital, 100)], -1)],
    ['a fractional day', entry([dr(ACC.Cash, 100), cr(ACC.ShareCapital, 100)], 1.5)],
    ['an empty companyId', entry([dr(ACC.Cash, 100), cr(ACC.ShareCapital, 100)], 0, '')],
    ['Cash going negative', entry([dr(ACC.Rent, 100), cr(ACC.Cash, 100)])],
    ['Overdraft going negative', entry([dr(ACC.Overdraft, 100), cr(ACC.ShareCapital, 100)])],
  ];

  it.each(rejections)('rejects %s and leaves the ledger untouched', (_name, bad) => {
    const ledger = createLedger();
    post(ledger, entry([dr(ACC.Cash, 10), cr(ACC.ShareCapital, 10)], 0, 'seed'));
    const before = stableStringify(ledger);
    expect(() => post(ledger, bad)).toThrow(LedgerError);
    expect(stableStringify(ledger)).toBe(before);
  });

  it('rejects a day earlier than the last entry (append-only in time)', () => {
    const ledger = createLedger();
    post(ledger, entry([dr(ACC.Cash, 10), cr(ACC.ShareCapital, 10)], 5));
    expect(() => post(ledger, entry([dr(ACC.Cash, 10), cr(ACC.ShareCapital, 10)], 4))).toThrow(LedgerError);
    expect(() => post(ledger, entry([dr(ACC.Cash, 10), cr(ACC.ShareCapital, 10)], 5))).not.toThrow();
  });

  it('rejects an entry whose totals overflow the safe integer range', () => {
    const ledger = createLedger();
    const big = Number.MAX_SAFE_INTEGER;
    const bad = entry([
      dr(ACC.Cash, big),
      dr(ACC.Cash, big),
      cr(ACC.ShareCapital, big),
      cr(ACC.ShareCapital, big),
    ]);
    expect(() => post(ledger, bad)).toThrow();
    expect(ledger.entries).toHaveLength(0);
  });

  // Mã tài khoản trừ Cash/Overdraft để bút toán ngẫu nhiên không đụng ràng buộc không âm.
  const freeCodes = ACCOUNT_CODES.filter((c) => c !== ACC.Cash && c !== ACC.Overdraft);
  const pairArb = fc.record({
    debit: fc.constantFrom(...freeCodes),
    credit: fc.constantFrom(...freeCodes),
    amount: fc.integer({ min: 1, max: 1e9 }),
  });

  it('property: any balanced entry is accepted and the ledger stays balanced', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(pairArb, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 20 }),
        (entries) => {
          const ledger = createLedger();
          for (const pairs of entries) {
            post(ledger, entry(pairs.flatMap((p) => [dr(p.debit, p.amount), cr(p.credit, p.amount)])));
          }
          for (const e of ledger.entries) {
            const d = e.lines.reduce((s, l) => s + l.debit, 0);
            const c = e.lines.reduce((s, l) => s + l.credit, 0);
            expect(d).toBe(c);
            for (const l of e.lines)
              expect(Number.isSafeInteger(l.debit + l.credit) && l.debit + l.credit > 0).toBe(true);
          }
        },
      ),
    );
  });

  it('property: an unbalanced entry is always rejected and changes nothing', () => {
    fc.assert(
      fc.property(
        fc.array(pairArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 1, max: 1000 }),
        (pairs, skew) => {
          const ledger = createLedger();
          const lines = pairs.flatMap((p) => [dr(p.debit, p.amount), cr(p.credit, p.amount)]);
          lines.push(dr(ACC.Rent, skew));
          const before = stableStringify(ledger);
          expect(() => post(ledger, entry(lines))).toThrow(LedgerError);
          expect(stableStringify(ledger)).toBe(before);
        },
      ),
    );
  });
});
