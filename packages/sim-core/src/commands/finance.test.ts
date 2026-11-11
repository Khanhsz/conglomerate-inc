import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from '../engine';
import { checkInvariants } from '../invariants';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { money, type Money } from '../money';
import { dailyRate } from '../systems/macro';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { Department } from '../types/content';
import type { GameState } from '../types/state';

/** Thành phố gấp 3 dân số: AI `ai-1` có lãi, nên có lịch sử EBITDA dương để vay (như test lịch sử A3). */
const content = fixtureContent((d) => {
  for (const district of d.scenario.city.districts) district.pop *= 3;
});
const AI = 'ai-1';
const lease: Command = { type: 'LeaseOffice', companyId: AI, payload: { districtId: 'e', size: 'small' } };
const openDept = (dept: Department): Command => ({
  type: 'OpenDepartment',
  companyId: AI,
  payload: { dept },
});
const closeDept = (dept: Department): Command => ({
  type: 'CloseDepartment',
  companyId: AI,
  payload: { dept },
});
const takeLoan = (principal: number, termMonths = 24): Command => ({
  type: 'TakeLoan',
  companyId: AI,
  payload: { principal: money(principal), termMonths },
});
const refinance = (loanId: string, termMonths: number): Command => ({
  type: 'RefinanceLoan',
  companyId: AI,
  payload: { loanId, termMonths },
});
const creditLine = (limit: number): Command => ({
  type: 'SetCreditLine',
  companyId: AI,
  payload: { limit: money(limit) },
});

const play = (s: GameState, cmds: Command[], days = 1) =>
  runDays(
    cmds.reduce((acc, c) => enqueue(acc, c), s),
    content,
    days,
  );
const reason = (s: GameState, c: Command) => {
  const v = validateCommand(s, content, c);
  return v.ok ? null : v.reason;
};
const bal = (s: GameState) => currentBalances(s.ledger, AI);
const company = (s: GameState) => must(s.companies[AI]);
const rejected = (s: GameState) => s.events.filter((e) => e.kind === 'commandRejected' && e.companyId === AI);

// 2 tháng đã chốt, có văn phòng + phòng Tài chính.
const base = play(createGame(content), [lease, openDept('finance')], 60);

describe('RefinanceLoan (economic-model §19.1)', () => {
  const withLoan = play(base, [takeLoan(5_000_000, 24)]);
  const loanId = must(withLoan.loanIds.find((id) => withLoan.loans[id]?.companyId === AI));
  const old = must(withLoan.loans[loanId]);
  const after = play(withLoan, [refinance(loanId, 36)]);
  const fee = Math.round(old.outstanding * content.scenario.finance.earlyRepaymentFee);

  it('replaces the loan without touching cash: new principal = outstanding + 1% fee', () => {
    expect(rejected(after)).toEqual([]);
    expect(must(after.loans[loanId]).outstanding).toBe(0);
    const fresh = must(Object.values(after.loans).find((l) => l.companyId === AI && l.id !== loanId));
    expect(fresh.principal).toBe(old.outstanding + fee);
    expect(fresh.termMonths).toBe(36);
    const entry = must(after.ledger.entries.find((e) => e.memo.startsWith(`Tái cấp vốn ${loanId}`)));
    expect(entry.lines.some((l) => l.account === ACC.Cash)).toBe(false);
    expect(bal(after)[ACC.Loans] - bal(withLoan)[ACC.Loans]).toBe(fee);
    expect(checkInvariants(after, content)).toEqual([]);
  });

  it('needs the finance department and an outstanding loan of the company', () => {
    const closed = play(withLoan, [closeDept('finance')]);
    expect(reason(closed, refinance(loanId, 36))).toMatch(/cần mở phòng Tài chính/);
    expect(reason(after, refinance(loanId, 36))).toMatch(/đã trả hết/);
    expect(reason(withLoan, refinance('loan-999999', 36))).toMatch(/không tồn tại/);
    expect(reason(withLoan, refinance(loanId, 7))).toMatch(/kỳ hạn/);
  });
});

describe('SetCreditLine (economic-model §19.1)', () => {
  const revenue3m = (s: GameState) =>
    (s.statements[AI] ?? []).slice(-3).reduce((a, st) => a + st.pnl.revenue, 0);
  const max = Math.max(content.scenario.finance.overdraftFloor, Math.round(2 * revenue3m(base)));

  it('accepts up to 2 × revenue of the last 3 months and replaces the overdraft limit', () => {
    expect(reason(base, creditLine(max + 1))).toMatch(/hạn mức tối đa/);
    const s = play(base, [creditLine(max)]);
    expect(company(s).creditLine.limit).toBe(max);
    expect(company(s).overdraft.limit).toBe(max);
  });

  it('charges the commitment fee on the unused part and discounts overdraft interest', () => {
    const limit: Money = money(Math.min(max, 10_000_000));
    const s = play(base, [creditLine(limit)], 30); // ngày 60–89, chốt tháng 2
    const fee = must(s.ledger.entries.find((e) => e.companyId === AI && e.memo.includes('phí cam kết')));
    const expected = Math.round(
      limit * 30 * dailyRate(content.scenario.finance.creditLine.commitmentFeeAnnual),
    );
    // AI có lãi, không dùng thấu chi → phí trên toàn bộ hạn mức
    expect(fee.lines.find((l) => l.account === ACC.InterestExpense)?.debit).toBe(expected);
    expect(company(s).creditLine.commitmentFeeAccrued).toBe(0);
    expect(checkInvariants(s, content)).toEqual([]);
  });

  it('closing the finance department (or setting 0) returns to the default overdraft limit', () => {
    const s = play(base, [creditLine(max)]);
    const closed = play(s, [closeDept('finance')]);
    expect(company(closed).creditLine.limit).toBe(0);
    const floor = content.scenario.finance.overdraftFloor;
    expect(company(closed).overdraft.limit).toBe(Math.max(floor, revenue3m(closed)));
    const zero = play(s, [creditLine(0)]);
    expect(company(zero).overdraft.limit).toBe(Math.max(floor, revenue3m(zero)));
    expect(reason(closed, creditLine(max))).toMatch(/cần mở phòng Tài chính/);
  });
});
