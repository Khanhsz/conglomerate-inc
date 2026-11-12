import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from '../engine';
import { policyMoraleTarget } from '../hr';
import { checkInvariants } from '../invariants';
import { money } from '../money';
import { storePnl } from '../selectors/finance';
import { hrView } from '../selectors/hr';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { untyped } from '../test-support/untyped';
import type { Command } from '../types/commands';
import { POLICY_LEVELS, type PolicyLevel } from '../types/content';
import type { GameState, HrPolicy } from '../types/state';

/** Thành phố gấp 3 dân số để cửa hàng người chơi có lãi đóng góp (cần cho thưởng). */
const content = fixtureContent((d) => {
  for (const district of d.scenario.cities.flatMap((c) => c.districts)) district.pop *= 3;
});
const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const P = 'player';
const STORE = 'store-000002';
const setup: Command[] = [
  { type: 'OpenStore', companyId: P, payload: { districtId: 'w' } },
  { type: 'LeaseOffice', companyId: P, payload: { districtId: 'w', size: 'small' } },
  { type: 'OpenDepartment', companyId: P, payload: { dept: 'hr' } },
];
const policy = (payload: Partial<HrPolicy>): Command => ({ type: 'SetHrPolicy', companyId: P, payload });
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
const store = (s: GameState) => must(s.stores[STORE]);
const base = play(createGame(content), setup);

describe('SetHrPolicy validation (economic-model §16)', () => {
  it('needs the HR department and values inside their bands', () => {
    const noHr = play(createGame(content), [
      { type: 'OpenStore', companyId: P, payload: { districtId: 'w' } },
    ]);
    expect(reason(noHr, policy({ trainingLevel: 1 }))).toMatch(/cần mở phòng Nhân sự/);
    expect(reason(base, policy({ wageRatio: 3.5 }))).toMatch(/lương chuẩn/);
    expect(reason(base, policy({ bonusRate: 0.25 }))).toMatch(/thưởng/);
    const bad: Command = untyped('{"type":"SetHrPolicy","companyId":"player","payload":{"trainingLevel":4}}');
    expect(reason(base, bad)).toMatch(/mức đào tạo/);
    expect(
      reason(base, policy({ wageRatio: null, trainingLevel: 3, benefitsLevel: 0, bonusRate: 0.2 })),
    ).toBeNull();
  });
});

describe('standard wage and overrides (§16.1)', () => {
  const s = play(base, [policy({ wageRatio: 1.2 })]);
  const standard = Math.round(220_000 * 1.2 * s.macro.priceIndex);

  it('applies to stores that are not overridden, now and after CPI at month start', () => {
    expect(
      Math.abs(store(s).wageMonthly - Math.round(220_000 * 1.2 * base.macro.priceIndex)),
    ).toBeLessThanOrEqual(1);
    const later = runDays(s, content, 31);
    // áp ở đầu ngày 30 (trước khi CPI hôm đó cập nhật): tăng theo CPI, lệch vài ngày lạm phát (< 0.05%)
    expect(store(later).wageMonthly).toBeGreaterThan(store(s).wageMonthly);
    expect(store(later).wageMonthly / (220_000 * 1.2 * later.macro.priceIndex)).toBeCloseTo(1, 3);
    expect(standard).toBeGreaterThan(0);
  });

  it('SetWage overrides a store; ClearOverride returns it to the standard wage', () => {
    const manual = play(s, [
      { type: 'SetWage', companyId: P, payload: { storeId: STORE, wageMonthly: money(300_000) } },
    ]);
    expect(store(manual).overrides.wage).toBe(true);
    const later = runDays(manual, content, 31);
    expect(store(later).wageMonthly).toBe(300_000);
    const back = play(later, [
      { type: 'ClearOverride', companyId: P, payload: { storeId: STORE, field: 'wage' } },
    ]);
    expect(store(back).overrides.wage).toBe(false);
    expect(store(back).wageMonthly / (220_000 * 1.2 * later.macro.priceIndex)).toBeCloseTo(1, 3);
  });
});

describe('training, benefits and bonus (§16.2–§16.4)', () => {
  const plain = runDays(base, content, 60);
  const rich = play(base, [policy({ trainingLevel: 3, benefitsLevel: 3, bonusRate: 0.2 })], 60);

  it('training speeds up skill; benefits lift morale', () => {
    expect(store(rich).skill).toBeGreaterThan(store(plain).skill);
    expect(store(rich).morale).toBeGreaterThan(store(plain).morale);
  });

  it('costs land in the store month and in Wages; stores + corporate still reconcile', () => {
    const lm = store(rich).lastMonth;
    expect(lm.training).toBeGreaterThan(0);
    expect(lm.benefits).toBeGreaterThan(0);
    // training ≈ staff × $100 × CPI; benefits ≈ staff × lương × 10%
    expect(lm.training / (store(rich).staff * 10_000)).toBeCloseTo(1, 1);
    expect(lm.benefits / (store(rich).staff * store(rich).wageMonthly * 0.1)).toBeCloseTo(1, 1);
    const pnl = must(storePnl(rich, P, 1));
    expect(pnl.corporate.wages).toBe(0);
    expect(checkInvariants(rich, content)).toEqual([]);
  });

  it('bonus = 20% of the positive contribution before bonus, and feeds next month morale', () => {
    const lm = store(rich).lastMonth;
    const before = lm.revenue - lm.cogs - lm.wages - lm.rent - lm.training - lm.benefits;
    expect(lm.bonus).toBe(before > 0 ? Math.round(before * 0.2) : 0);
    expect(store(rich).bonusPerHead).toBeCloseTo(lm.bonus / store(rich).staff, 9);
  });

  it('closing the HR department resets every policy to M1 defaults', () => {
    const closed = play(rich, [{ type: 'CloseDepartment', companyId: P, payload: { dept: 'hr' } }]);
    expect(must(closed.companies[P]).hrPolicy).toEqual({
      wageRatio: null,
      trainingLevel: 0,
      benefitsLevel: 0,
      bonusRate: 0,
    });
  });

  it('hrView lists the store and prices every level for the current staff', () => {
    const v = must(hrView(rich, content, P));
    expect(v.roster.map((r) => r.storeId)).toEqual([STORE]);
    expect(v.training.map((t) => t.level)).toEqual([0, 1, 2, 3]);
    expect(v.training[0]?.monthlyCost).toBe(0);
    expect(v.benefits[3]?.moraleBonus).toBe(0.12);
    expect(v.bonusByPercent).toHaveLength(21);
  });
});

describe('policy effects are monotone (property)', () => {
  it('a higher benefits level never lowers the morale target', () => {
    const params = content.industry.hrPolicies;
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(...POLICY_LEVELS),
        (sig, lvl) => {
          const at = (benefitsLevel: PolicyLevel) =>
            policyMoraleTarget(sig, params, {
              wageRatio: null,
              trainingLevel: 0,
              benefitsLevel,
              bonusRate: 0,
            });
          const next = Math.min(3, lvl + 1);
          const higher = POLICY_LEVELS.find((l) => l === next) ?? lvl;
          expect(at(higher)).toBeGreaterThanOrEqual(at(lvl));
          expect(at(lvl)).toBeGreaterThanOrEqual(0);
          expect(at(lvl)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
