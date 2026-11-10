import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { money, ZERO } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { financeDailySystem } from './finance';

const content = fixtureContent();

describe('financeDailySystem (economic-model §7.2)', () => {
  const base = produce(createGame(content), (d) => {
    // người chơi tiêu hết 25,000,000 và rút thêm 3,000,000 thấu chi, rồi bán được 1,000,000
    pay(d.ledger, {
      companyId: 'player',
      day: 0,
      memo: 'x',
      debits: [{ account: ACC.Rent, amount: money(28_000_000) }],
    });
    post(d.ledger, {
      day: 0,
      companyId: 'player',
      memo: 'sale',
      lines: [
        { account: ACC.Cash, debit: money(1_000_000), credit: ZERO },
        { account: ACC.Revenue, debit: ZERO, credit: money(1_000_000) },
      ],
    });
  });

  it('repays overdraft from cash at end of day and accumulates the closing overdraft balance', () => {
    const s = produce(base, (d) => financeDailySystem(d, ctxAt(base, content)));
    const b = currentBalances(s.ledger, 'player');
    expect(b[ACC.Cash]).toBe(0);
    expect(b[ACC.Overdraft]).toBe(2_000_000);
    expect(must(s.companies['player']).overdraft.dailyBalanceSum).toBe(2_000_000);
    const s2 = produce(s, (d) => financeDailySystem(d, ctxAt(s, content, 1)));
    expect(must(s2.companies['player']).overdraft.dailyBalanceSum).toBe(4_000_000);
  });

  it('does nothing for companies without overdraft', () => {
    const s = produce(base, (d) => financeDailySystem(d, ctxAt(base, content)));
    expect(must(s.companies['ai-1']).overdraft.dailyBalanceSum).toBe(0);
    expect(currentBalances(s.ledger, 'ai-1')[ACC.Cash]).toBe(48_000_000);
  });
});
