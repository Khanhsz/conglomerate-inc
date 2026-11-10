import { describe, expect, it } from 'vitest';
import { createRngFactory, createSplitmix32, createXoshiro128ss, streamSeed } from './rng';

// Vector tham chiếu sinh từ bản C chuẩn (prng.di.unimi.it/xoshiro128starstar.c và splitmix32),
// độc lập với code TypeScript.
describe('reference vectors', () => {
  it('xoshiro128** from state [1, 2, 3, 4]', () => {
    const rng = createXoshiro128ss([1, 2, 3, 4]);
    const out = Array.from({ length: 6 }, () => rng.next());
    expect(out).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it('splitmix32 seeded with 42', () => {
    const next = createSplitmix32(42);
    expect([next(), next(), next(), next()]).toEqual([551831576, 144025891, 322543647, 3034809370]);
  });

  it('stream seed = fnv1a32("seed|stream|day")', () => {
    expect(streamSeed(42, 'demand', 7)).toBe(0x6f37837b);
  });

  it('full pipeline: factory(42)("demand", 7)', () => {
    const rng = createRngFactory(42)('demand', 7);
    const out = Array.from({ length: 5 }, () => rng.next());
    expect(out).toEqual([1875236924, 2617206923, 885271251, 2684584046, 3620611068]);
  });

  it('rejects the all-zero xoshiro state', () => {
    expect(() => createXoshiro128ss([0, 0, 0, 0])).toThrow();
  });
});

const draw = (seed: number, stream: string, day: number, n = 8): number[] => {
  const rng = createRngFactory(seed)(stream, day);
  return Array.from({ length: n }, () => rng.next());
};

describe('determinism and independence', () => {
  it('same seed + stream + day → same sequence', () => {
    expect(draw(42, 'demand:store-000001', 10)).toEqual(draw(42, 'demand:store-000001', 10));
  });

  it('different stream → different sequence', () => {
    expect(draw(42, 'demand:store-000001', 10)).not.toEqual(draw(42, 'demand:store-000002', 10));
  });

  it('different day → different sequence', () => {
    expect(draw(42, 'demand', 10)).not.toEqual(draw(42, 'demand', 11));
  });

  it('different seed → different sequence', () => {
    expect(draw(42, 'demand', 10)).not.toEqual(draw(43, 'demand', 10));
  });

  it('streams do not share state: drawing from one does not shift another', () => {
    const factory = createRngFactory(42);
    const a = factory('ai:ai-bean', 30);
    const before = a.next();
    const b = factory('demand', 30);
    for (let i = 0; i < 100; i++) b.next();
    const a2 = factory('ai:ai-bean', 30);
    expect(a2.next()).toBe(before);
  });

  it('validates seed and day', () => {
    expect(() => createRngFactory(1.5)).toThrow();
    const factory = createRngFactory(42);
    expect(() => factory('demand', -1)).toThrow();
    expect(() => factory('demand', 0.5)).toThrow();
  });
});

describe('float / int', () => {
  it('float() is in [0, 1)', () => {
    const rng = createRngFactory(7)('float', 0);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int(lo, hi) is inclusive on both ends and hits every value', () => {
    const rng = createRngFactory(7)('int', 0);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const k = rng.int(-2, 3);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(-2);
      expect(k).toBeLessThanOrEqual(3);
      seen.add(k);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('int rejects bad bounds', () => {
    const rng = createRngFactory(7)('int', 0);
    expect(() => rng.int(3, 2)).toThrow();
    expect(() => rng.int(0.5, 2)).toThrow();
    expect(() => rng.int(0, 2 ** 32)).toThrow();
  });
});

describe('normal()', () => {
  it('has mean ≈ 0 and sd ≈ 1 over 10k samples (tolerance 0.05)', () => {
    const rng = createRngFactory(42)('normal-test', 0);
    const n = 10_000;
    const xs = Array.from({ length: n }, () => rng.normal());
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    expect(Number.isFinite(mean)).toBe(true);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });

  it('is always finite (Box–Muller never takes ln(0))', () => {
    const rng = createRngFactory(1)('normal-finite', 0);
    for (let i = 0; i < 50_000; i++) expect(Number.isFinite(rng.normal())).toBe(true);
  });

  it('keeps no hidden cached value: each call consumes exactly two draws', () => {
    const factory = createRngFactory(42);
    const a = factory('demand', 3);
    const b = factory('demand', 3);
    a.normal();
    a.normal();
    for (let i = 0; i < 4; i++) b.next();
    expect(a.next()).toBe(b.next());
  });
});
