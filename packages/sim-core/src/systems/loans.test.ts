import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, step, validateCommand } from '../engine';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { money } from '../money';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';
import { annuityPayment } from './loans';

const content = fixtureContent();

describe('annuityPayment (economic-model §7.1)', () => {
  it('= round(P·r / (1 − (1 + r)^−n)), r = rate / 12', () => {
    const r = 0.06 / 12;
    expect(annuityPayment(money(10_000_000), 0.06, 12)).toBe(
      Math.round((10_000_000 * r) / (1 - (1 + r) ** -12)),
    );
    expect(annuityPayment(money(10_000_000), 0.06, 12)).toBe(860_664); // 860,664.03
    expect(annuityPayment(money(1_200), 0, 12)).toBe(100);
  });
});

/** Một tháng đã chốt để có lịch sử; EBITDA của người chơi được đặt = `ebitda` để kiểm bậc spread. */
function withHistory(ebitda: number): GameState {
  const s = runDays(createGame(content), content, 30);
  const template = must(s.statements['ai-1']?.[0], 'ai-1 month 0 statements');
  return produce(s, (d) => {
    d.statements['player'] = [
      { ...template, companyId: 'player', pnl: { ...template.pnl, ebitda: money(ebitda) } },
    ];
  });
}

const take = (principal: number, termMonths = 12, companyId = 'player'): Command => ({
  type: 'TakeLoan',
  companyId,
  payload: { principal: money(principal), termMonths },
});

describe('TakeLoan', () => {
  it('needs at least one closed month of history', () => {
    const v = validateCommand(createGame(content), content, take(1_000_000));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/EBITDA/);
  });

  it('prices the spread by leverage = (debt + principal) / annualized EBITDA', () => {
    const s = withHistory(1_000_000); // EBITDA năm hóa = 12,000,000; người chơi chưa có nợ
    const rateFor = (principal: number) => {
      const out = step(enqueue(s, take(principal)), content);
      const ev = out.events.find((e) => e.kind === 'loanTaken');
      return ev?.kind === 'loanTaken' ? ev.annualRate : null;
    };
    expect(rateFor(6_000_000)).toBeCloseTo(0.04 + 0.02, 12); // leverage 0.5
    expect(rateFor(12_000_000)).toBeCloseTo(0.04 + 0.02, 12); // 1.0 (biên, ≤)
    expect(rateFor(18_000_000)).toBeCloseTo(0.04 + 0.035, 12); // 1.5
    expect(rateFor(30_000_000)).toBeCloseTo(0.04 + 0.05, 12); // 2.5
    const v = validateCommand(s, content, take(42_000_000)); // 3.5
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/leverage/);
  });

  it('rejects non-positive EBITDA, bad terms and bad principals', () => {
    expect(validateCommand(withHistory(0), content, take(1_000)).ok).toBe(false);
    const s = withHistory(1_000_000);
    expect(validateCommand(s, content, take(1_000_000, 18)).ok).toBe(false);
    expect(validateCommand(s, content, take(0)).ok).toBe(false);
  });

  it('books Dr Cash / Cr Loans and amortizes fully over the term', () => {
    const s0 = withHistory(1_000_000);
    const cash0 = currentBalances(s0.ledger, 'player')[ACC.Cash];
    const s1 = step(enqueue(s0, take(6_000_000)), content);
    const loan = must(s1.loans['loan-000001']);
    expect(loan).toMatchObject({
      companyId: 'player',
      principal: 6_000_000,
      outstanding: 6_000_000,
      termMonths: 12,
      paymentsMade: 0,
    });
    expect(loan.paymentMonthly).toBe(annuityPayment(money(6_000_000), 0.06, 12));
    expect(currentBalances(s1.ledger, 'player')[ACC.Cash]).toBe(cash0 + 6_000_000);
    expect(currentBalances(s1.ledger, 'player')[ACC.Loans]).toBe(6_000_000);

    // Vay ở tháng 1 → kỳ đầu ở chốt tháng 2 → kỳ 12 ở chốt tháng 13.
    const before = runDays(s1, content, 59 - 1); // tới hết ngày 59 (chốt tháng 1): chưa trả kỳ nào
    expect(must(before.loans['loan-000001']).paymentsMade).toBe(0);
    const after = runDays(s1, content, 30 * 14 - 31);
    const done = must(after.loans['loan-000001']);
    expect(done.paymentsMade).toBe(12);
    expect(done.outstanding).toBe(0);
    expect(currentBalances(after.ledger, 'player')[ACC.Loans]).toBe(0);
  }, 30_000);
});

describe('RepayLoan', () => {
  it('pays the outstanding principal plus a 1% fee booked as interest', () => {
    const s1 = step(enqueue(withHistory(1_000_000), take(6_000_000)), content);
    const interest0 = currentBalances(s1.ledger, 'player')[ACC.InterestExpense];
    const s2 = step(
      enqueue(s1, { type: 'RepayLoan', companyId: 'player', payload: { loanId: 'loan-000001' } }),
      content,
    );
    const b = currentBalances(s2.ledger, 'player');
    expect(b[ACC.Loans]).toBe(0);
    expect(b[ACC.InterestExpense] - interest0).toBe(60_000);
    expect(must(s2.loans['loan-000001']).outstanding).toBe(0);
    expect(s2.events.at(-1)).toMatchObject({
      kind: 'loanRepaid',
      loanId: 'loan-000001',
      principal: 6_000_000,
      fee: 60_000,
    });
  });

  it('rejects unknown, foreign or already repaid loans', () => {
    const s1 = step(enqueue(withHistory(1_000_000), take(6_000_000)), content);
    const repay = (loanId: string, companyId = 'player'): Command => ({
      type: 'RepayLoan',
      companyId,
      payload: { loanId },
    });
    expect(validateCommand(s1, content, repay('loan-000009')).ok).toBe(false);
    expect(validateCommand(s1, content, repay('loan-000001', 'ai-1')).ok).toBe(false);
    const s2 = step(enqueue(s1, repay('loan-000001')), content);
    expect(validateCommand(s2, content, repay('loan-000001')).ok).toBe(false);
  });
});
