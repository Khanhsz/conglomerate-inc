/**
 * RNG deterministic (ADR-0001 #7): xoshiro128** seed bằng splitmix32.
 * Mỗi (seed, stream, day) có generator riêng, seed = fnv1a32("seed|stream|day"),
 * nên thêm stream mới không làm lệch chuỗi của stream cũ.
 * Generator không nằm trong GameState; tạo lại mỗi lần cần.
 */
import { fnv1a32 } from './hash';

export interface Rng {
  /** Số nguyên không dấu 32-bit. */
  next(): number;
  /** Số thực trong [0, 1), độ phân giải 2^-32. */
  float(): number;
  /** Số nguyên đều trong [lo, hi], cả hai đầu. Cần hi − lo < 2^32. */
  int(lo: number, hi: number): number;
  /** N(0, 1) bằng Box–Muller; mỗi lần gọi dùng đúng 2 lần next(), không cache giá trị thứ hai. */
  normal(): number;
}

export type RngFactory = (stream: string, day: number) => Rng;

const TWO_POW_32 = 0x1_0000_0000;

/** splitmix32: mỗi lần gọi trả một uint32. Chỉ dùng để sinh state ban đầu cho xoshiro. */
export function createSplitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));

export function createXoshiro128ss(state: readonly [number, number, number, number]): Rng {
  let s0 = state[0] | 0;
  let s1 = state[1] | 0;
  let s2 = state[2] | 0;
  let s3 = state[3] | 0;
  if ((s0 | s1 | s2 | s3) === 0) throw new Error('xoshiro128** state must not be all zero');

  const next = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9);
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result >>> 0;
  };

  const float = (): number => next() / TWO_POW_32;

  return {
    next,
    float,
    int(lo, hi) {
      if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi || hi - lo >= TWO_POW_32) {
        throw new RangeError(`rng.int: invalid bounds [${lo}, ${hi}]`);
      }
      return lo + Math.floor(float() * (hi - lo + 1));
    },
    normal() {
      const u1 = 1 - float(); // (0, 1] → ln(u1) hữu hạn
      const u2 = float();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

export function streamSeed(seed: number, stream: string, day: number): number {
  return fnv1a32(`${seed}|${stream}|${day}`);
}

export function createRngFactory(seed: number): RngFactory {
  if (!Number.isSafeInteger(seed)) throw new RangeError(`RNG seed must be a safe integer, got ${seed}`);
  return (stream, day) => {
    if (!Number.isSafeInteger(day) || day < 0)
      throw new RangeError(`RNG day must be a non-negative integer, got ${day}`);
    const sm = createSplitmix32(streamSeed(seed, stream, day));
    return createXoshiro128ss([sm(), sm(), sm(), sm()]);
  };
}
