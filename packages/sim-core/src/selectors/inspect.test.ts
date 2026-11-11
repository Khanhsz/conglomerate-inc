import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { hashState } from '../invariants';
import { money } from '../money';
import { expectedDemand, storeUtility, utilityParts } from '../systems/demand';
import { moraleTarget } from '../systems/operations';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { GameState } from '../types/state';
import { inspectStore, priceCurve, whatIf } from './inspect';

const content = fixtureContent();
const RUNS = Number(process.env['FC_RUNS'] ?? 100);
/** Người chơi mở cửa hàng ở e (cạnh tranh trực tiếp với ai-1) và ở w; chạy 5 ngày. */
const game: GameState = runDays(
  [
    { type: 'OpenStore' as const, companyId: 'player', payload: { districtId: 'e' } },
    { type: 'OpenStore' as const, companyId: 'player', payload: { districtId: 'w' } },
  ].reduce((s, c) => enqueue(s, c), createGame(content)),
  content,
  5,
);
const PLAYER_E = 'store-000002';

describe('utilityParts', () => {
  it('property: the parts add up to storeUtility', () => {
    const seg = must(content.industry.segments['office']);
    const x01 = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(
        x01,
        fc.double({ min: 50, max: 3000, noNaN: true }),
        x01,
        fc.double({ min: 0.5, max: 6, noNaN: true }),
        x01,
        (q, p, a, d, w) => {
          const x = { quality: q, price: p, refPrice: 350, awareness: a, distanceKm: d, serviceLevel: w };
          const parts = utilityParts(seg, 1, x);
          expect(parts.quality + parts.price + parts.brand + parts.distance + parts.service).toBeCloseTo(
            parts.total,
            12,
          );
          expect(parts.total).toBeCloseTo(storeUtility(seg, 1, x), 12);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('inspectStore (why is demand what it is)', () => {
  const report = inspectStore(game, content, PLAYER_E);
  const expected = must(expectedDemand(game, content).byStore[PLAYER_E]);

  it('splits expected demand by segment and by origin district, summing exactly', () => {
    expect(report.expectedDemand).toBeCloseTo(expected, 9);
    expect(report.bySegment.reduce((a, s) => a + s.demand, 0)).toBeCloseTo(expected, 9);
    expect(report.byOrigin.reduce((a, o) => a + o.demand, 0)).toBeCloseTo(expected, 9);
    expect(report.bySegment.map((s) => s.segmentId).sort()).toEqual(['office', 'students']);
    for (const s of report.bySegment) {
      expect(s.share).toBeGreaterThanOrEqual(0);
      expect(s.share).toBeLessThanOrEqual(1);
    }
  });

  it('lists the rival that shares the most customers', () => {
    expect(report.rivals[0]).toMatchObject({ storeId: 'store-000001', companyId: 'ai-1', districtId: 'e' });
    expect(report.rivals[0]?.overlap).toBeGreaterThan(0);
    expect(report.rivals.every((r) => r.companyId !== 'player')).toBe(true);
  });

  it('compares utility with the strongest rival in the busiest cell and prices each gap in customers', () => {
    const focus = must(report.focus);
    expect(focus.rival?.storeId).toBe('store-000001');
    // AI chất lượng như nhau (standard), cùng quận; người chơi giá 350 vs AI 350 → khác chủ yếu ở phục vụ / thương hiệu.
    for (const g of focus.gaps) {
      expect(g.gap).toBeLessThan(0);
      expect(g.customers).toBeGreaterThan(0);
    }
    const sorted = [...focus.gaps].sort((a, b) => b.customers - a.customers);
    expect(focus.gaps).toEqual(sorted);
  });

  it('a clearly worse price shows up as the main gap', () => {
    const pricey = produce(game, (d) => {
      must(d.stores[PLAYER_E]).price = money(900);
    });
    const focus = must(inspectStore(pricey, content, PLAYER_E).focus);
    expect(focus.gaps[0]?.part).toBe('price');
  });

  it('reports today’s capacity and lost customers', () => {
    const st = must(game.stores[PLAYER_E]);
    expect(report.capacityToday).toBe(st.today.capacity);
    expect(report.lostToday).toBe(st.today.lost);
  });
});

describe('whatIf (try before you set)', () => {
  it('with no change reproduces expected demand and capacity-capped service', () => {
    const r = whatIf(game, content, PLAYER_E, {});
    const st = must(game.stores[PLAYER_E]);
    expect(r.expectedDemand).toBeCloseTo(must(expectedDemand(game, content).byStore[PLAYER_E]), 9);
    expect(r.served).toBeCloseTo(Math.min(r.expectedDemand, r.capacity), 9);
    expect(r.price).toBe(st.price);
    expect(r.staff).toBe(st.staff);
  });

  it('does not change the state', () => {
    const before = hashState(game);
    whatIf(game, content, PLAYER_E, { price: money(500), staff: 9, wageMonthly: money(300_000) });
    priceCurve(game, content, PLAYER_E);
    expect(hashState(game)).toBe(before);
  });

  it('staff and wage change capacity, wage cost and the morale target', () => {
    const base = whatIf(game, content, PLAYER_E, {});
    const more = whatIf(game, content, PLAYER_E, { staff: base.staff + 4, wageMonthly: money(264_000) });
    expect(more.capacity).toBeGreaterThan(base.capacity);
    expect(more.wagesPerDay).toBeGreaterThan(base.wagesPerDay);
    expect(more.moraleTarget).toBeCloseTo(moraleTarget(264_000 / (220_000 * game.macro.priceIndex), 6), 12);
    // contribution = doanh thu − giá vốn − lương − thuê, mỗi ngày
    expect(more.contributionPerDay).toBe(
      more.revenuePerDay - more.cogsPerDay - more.wagesPerDay - more.rentPerDay,
    );
  });

  it('property: a higher price never raises expected demand', () => {
    fc.assert(
      fc.property(fc.integer({ min: 110, max: 1600 }), fc.integer({ min: 5, max: 100 }), (p, bump) => {
        const a = whatIf(game, content, PLAYER_E, { price: money(p) });
        const b = whatIf(game, content, PLAYER_E, { price: money(p + bump) });
        expect(b.expectedDemand).toBeLessThanOrEqual(a.expectedDemand + 1e-9);
      }),
      { numRuns: RUNS },
    );
  });

  it('priceCurve: 25 ascending prices inside the valid band, demand non-increasing', () => {
    const curve = priceCurve(game, content, PLAYER_E);
    expect(curve).toHaveLength(25);
    const pref = 350 * game.macro.priceIndex;
    for (let i = 0; i < curve.length; i++) {
      const pt = must(curve[i]);
      expect(pt.price % 5).toBe(0);
      expect(pt.price).toBeGreaterThanOrEqual(0.3 * pref);
      expect(pt.price).toBeLessThanOrEqual(5 * pref);
      if (i > 0) {
        expect(pt.price).toBeGreaterThan(must(curve[i - 1]).price);
        expect(pt.expectedDemand).toBeLessThanOrEqual(must(curve[i - 1]).expectedDemand + 1e-9);
      }
    }
  });
});

describe('store history (A3)', () => {
  it('keeps the last 14 days and the last 12 months', () => {
    // Thành phố gấp 3 dân số để cửa hàng AI có lãi và mở suốt 13 tháng (fixture gốc: người chơi phá sản sớm).
    const big = fixtureContent((d) => {
      for (const district of d.scenario.city.districts) district.pop *= 3;
    });
    const s = runDays(createGame(big), big, 13 * 30);
    const st = must(s.stores['store-000001']);
    expect(st.status).toBe('open');
    expect(st.recentDays).toHaveLength(14);
    expect(st.recentDays.at(-1)).toEqual({
      day: s.clock.day - 1,
      demand: st.today.demand,
      served: st.today.served,
      capacity: st.today.capacity,
    });
    expect(st.history).toHaveLength(12);
    expect(st.history.at(-1)).toEqual(st.lastMonth);
  }, 30_000);
});

describe('priceCurve fast path (ownDemandAtPrices)', () => {
  it('matches whatIf (full recompute) at every point', () => {
    for (const pt of priceCurve(game, content, PLAYER_E)) {
      const full = whatIf(game, content, PLAYER_E, { price: pt.price });
      expect(pt.expectedDemand).toBeCloseTo(full.expectedDemand, 9);
      expect(pt.served).toBeCloseTo(full.served, 9);
      expect(pt.contributionPerDay).toBe(full.contributionPerDay);
    }
  });
});
