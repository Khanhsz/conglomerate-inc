import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, step } from './engine';
import { checkInvariants, hashState } from './invariants';
import { ACC } from './ledger/accounts';
import { currentBalances } from './ledger/balances';
import { money } from './money';
import { fixtureContent } from './test-support/fixture';
import { must } from './test-support/must';
import type { Command } from './types/commands';
import type { GameState } from './types/state';

const content = fixtureContent();
const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const withoutEvents = (s: GameState): string => hashState({ ...s, events: [], eventSeq: 0 });

describe('createGame', () => {
  const s = createGame(content);

  it('creates companies (sorted ids), contributes capital through the ledger and opens AI stores', () => {
    expect(s.companyIds).toEqual(['ai-1', 'player']);
    expect(s.storeIds).toEqual(['store-000001']);
    expect(s.clock.day).toBe(0);
    expect(s.seed).toBe(7);
    expect(s.contentRef).toEqual({
      industryId: 'coffee',
      scenarioId: 'fixture',
      contentVersion: content.contentVersion,
    });
    expect(currentBalances(s.ledger, 'player')[ACC.Cash]).toBe(25_000_000);
    expect(currentBalances(s.ledger, 'player')[ACC.ShareCapital]).toBe(25_000_000);
    expect(currentBalances(s.ledger, 'ai-1')[ACC.Cash]).toBe(60_000_000 - 12_000_000);
    expect(currentBalances(s.ledger, 'ai-1')[ACC.PPE]).toBe(12_000_000);
  });

  it('initial companies: player standard tier, AI tier from personality, marketing 0, overdraft floor', () => {
    const player = must(s.companies['player']);
    const ai = must(s.companies['ai-1']);
    expect(player.kind).toBe('player');
    expect('personality' in player).toBe(false);
    expect(player.qualityTier).toBe('standard');
    expect(ai.kind === 'ai' && ai.personality).toBe('balanced');
    expect(ai.qualityTier).toBe('standard');
    for (const c of [player, ai]) {
      expect(c.status).toBe('active');
      expect(c.brandAwareness).toBe(0.05);
      expect(c.marketingBudgetMonthly).toBe(0);
      expect(c.overdraft.limit).toBe(2_000_000);
    }
  });

  it('AI initial store uses the same command path: target price, personality wage, aiInitialStaff', () => {
    const st = must(s.stores['store-000001']);
    expect(st).toMatchObject({
      companyId: 'ai-1',
      districtId: 'e',
      status: 'open',
      price: 350, // 90 × 1.0 × 3.9 = 351 → làm tròn 5 cent
      wageMonthly: 231_000, // 1.05 × 220,000
      staff: 5,
      skill: 0.4,
      capex: 12_000_000,
    });
    expect(s.events.map((e) => e.kind)).toEqual(['storeOpened']);
  });

  it('opts.seed overrides the scenario seed', () => {
    expect(createGame(content, { seed: 99 }).seed).toBe(99);
  });

  it('is frozen and passes checkInvariants', () => {
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.ledger.entries)).toBe(true);
    expect(checkInvariants(s, content)).toEqual([]);
  });

  it('throws when the scenario asks for an invalid initial store', () => {
    const bad = fixtureContent((d) => {
      must(d.scenario.companies[1]).startingCash = money(1_000);
    });
    expect(() => createGame(bad)).toThrow(/ai-1/);
  });
});

describe('step / enqueue (spec §4)', () => {
  const s0 = createGame(content);
  const open: Command = { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } };

  it('enqueue only queues; the command applies at the start of the next tick', () => {
    const q = enqueue(s0, open);
    expect(q.storeIds).toHaveLength(1);
    expect(q.commandQueue).toEqual([{ enqueuedDay: 0, command: open }]);
    const s1 = step(q, content);
    expect(s1.storeIds).toHaveLength(2);
    expect(s1.commandQueue).toEqual([]);
    expect(s1.clock.day).toBe(1);
  });

  it('commands in one tick apply in order and see earlier effects', () => {
    const setAll: Command = {
      type: 'SetPrice',
      companyId: 'player',
      payload: { storeId: 'all', price: money(500) },
    };
    const s1 = step(enqueue(enqueue(s0, open), setAll), content);
    expect(must(s1.stores['store-000002']).price).toBe(500);
  });

  it('writes realized demand for open stores every day', () => {
    const s1 = step(s0, content);
    expect(must(s1.stores['store-000001']).today.demand).toBeGreaterThan(0);
  });

  it('does not mutate its input', () => {
    const before = hashState(s0);
    step(enqueue(s0, open), content);
    expect(hashState(s0)).toBe(before);
  });

  it('refuses content with a different contentVersion', () => {
    const other = fixtureContent((d) => {
      d.industry.unitCost = money(91);
    });
    expect(() => step(s0, other)).toThrow(/contentVersion/);
  });

  it('runDays calls onMonth after each month close', () => {
    const seen: number[] = [];
    const s = runDays(s0, content, 65, (m) => seen.push(m.clock.day));
    expect(s.clock.day).toBe(65);
    expect(seen).toEqual([30, 60]);
  });
});

// Kịch bản lệnh cố định để kiểm determinism.
const script: Record<number, Command[]> = {
  2: [{ type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } }],
  40: [{ type: 'SetPrice', companyId: 'player', payload: { storeId: 'all', price: money(420) } }],
  100: [{ type: 'SetStaff', companyId: 'player', payload: { storeId: 'store-000002', staff: 7 } }],
  150: [{ type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(300_000) } }],
  200: [{ type: 'CloseStore', companyId: 'player', payload: { storeId: 'store-000002' } }],
  201: [{ type: 'OpenStore', companyId: 'player', payload: { districtId: 'e' } }],
};

function play(
  seed: number,
  days: number,
  plan: Record<number, Command[]>,
  everyDay?: (s: GameState) => void,
): GameState {
  let s = createGame(content, { seed });
  for (let day = 0; day < days; day++) {
    for (const cmd of plan[day] ?? []) s = enqueue(s, cmd);
    s = step(s, content);
    everyDay?.(s);
  }
  return s;
}

describe('determinism (economic-model §13.8)', () => {
  it('2 years, same seed and commands → identical hashState; another seed → different', () => {
    // Spec §8: 2 năm, seed 42.
    const a = play(42, 720, script);
    const b = play(42, 720, script);
    const c = play(43, 720, script);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(c));
    expect(a.storeIds.filter((id) => a.stores[id]?.companyId === 'player')).toHaveLength(2);
  });
});

const badCommandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.integer({ min: 1, max: 104 }).map((p): Command => ({
    type: 'SetPrice',
    companyId: 'player',
    payload: { storeId: 'all', price: money(p) },
  })),
  fc.integer({ min: 41, max: 500 }).map((n): Command => ({
    type: 'SetStaff',
    companyId: 'ai-1',
    payload: { storeId: 'store-000001', staff: n },
  })),
  fc.integer({ min: 3, max: 999 }).map((n): Command => ({
    type: 'CloseStore',
    companyId: 'player',
    payload: { storeId: `store-${String(n).padStart(6, '0')}` },
  })),
  fc
    .string()
    .filter((d) => d !== 'w' && d !== 'e')
    .map((d): Command => ({ type: 'OpenStore', companyId: 'player', payload: { districtId: d } })),
  fc.integer({ min: 100_000_001, max: 2e9 }).map((m): Command => ({
    type: 'SetMarketingBudget',
    companyId: 'player',
    payload: { monthly: money(m) },
  })),
  fc.integer({ min: 0, max: 109_999 }).map((w): Command => ({
    type: 'SetWage',
    companyId: 'ai-1',
    payload: { storeId: 'all', wageMonthly: money(w) },
  })),
  fc
    .constantFrom('ghost', '')
    .map((id): Command => ({ type: 'SetQualityTier', companyId: id, payload: { tier: 'premium' } })),
);

describe('rejected commands (spec §3)', () => {
  it('property: a rejected command changes nothing but appends one commandRejected event', () => {
    const base = play(42, 5, script);
    const next = step(base, content);
    fc.assert(
      fc.property(badCommandArb, (bad) => {
        const out = step(enqueue(base, bad), content);
        expect(withoutEvents(out)).toBe(withoutEvents(next));
        expect(out.events).toHaveLength(next.events.length + 1);
        expect(out.eventSeq).toBe(next.eventSeq + 1);
        const last = out.events[out.events.length - 1];
        expect(last).toMatchObject({
          kind: 'commandRejected',
          day: 5,
          commandType: bad.type,
          companyId: bad.companyId,
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('a valid command does change the state', () => {
    const base = play(42, 5, script);
    const ok: Command = {
      type: 'SetPrice',
      companyId: 'player',
      payload: { storeId: 'all', price: money(400) },
    };
    expect(withoutEvents(step(enqueue(base, ok), content))).not.toBe(withoutEvents(step(base, content)));
  });
});

const anyCommandArb: fc.Arbitrary<Command> = fc.oneof(
  fc
    .record({
      companyId: fc.constantFrom('player', 'ai-1'),
      principal: fc.integer({ min: 100_000, max: 20_000_000 }),
      term: fc.constantFrom(12, 24, 36, 60),
    })
    .map(({ companyId, principal, term }): Command => ({
      type: 'TakeLoan',
      companyId,
      payload: { principal: money(principal), termMonths: term },
    })),
  fc.integer({ min: 1, max: 3 }).map((n): Command => ({
    type: 'RepayLoan',
    companyId: n === 1 ? 'player' : 'ai-1',
    payload: { loanId: `loan-00000${n}` },
  })),
  fc
    .constantFrom('w', 'e')
    .map((d): Command => ({ type: 'OpenStore', companyId: 'player', payload: { districtId: d } })),
  fc.integer({ min: 1, max: 6 }).map((n): Command => ({
    type: 'CloseStore',
    companyId: 'player',
    payload: { storeId: `store-00000${n}` },
  })),
  fc.integer({ min: 110, max: 1700 }).map((p): Command => ({
    type: 'SetPrice',
    companyId: 'player',
    payload: { storeId: 'all', price: money(p) },
  })),
  fc
    .record({ n: fc.integer({ min: 1, max: 6 }), staff: fc.integer({ min: 2, max: 40 }) })
    .map(({ n, staff }): Command => ({
      type: 'SetStaff',
      companyId: 'player',
      payload: { storeId: `store-00000${n}`, staff },
    })),
  fc.integer({ min: 115_000, max: 650_000 }).map((w): Command => ({
    type: 'SetWage',
    companyId: 'player',
    payload: { storeId: 'all', wageMonthly: money(w) },
  })),
  fc.integer({ min: 0, max: 5_000_000 }).map((m): Command => ({
    type: 'SetMarketingBudget',
    companyId: 'player',
    payload: { monthly: money(m) },
  })),
  fc
    .constantFrom('basic', 'standard', 'premium')
    .map((tier): Command => ({ type: 'SetQualityTier', companyId: 'player', payload: { tier } })),
);

describe('checkInvariants', () => {
  // Kiểm mỗi ngày trong 35 ngày đầu (lệnh ngày đầu + một lần chốt tháng), sau đó mỗi lần chốt tháng:
  // checkInvariants quét lại toàn bộ state nên kiểm mọi ngày của 360 ngày quá chậm khi FC_RUNS lớn.
  it('property: holds through a 360-day game with random commands', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 359 }), anyCommandArb), { maxLength: 40 }),
        (cmds) => {
          const plan: Record<number, Command[]> = {};
          for (const [day, cmd] of cmds) (plan[day] ??= []).push(cmd);
          play(42, 360, plan, (s) => {
            if (s.clock.day <= 35 || s.clock.day % 30 === 0) expect(checkInvariants(s, content)).toEqual([]);
          });
        },
      ),
      { numRuns: Math.max(5, Math.floor(RUNS / 20)) },
    );
  }, 120_000);

  const s = play(42, 3, script);
  const codes = (bad: GameState) => checkInvariants(bad, content).map((v) => v.code);

  it('flags out-of-range store and company values', () => {
    expect(codes(produce(s, (d) => void (must(d.stores['store-000001']).morale = 2)))).toContain('range');
    expect(
      codes(produce(s, (d) => void (must(d.companies['player']).brandAwareness = Number.NaN))),
    ).toContain('finite');
  });

  it('flags unbalanced or tampered ledgers', () => {
    expect(
      codes(
        produce(s, (d) => {
          d.ledger.entries.push({
            id: 999,
            day: 3,
            companyId: 'player',
            memo: 'bypass post()',
            lines: [
              { account: ACC.Cash, debit: money(5), credit: money(0) },
              { account: ACC.Revenue, debit: money(0), credit: money(4) },
            ],
          });
        }),
      ),
    ).toContain('ledger');
    expect(
      codes(
        produce(s, (d) => {
          must(d.ledger.balances['player'])[ACC.Cash] = money(-1);
        }),
      ),
    ).toContain('ledger');
  });

  it('flags unsorted or inconsistent id lists', () => {
    expect(codes(produce(s, (d) => void d.storeIds.reverse()))).toContain('ids');
    expect(codes(produce(s, (d) => void d.companyIds.pop()))).toContain('ids');
  });

  it('flags a content mismatch', () => {
    const other = fixtureContent((d) => {
      d.industry.unitCost = money(91);
    });
    expect(checkInvariants(s, other).map((v) => v.code)).toContain('content');
  });
});
