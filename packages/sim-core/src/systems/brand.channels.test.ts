import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { money } from '../money';
import { ctxAt } from '../test-support/context';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { ChannelBudget, GameState } from '../types/state';
import { brandLift, brandSystem } from './brand';

// Fixture: quận [w, e], phân khúc theo id tăng dần [office, students] → ô [w·office, w·students, e·office, e·students].
// Kênh: social (city, students 1 / office 0.5, α 0.012, halfSat $80), flyers (district, students 1, α 0.015, halfSat $10).
const [W_OFFICE, W_STUDENTS, E_OFFICE, E_STUDENTS] = [0, 1, 2, 3];
const DELTA = 0.003;

const content = fixtureContent();
const base = createGame(content);
const runBrand = (s: GameState, c = content) => produce(s, (d) => brandSystem(d, ctxAt(s, c)));
const cells = (s: GameState, id = 'player') => must(s.companies[id]).awareness;
const cell = (s: GameState, i: number, id = 'player') => must(cells(s, id)[i]);
const contribution = (s: GameState, channel: string, id = 'player') =>
  must(s.companies[id]).channelAwareness.find((c) => c.channel === channel)?.cells;
const budget = (channel: string, target: string, monthly: number): ChannelBudget => ({
  channel,
  target,
  monthly: money(monthly),
});
const withBudgets = (s: GameState, general: number, channels: ChannelBudget[] = [], id = 'player') =>
  produce(s, (d) => {
    const c = must(d.companies[id]);
    c.marketingBudgetMonthly = money(general);
    c.channelBudgets = channels;
  });

describe('awareness by district and segment (economic-model §18)', () => {
  it('with only `general` every cell equals the M1 scalar recurrence, bit for bit', () => {
    // Tham chiếu: công thức §5 viết lại độc lập, một số duy nhất cho cả công ty.
    let s = withBudgets(base, 300_000);
    let a = 0.05;
    const lift = brandLift(0.01, 300_000 / 30, 10_000, 1);
    for (let day = 0; day < 200; day++) {
      const served = 100 + 7 * day;
      s = produce(s, (d) => {
        must(d.stores['store-000001']).companyId = 'player';
        must(d.stores['store-000001']).today.served = served;
      });
      s = runBrand(s);
      a = a + (1 - a) * lift - DELTA * a;
      a += (0.002 * served) / 22_000;
      a = Math.min(1, Math.max(0, a));
      expect(cells(s)).toEqual([a, a, a, a]);
    }
  });

  it('a district channel lifts only the cells of that district, by segment weight', () => {
    const plain = runBrand(base);
    const s = runBrand(withBudgets(base, 0, [budget('flyers', 'e', 30_000)])); // $10/ngày = halfSat
    const lift = 0.015 * (1 - Math.exp(-1)); // students: trọng số 1
    expect(cell(s, E_STUDENTS)).toBeCloseTo(0.05 + 0.95 * lift - DELTA * 0.05, 15);
    // office không có trọng số ở flyers; quận w không được chi
    for (const i of [W_OFFICE, W_STUDENTS, E_OFFICE]) expect(cell(s, i)).toBe(cell(plain, i));
  });

  it('a city channel reaches every district, scaled by segment weight', () => {
    const s = runBrand(withBudgets(base, 0, [budget('social', 'testville', 240_000)])); // $80/ngày = halfSat
    const full = 0.012 * (1 - Math.exp(-1));
    for (const i of [W_STUDENTS, E_STUDENTS]) {
      expect(cell(s, i)).toBeCloseTo(0.05 + 0.95 * full - DELTA * 0.05, 15);
    }
    for (const i of [W_OFFICE, E_OFFICE]) {
      expect(cell(s, i)).toBeCloseTo(0.05 + 0.95 * (0.5 * full) - DELTA * 0.05, 15);
    }
  });

  it('channels combine as lift = 1 − Π(1 − lift_ch), starting from `general`', () => {
    const s = runBrand(
      withBudgets(base, 300_000, [budget('flyers', 'w', 30_000), budget('social', 'testville', 240_000)]),
    );
    const g = 0.01 * (1 - Math.exp(-1));
    const f = 0.015 * (1 - Math.exp(-1));
    const so = 0.012 * (1 - Math.exp(-1));
    const combined = 1 - (1 - g) * (1 - f) * (1 - so);
    expect(cell(s, W_STUDENTS)).toBeCloseTo(0.05 + 0.95 * combined - DELTA * 0.05, 14);
    expect(cell(s, E_OFFICE)).toBeCloseTo(0.05 + 0.95 * (1 - (1 - g) * (1 - 0.5 * so)) - DELTA * 0.05, 14);
  });

  it('halfSaturation scales with the price index', () => {
    const inflated = produce(withBudgets(base, 0, [budget('flyers', 'e', 30_000)]), (d) => {
      d.macro.priceIndex = 2;
    });
    const lift = 0.015 * (1 - Math.exp(-0.5));
    expect(cell(runBrand(inflated), E_STUDENTS)).toBeCloseTo(0.05 + 0.95 * lift - DELTA * 0.05, 15);
  });

  it('a budget for a channel that left the content is ignored', () => {
    const s = runBrand(withBudgets(base, 0, [budget('radio', 'testville', 500_000)]));
    expect(cells(s)).toEqual(cells(runBrand(base)));
  });
});

describe('channel contributions (economic-model §18.3)', () => {
  it('no spending → no contribution entries', () => {
    expect(must(runBrand(base).companies['player']).channelAwareness).toEqual([]);
  });

  it('one day: the marketing gain is split between channels in proportion to their lift', () => {
    const s = runBrand(withBudgets(base, 300_000, [budget('flyers', 'e', 30_000)]));
    const g = 0.01 * (1 - Math.exp(-1));
    const f = 0.015 * (1 - Math.exp(-1));
    const gain = 0.95 * (1 - (1 - g) * (1 - f));
    expect(must(contribution(s, 'general'))[E_STUDENTS]).toBeCloseTo((gain * g) / (g + f), 15);
    expect(must(contribution(s, 'flyers'))[E_STUDENTS]).toBeCloseTo((gain * f) / (g + f), 15);
    // nơi chỉ có general: toàn bộ phần tăng thuộc về general
    expect(must(contribution(s, 'general'))[W_OFFICE]).toBeCloseTo(0.95 * g, 15);
    expect(must(contribution(s, 'flyers'))[W_OFFICE]).toBe(0);
    // `general` luôn đứng đầu danh sách
    expect(must(s.companies['player']).channelAwareness.map((c) => c.channel)).toEqual(['general', 'flyers']);
  });

  it('Σ contributions = awareness when nothing is organic (initial 0, no word of mouth)', () => {
    const c = fixtureContent((d) => {
      d.industry.brand.wordOfMouth = 0;
      d.industry.brand.initialAwareness = 0;
    });
    let s = withBudgets(createGame(c), 300_000, [
      budget('flyers', 'e', 60_000),
      budget('social', 'testville', 150_000),
    ]);
    for (let i = 0; i < 400; i++) s = runBrand(s, c);
    const company = must(s.companies['player']);
    company.awareness.forEach((a, i) => {
      let sum = 0;
      for (const ch of company.channelAwareness) sum += must(ch.cells[i]);
      expect(sum).toBeCloseTo(a, 12);
    });
  });

  it('after the budget stops the contribution decays by δ per day', () => {
    const spent = runBrand(withBudgets(base, 0, [budget('flyers', 'e', 30_000)]));
    const before = must(must(contribution(spent, 'flyers'))[E_STUDENTS]);
    const after = runBrand(withBudgets(spent, 0, []));
    expect(must(contribution(after, 'flyers'))[E_STUDENTS]).toBeCloseTo(before * (1 - DELTA), 15);
  });

  it('property: cells stay in [0, 1] and contributions never exceed awareness', () => {
    const amount = fc.integer({ min: 0, max: 100_000_000 });
    fc.assert(
      fc.property(
        amount,
        amount,
        amount,
        amount,
        fc.integer({ min: 0, max: 5_000 }),
        (g, fw, fe, so, served) => {
          let s = withBudgets(base, g, [
            budget('flyers', 'w', fw),
            budget('flyers', 'e', fe),
            budget('social', 'testville', so),
          ]);
          s = produce(s, (d) => {
            must(d.stores['store-000001']).companyId = 'player';
            must(d.stores['store-000001']).today.served = served;
          });
          for (let i = 0; i < 40; i++) s = runBrand(s);
          const company = must(s.companies['player']);
          company.awareness.forEach((a, i) => {
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
            let sum = 0;
            for (const ch of company.channelAwareness) {
              expect(must(ch.cells[i])).toBeGreaterThanOrEqual(0);
              sum += must(ch.cells[i]);
            }
            expect(sum).toBeLessThanOrEqual(a + 1e-9);
          });
        },
      ),
      { numRuns: 40 },
    );
  });
});
