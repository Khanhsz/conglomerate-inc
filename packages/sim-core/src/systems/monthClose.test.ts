import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { checkInvariants } from '../invariants';
import { ACC, ACCOUNTS } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { checkStatements } from '../ledger/statements';
import { money, ZERO } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';
import { dailyRate } from './macro';
import { depreciationForMonth, monthCloseSystem, settleQuarterTax } from './monthClose';

const content = fixtureContent();
const month0 = runDays(createGame(content), content, 30);
const closeEntries = (s: GameState, companyId: string, day: number) =>
  s.ledger.entries.filter(
    (e) => e.companyId === companyId && e.day === day && e.memo.startsWith('Chốt tháng'),
  );
const linesOf = (s: GameState, companyId: string, day: number) =>
  closeEntries(s, companyId, day).map((e) =>
    e.lines.filter((l) => l.debit > 0).map((l) => [ACCOUNTS[l.account].name, l.debit]),
  );

describe('month close entries (economic-model §6, §10)', () => {
  it('M1 operating costs, M2 depreciation, M5 tax for the AI store (fixture, month 0)', () => {
    const priceIndexAtClose = (1 + dailyRate(0.03)) ** 29;
    const pnl = must(month0.statements['ai-1']?.[0]).pnl;
    expect(linesOf(month0, 'ai-1', 29)).toEqual([
      [
        ['Wages', 1_155_000], // 30 ngày × 5 × 231,000 / 30
        ['Rent', 700_000], // 30 × 700,000 / 30 (= 699,999.99… → làm tròn)
        ['Admin', Math.round(300_000 * priceIndexAtClose * 1 ** 1.2)],
      ],
      [['Depreciation', 200_000]], // floor(12,000,000 / 60)
      ...(pnl.preTax > 0 ? [[['IncomeTax', Math.round(0.2 * pnl.preTax)]]] : []),
    ]);
  });

  it('stores MonthlyStatements for every company, consistent with the ledger', () => {
    for (const id of month0.companyIds) {
      const list = must(month0.statements[id]);
      expect(list).toHaveLength(1);
      expect(list[0]?.month).toBe(0);
      expect(checkStatements(must(list[0]))).toEqual([]);
    }
    expect(must(month0.statements['player']?.[0]).pnl.admin).toBe(0); // không có cửa hàng → không có overhead
  });

  it('rolls store month-to-date into lastMonth and resets accruals', () => {
    const st = must(month0.stores['store-000001']);
    const pnl = must(month0.statements['ai-1']?.[0]).pnl;
    expect(st.lastMonth).toMatchObject({
      revenue: pnl.revenue,
      cogs: pnl.cogs,
      wages: 1_155_000,
      rent: 700_000,
      days: 30,
    });
    expect(st.lastMonth.served).toBeLessThanOrEqual(st.lastMonth.capacity);
    expect(st.lastMonth.served).toBeLessThanOrEqual(st.lastMonth.demand);
    expect(st.lastMonth.capacity).toBeGreaterThanOrEqual(30 * 450); // 5 × 90 × productivity; lương 1.05× nên morale > 0.5
    expect(st.mtd).toEqual({
      demand: 0,
      served: 0,
      capacity: 0,
      days: 0,
      revenue: 0,
      cogs: 0,
      wagesAccrued: 0,
      rentAccrued: 0,
    });
    const contribution = pnl.revenue - pnl.cogs - 1_155_000 - 700_000;
    expect(st.negContributionMonths).toBe(contribution < 0 ? 1 : 0);
    expect(st.accumDep).toBe(200_000);
    expect(must(month0.companies['ai-1']).marketingAccrued).toBe(0);
  });

  it('recomputes the overdraft limit = max(floor, revenue of the last 3 months)', () => {
    const revenue = must(month0.statements['ai-1']?.[0]).pnl.revenue;
    expect(must(month0.companies['ai-1']).overdraft.limit).toBe(Math.max(2_000_000, revenue));
    expect(must(month0.companies['player']).overdraft.limit).toBe(2_000_000);
  });

  it('includes wages and rent of a store closed mid-month', () => {
    const open: Command = { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } };
    const close: Command = { type: 'CloseStore', companyId: 'player', payload: { storeId: 'store-000002' } };
    let s = runDays(enqueue(createGame(content), open), content, 10); // mở ngày 0, hoạt động ngày 0–9
    s = runDays(enqueue(s, close), content, 20); // đóng đầu ngày 10
    const m1 = linesOf(s, 'player', 29)[0];
    expect(m1).toContainEqual(['Wages', Math.round((10 * 4 * 220_000) / 30)]);
    expect(m1).toContainEqual(['Rent', Math.round((10 * 500_000) / 30)]);
  });

  it('charges overdraft interest = round(dailyRate(policy + spread) × Σ daily balances)', () => {
    const s0 = produce(month0, (d) => {
      pay(d.ledger, {
        companyId: 'player',
        day: 30,
        memo: 'x',
        debits: [{ account: ACC.Rent, amount: money(27_000_000) }],
      });
      must(d.companies['player']).overdraft.dailyBalanceSum = money(60_000_000);
      d.clock.day = 60;
    });
    const s = produce(s0, (d) => monthCloseSystem(d, ctxAt(s0, content, 59)));
    const interest = currentBalances(s.ledger, 'player')[ACC.InterestExpense];
    expect(interest).toBe(Math.round(dailyRate(0.04 + 0.08) * 60_000_000));
    expect(must(s.companies['player']).overdraft.dailyBalanceSum).toBe(0);
  });

  it('settles TaxPayable at quarter end: pays a positive balance, refunds a negative one', () => {
    const s0 = produce(month0, (d) => {
      post(d.ledger, {
        day: 30,
        companyId: 'player',
        memo: 'tax reversal',
        lines: [
          { account: ACC.TaxPayable, debit: money(5_000), credit: ZERO },
          { account: ACC.IncomeTax, debit: ZERO, credit: money(5_000) },
        ],
      });
      settleQuarterTax(d.ledger, 'player', 30);
    });
    const b = currentBalances(s0.ledger, 'player');
    expect(b[ACC.TaxPayable]).toBe(0);
    expect(b[ACC.Cash]).toBe(25_000_000 + 5_000);
    const q = runDays(createGame(content), content, 90);
    expect(currentBalances(q.ledger, 'ai-1')[ACC.TaxPayable]).toBe(0);
  }, 20_000);
});

describe('tax reversal at month close (economic-model §6.2)', () => {
  it('a loss month after a profitable month reverses the tax: Dr TaxPayable / Cr IncomeTax', () => {
    // Fixture gốc quá nhỏ để AI có lãi; dân số × 3 thì cửa hàng chạy hết công suất và có lãi ở tháng 0.
    const big = fixtureContent((d) => {
      for (const district of d.scenario.city.districts) district.pop *= 3;
    });
    const m0 = runDays(createGame(big), big, 30);
    const tax0 = must(m0.statements['ai-1']?.[0]).pnl.incomeTax;
    expect(tax0).toBeGreaterThan(0);
    // Lỗ lớn ở tháng 1: đóng cửa hàng → lỗ thanh lý ≈ 12M (AI không ghi đè được lệnh này như marketing/lương).
    const spend: Command = { type: 'CloseStore', companyId: 'ai-1', payload: { storeId: 'store-000001' } };
    const s = runDays(enqueue(m0, spend), big, 30);
    const m1 = must(s.statements['ai-1']?.[1]);
    expect(m1.pnl.preTax).toBeLessThan(-must(m0.statements['ai-1']?.[0]).pnl.preTax); // lỗ YTD
    expect(m1.pnl.incomeTax).toBe(-tax0);
    expect(currentBalances(s.ledger, 'ai-1')[ACC.TaxPayable]).toBe(0);
    expect(must(s.companies['ai-1']).tax.taxBookedYTD).toBe(0);
  });
});

describe('tax refund while in overdraft (review: economist #1)', () => {
  /** Người chơi tiêu hết tiền và rút 2,000,000 thấu chi, rồi có `reversal` thuế hoàn nhập (TaxPayable âm). */
  const setup = (reversal: number) =>
    produce(month0, (d) => {
      pay(d.ledger, {
        companyId: 'player',
        day: 30,
        memo: 'x',
        debits: [{ account: ACC.Rent, amount: money(27_000_000) }],
      });
      post(d.ledger, {
        day: 30,
        companyId: 'player',
        memo: 'tax reversal',
        lines: [
          { account: ACC.TaxPayable, debit: money(reversal), credit: ZERO },
          { account: ACC.IncomeTax, debit: ZERO, credit: money(reversal) },
        ],
      });
      settleQuarterTax(d.ledger, 'player', 30);
    });

  it('repays the overdraft first, so distress is not judged on a gross overdraft', () => {
    const b = currentBalances(setup(500_000).ledger, 'player');
    expect(b[ACC.Overdraft]).toBe(1_500_000);
    expect(b[ACC.Cash]).toBe(0);
    expect(b[ACC.TaxPayable]).toBe(0);
  });

  it('puts only the remainder into cash when the refund exceeds the overdraft', () => {
    const b = currentBalances(setup(3_000_000).ledger, 'player');
    expect(b[ACC.Overdraft]).toBe(0);
    expect(b[ACC.Cash]).toBe(1_000_000);
  });
});

describe('depreciationForMonth (economic-model §6)', () => {
  it('floor(capex / life) per month, remainder in the last month, then stops', () => {
    const capex = money(12_000_007);
    let acc = 0;
    const amounts: number[] = [];
    for (let n = 1; n <= 62; n++) {
      const d = depreciationForMonth(capex, money(acc), n, 60);
      amounts.push(d);
      acc += d;
    }
    expect(amounts[0]).toBe(200_000);
    expect(amounts[58]).toBe(200_000);
    expect(amounts[59]).toBe(200_007);
    expect(amounts.slice(60)).toEqual([0, 0]);
    expect(acc).toBe(12_000_007);
  });
});

describe('cash warning (economic-model §8)', () => {
  it('warns when the 13-week net cash forecast turns negative, before any distress', () => {
    const burn: Command = {
      type: 'SetMarketingBudget',
      companyId: 'player',
      payload: { monthly: money(5_000_000) },
    };
    const s = runDays(enqueue(createGame(content), burn), content, 120);
    const mine = s.events.filter((e) => e.companyId === 'player');
    const warning = mine.find((e) => e.kind === 'cashWarning');
    expect(warning).toBeDefined();
    // Tiền 25M, đốt 5M/tháng: sau chốt tháng 0 còn 20M ≥ 3.03 × 5M = 15.17M (chưa cảnh báo);
    // sau chốt tháng 1 còn 15M < 15.17M → cảnh báo ở ngày 59.
    expect(warning?.day).toBe(59);
    expect(mine.some((e) => e.kind === 'distress')).toBe(false);
  }, 20_000);
});

describe('deliberate bankruptcy (economic-model §8)', () => {
  // Giá thấp nhất (0.3 × Pref), lương cao nhất (3 × thị trường), 40 nhân viên: lương 26.4M/tháng.
  const plan: Command[] = [
    { type: 'OpenStore', companyId: 'player', payload: { districtId: 'e' } },
    { type: 'SetPrice', companyId: 'player', payload: { storeId: 'all', price: money(105) } },
    { type: 'SetWage', companyId: 'player', payload: { storeId: 'all', wageMonthly: money(660_000) } },
    { type: 'SetStaff', companyId: 'player', payload: { storeId: 'store-000002', staff: 40 } },
  ];
  const start = plan.reduce((s, c) => enqueue(s, c), createGame(content));
  const end = runDays(start, content, 30 * 8);
  const events = end.events.filter((e) => e.companyId === 'player');

  it('goes bankrupt within 8 months after a distress month', () => {
    const distress = events.find((e) => e.kind === 'distress');
    const bankrupt = events.find((e) => e.kind === 'bankrupt');
    expect(distress).toBeDefined();
    expect(bankrupt).toBeDefined();
    expect(must(bankrupt).day).toBeLessThanOrEqual(30 * 8 - 1);
    expect(must(bankrupt).day).toBeGreaterThan(must(distress).day);
    expect(must(end.companies['player']).status).toBe('bankrupt');
  });

  it('explains the cause: top 3 expenses (wages first) and a negative cash forecast', () => {
    const bankrupt = events.find((e) => e.kind === 'bankrupt');
    if (bankrupt?.kind !== 'bankrupt') throw new Error('no bankrupt event');
    expect(bankrupt.topExpenses).toHaveLength(3);
    expect(bankrupt.topExpenses[0]?.label).toBe('Wages');
    expect(bankrupt.cashForecast3m).toBeLessThan(0);
    expect(bankrupt.overdraft).toBeGreaterThan(bankrupt.overdraftLimit);
  });

  it('liquidates the stores without lease fees and freezes the company', () => {
    const store = must(end.stores['store-000002']);
    expect(store.status).toBe('closed');
    expect(currentBalances(end.ledger, 'player')[ACC.PPE]).toBe(0);
    expect(checkInvariants(end, content)).toEqual([]);
    const later = runDays(end, content, 60);
    expect(later.ledger.entries.filter((e) => e.companyId === 'player')).toHaveLength(
      end.ledger.entries.filter((e) => e.companyId === 'player').length,
    );
    expect(later.statements['player']).toHaveLength(must(end.statements['player']).length);
  });
});

describe('bankruptcy of an earlier company in companyIds order', () => {
  it('liquidates after every company has closed, keeping the ledger in day order', () => {
    // Đổi id người chơi thành 'a-player' để nó đứng trước 'ai-1': trước đây thanh lý của nó ghi ngày đầu tháng mới
    // rồi chốt tháng của ai-1 ghi ngày cuối tháng → sổ lùi ngày.
    const early = fixtureContent((d) => {
      must(d.scenario.companies[0]).id = 'a-player';
    });
    const plan: Command[] = [
      { type: 'OpenStore', companyId: 'a-player', payload: { districtId: 'e' } },
      { type: 'SetPrice', companyId: 'a-player', payload: { storeId: 'all', price: money(105) } },
      { type: 'SetWage', companyId: 'a-player', payload: { storeId: 'all', wageMonthly: money(660_000) } },
      { type: 'SetStaff', companyId: 'a-player', payload: { storeId: 'store-000002', staff: 40 } },
    ];
    const s = runDays(
      plan.reduce((acc, c) => enqueue(acc, c), createGame(early)),
      early,
      30 * 4,
    );
    expect(s.companyIds[0]).toBe('a-player');
    expect(must(s.companies['a-player']).status).toBe('bankrupt');
    expect(checkInvariants(s, early)).toEqual([]);
  });
});

describe('depreciationForMonth (property)', () => {
  it('for any capex and useful life, depreciation sums exactly to capex and then stops', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 120 }),
        (capex, life) => {
          let acc = 0;
          for (let n = 1; n <= life + 3; n++) {
            const d = depreciationForMonth(money(capex), money(acc), n, life);
            expect(d).toBeGreaterThanOrEqual(0);
            if (n > life) expect(d).toBe(0);
            acc += d;
          }
          expect(acc).toBe(capex);
        },
      ),
      { numRuns: Number(process.env['FC_RUNS'] ?? 100) },
    );
  });
});
