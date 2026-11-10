import fc from 'fast-check';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { money } from '../money';
import { createRngFactory } from '../rng';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { LoadedContent, SegmentDef } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { demandSystem, distanceKm, expectedDemand, logitShares, storeUtility } from './demand';

const finite = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const RUNS = Number(process.env['FC_RUNS'] ?? 100);

describe('logitShares (economic-model §3.3, §13.4)', () => {
  it('property: Σ share + share₀ = 1, every share ∈ [0, 1], even for extreme utilities', () => {
    fc.assert(
      fc.property(finite(-700, 700), fc.array(finite(-700, 700), { maxLength: 30 }), (u0, us) => {
        const { outside, shares } = logitShares(u0, us);
        expect(shares).toHaveLength(us.length);
        const total = shares.reduce((a, b) => a + b, outside);
        expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-9);
        for (const s of [outside, ...shares]) {
          expect(Number.isFinite(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('matches the closed form for one option', () => {
    const { outside, shares } = logitShares(2, [1.095]);
    expect(shares[0]).toBeCloseTo(1 / (1 + Math.exp(2 - 1.095)), 15);
    expect(outside).toBeCloseTo(1 / (1 + Math.exp(1.095 - 2)), 15);
  });

  it('stays finite where naive exp would overflow', () => {
    const { outside, shares } = logitShares(1000, [1001, 999]);
    expect(Number.isFinite(outside) && shares.every(Number.isFinite)).toBe(true);
    expect(shares[0]).toBeCloseTo(Math.E / (1 + Math.E + 1 / Math.E), 12);
  });

  it('with no stores everyone takes the outside option', () => {
    expect(logitShares(1.4, [])).toEqual({ outside: 1, shares: [] });
  });
});

const segment = (over: Partial<SegmentDef['betas']> = {}, eta = 0): SegmentDef => ({
  visitsPerPersonPerDay: 0.065,
  maxTravelKm: 2.5,
  outsideUtility: 2,
  incomeElasticityOfPriceSensitivity: eta,
  betas: { q: 1.5, p: 1.5, b: 1.5, d: 1.2, w: 1.2, ...over },
});

describe('storeUtility (economic-model §3.1)', () => {
  it('hand-computed example', () => {
    // U = 1.5·0.6 − 1.5·ln(1) + 1.5·0.05 − 1.2·0.5 + 1.2·0.6 = 0.9 + 0.075 − 0.6 + 0.72 = 1.095
    const u = storeUtility(segment(), 1, {
      quality: 0.6,
      price: 350,
      refPrice: 350,
      awareness: 0.05,
      distanceKm: 0.5,
      serviceLevel: 0.6,
    });
    expect(u).toBeCloseTo(1.095, 12);
  });

  it('price enters as −βp · ln(P / Pref)', () => {
    const base = { quality: 0, price: 350, refPrice: 350, awareness: 0, distanceKm: 0, serviceLevel: 0 };
    const seg = segment({ q: 0, b: 0, d: 0, w: 0 });
    expect(storeUtility(seg, 1, { ...base, price: 700 })).toBeCloseTo(-1.5 * Math.log(2), 12);
    expect(storeUtility(seg, 1, { ...base, price: 700, refPrice: 700 })).toBeCloseTo(0, 12);
  });

  it('income elasticity scales βp by 1 / incomeIndex^η', () => {
    const x = { quality: 0, price: 700, refPrice: 350, awareness: 0, distanceKm: 0, serviceLevel: 0 };
    const seg = segment({ q: 0, b: 0, d: 0, w: 0 }, 1);
    expect(storeUtility(seg, 2, x)).toBeCloseTo((-1.5 / 2) * Math.log(2), 12);
    expect(storeUtility(segment({ q: 0, b: 0, d: 0, w: 0 }, 0), 2, x)).toBeCloseTo(-1.5 * Math.log(2), 12);
  });

  it('property (§13.5): raising one price never raises its share nor lowers any other share', () => {
    const storeArb = fc.record({
      quality: finite(0, 1),
      price: finite(100, 2000),
      awareness: finite(0, 1),
      distanceKm: finite(0.5, 6),
      serviceLevel: finite(0, 1),
    });
    fc.assert(
      fc.property(
        fc.record({ q: finite(0, 5), p: finite(0, 5), b: finite(0, 5), d: finite(0, 5), w: finite(0, 5) }),
        finite(-3, 5),
        fc.array(storeArb, { minLength: 1, maxLength: 8 }),
        fc.nat(),
        finite(1.0001, 3),
        (b, u0, stores, pick, factor) => {
          const seg = segment(b);
          const j = pick % stores.length;
          const before = logitShares(
            u0,
            stores.map((s) => storeUtility(seg, 1, { ...s, refPrice: 350 })),
          ).shares;
          const after = logitShares(
            u0,
            stores.map((s, i) =>
              storeUtility(seg, 1, { ...s, refPrice: 350, price: i === j ? s.price * factor : s.price }),
            ),
          ).shares;
          after.forEach((s, i) => {
            const prev = before[i] ?? Number.NaN;
            if (i === j) expect(s).toBeLessThanOrEqual(prev + 1e-12);
            else expect(s).toBeGreaterThanOrEqual(prev - 1e-12);
          });
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('distanceKm (economic-model §2)', () => {
  const { city } = fixtureContent().scenario;
  const [w, e] = city.districts;
  it('Manhattan × district size; same district uses sameDistrictKm', () => {
    if (!w || !e) throw new Error('fixture needs two districts');
    expect(distanceKm(city, w, e)).toBe(2);
    expect(distanceKm(city, e, w)).toBe(2);
    expect(distanceKm(city, w, w)).toBe(0.5);
  });
});

function ctxAt(state: GameState, content: LoadedContent, day: number): SimContext {
  const factory = createRngFactory(state.seed);
  return { content, day, rng: (stream) => factory(stream, day) };
}

describe('expectedDemand (economic-model §3.3)', () => {
  it('one store, hand-checkable: Σ_e Σ_s N·f·share', () => {
    const content = fixtureContent();
    const state = createGame(content);
    const snap = expectedDemand(state, content);
    const store = state.stores['store-000001'];
    if (!store) throw new Error('missing AI store');
    // Cửa hàng AI ở e: giá 350 (target balanced 351 → làm tròn 5 cent), quality 0.6, A 0.05, W 0.6.
    const seg = content.industry.segments;
    const x = { quality: 0.6, price: 350, refPrice: 350, awareness: 0.05, serviceLevel: 0.6 };
    let expected = 0;
    for (const d of content.scenario.city.districts) {
      for (const [id, s] of Object.entries(seg)) {
        const km = d.id === 'e' ? 0.5 : 2;
        if (km > s.maxTravelKm) continue;
        const share =
          logitShares(s.outsideUtility, [storeUtility(s, 1, { ...x, distanceKm: km })]).shares[0] ?? 0;
        expected += d.pop * (d.mix[id] ?? 0) * s.visitsPerPersonPerDay * share;
      }
    }
    expect(snap.byStore['store-000001']).toBeCloseTo(expected, 9);
    expect(snap.captured).toBeCloseTo(expected, 9);
    // Tiềm năng = Σ N·f = 10000·(0.5·0.065 + 0.5·0.045) + 12000·(0.7·0.065 + 0.3·0.045) = 550 + 708 = 1258
    expect(snap.potential).toBeCloseTo(1258, 9);
  });

  it('respects maxTravelKm', () => {
    const content = fixtureContent((d) => {
      for (const s of Object.values(d.industry.segments)) s.maxTravelKm = 1;
    });
    const state = createGame(content);
    const near = fixtureContent((d) => {
      for (const s of Object.values(d.industry.segments)) s.maxTravelKm = 1;
      must(d.scenario.city.districts[0]).pop = 0; // không ai ở w: kết quả không đổi nếu w vốn đã ngoài tầm
    });
    const a = expectedDemand(state, content).byStore['store-000001'];
    const b = expectedDemand(createGame(near), near).byStore['store-000001'];
    expect(a).toBeGreaterThan(0);
    expect(a).toBeCloseTo(b ?? Number.NaN, 12);
  });

  it('ignores closed stores', () => {
    const content = fixtureContent();
    const state = produce(createGame(content), (d) => {
      must(d.stores['store-000001']).status = 'closed';
    });
    expect(expectedDemand(state, content)).toEqual({ byStore: {}, potential: 1258, captured: 0 });
  });

  it('property (§13.5) at game level: raising one price never raises its demand nor lowers another store’s', () => {
    const content = fixtureContent((d) => {
      must(d.scenario.companies[0]).initialStores = ['w', 'e'];
    });
    const base = createGame(content);
    fc.assert(
      fc.property(
        fc.integer({ min: 105, max: 1700 }),
        fc.integer({ min: 1, max: 50 }),
        fc.nat(2),
        (p, bump, pick) => {
          const ids = base.storeIds;
          const j = ids[pick % ids.length] ?? '';
          const lo = produce(base, (d) => {
            must(d.stores[j]).price = money(p);
          });
          const hi = produce(base, (d) => {
            must(d.stores[j]).price = money(p + bump);
          });
          const a = expectedDemand(lo, content).byStore;
          const b = expectedDemand(hi, content).byStore;
          for (const id of ids) {
            if (id === j) expect(b[id] ?? 0).toBeLessThanOrEqual((a[id] ?? 0) + 1e-9);
            else expect(b[id] ?? 0).toBeGreaterThanOrEqual((a[id] ?? 0) - 1e-9);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('demandSystem (economic-model §3.4)', () => {
  const content = fixtureContent();
  const state = createGame(content);
  const expected = expectedDemand(state, content).byStore['store-000001'] ?? Number.NaN;
  const realizedOn = (day: number) =>
    produce(state, (d) => demandSystem(d, ctxAt(state, content, day))).stores['store-000001']?.today.demand ??
    Number.NaN;

  it('writes realized demand = expected × lognormal noise, deterministic per day', () => {
    expect(realizedOn(3)).toBe(realizedOn(3));
    expect(realizedOn(3)).not.toBe(realizedOn(4));
    expect(Math.abs(realizedOn(3) / expected - 1)).toBeLessThan(0.3);
  });

  it('noise has mean 1 (σ²/2 correction): average over 2000 days ≈ expected (±1%)', () => {
    let total = 0;
    const n = 2000;
    for (let day = 0; day < n; day++) total += realizedOn(day);
    expect(Math.abs(total / n / expected - 1)).toBeLessThan(0.01);
  });

  it('large noise (σ = 0.5) still has mean 1: without the −σ²/2 term the mean would be +13%', () => {
    const noisy = fixtureContent((d) => {
      d.industry.dailyDemandNoise = 0.5;
    });
    const s = createGame(noisy);
    const exp = expectedDemand(s, noisy).byStore['store-000001'] ?? Number.NaN;
    let total = 0;
    const n = 4000;
    for (let day = 0; day < n; day++) {
      total +=
        produce(s, (d) => demandSystem(d, ctxAt(s, noisy, day))).stores['store-000001']?.today.demand ??
        Number.NaN;
    }
    expect(Math.abs(total / n / exp - 1)).toBeLessThan(0.04); // sd của trung bình ≈ 0.53/√4000 ≈ 0.8%
  });

  it('with zero noise realized demand equals expected demand', () => {
    const quiet = fixtureContent((d) => {
      d.industry.dailyDemandNoise = 0;
    });
    const s = createGame(quiet);
    const out = produce(s, (d) => demandSystem(d, ctxAt(s, quiet, 5)));
    expect(out.stores['store-000001']?.today.demand).toBeCloseTo(
      expectedDemand(s, quiet).byStore['store-000001'] ?? Number.NaN,
      12,
    );
  });
});
