import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fnv1a32, fnv1a64, hashValue, StableStringifyError, stableStringify } from './hash';

// Tham chiếu độc lập: FNV-1a 64-bit bằng BigInt trên byte UTF-8 của TextEncoder.
function fnv1a64Reference(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(s)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

describe('fnv1a32 / fnv1a64', () => {
  it.each([
    ['', 0x811c9dc5, 'cbf29ce484222325'],
    ['a', 0xe40c292c, 'af63dc4c8601ec8c'],
    ['foobar', 0xbf9cf968, '85944171f73967e8'],
    ['42|demand|7', 0x6f37837b, 'b9eb54ae5640bb9b'],
    ['phở', 0x51ef7a5e, 'a99b80694d5fc6de'],
  ])('%j', (s, h32, h64) => {
    expect(fnv1a32(s)).toBe(h32);
    expect(fnv1a64(s)).toBe(h64);
  });

  it('property: fnv1a64 matches the BigInt reference on any string (UTF-8, incl. lone surrogates)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 64 }), (s) => {
        expect(fnv1a64(s)).toBe(fnv1a64Reference(s));
      }),
    );
    expect(fnv1a64('\ud800x')).toBe(fnv1a64Reference('\ud800x'));
  });

  it('fnv1a32 returns an unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = fnv1a32(s);
        expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
      }),
    );
  });
});

describe('stableStringify', () => {
  it('sorts keys recursively and keeps array order', () => {
    const a = { b: 1, a: { d: [3, { y: 1, x: 2 }], c: 'x' } };
    const b = { a: { c: 'x', d: [3, { x: 2, y: 1 }] }, b: 1 };
    expect(stableStringify(a)).toBe('{"a":{"c":"x","d":[3,{"x":2,"y":1}]},"b":1}');
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });

  it('encodes primitives like JSON', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify('a"b\n')).toBe(JSON.stringify('a"b\n'));
    expect(stableStringify(-0)).toBe('0');
    expect(stableStringify(1.5e-7)).toBe(JSON.stringify(1.5e-7));
    const bare: object = Object.create(null);
    expect(stableStringify(bare)).toBe('{}');
  });

  it.each<[string, unknown, string]>([
    ['undefined at the root', undefined, '$'],
    ['undefined property', { a: { b: undefined } }, '$.a.b'],
    ['undefined array element', { list: [1, undefined] }, '$.list[1]'],
    ['sparse array hole', { list: [1, , 3] }, '$.list[1]'],
    ['NaN', { stores: { 's-1': { price: Number.NaN } } }, '$.stores["s-1"].price'],
    ['Infinity', { x: Number.POSITIVE_INFINITY }, '$.x'],
    ['-Infinity', [Number.NEGATIVE_INFINITY], '$[0]'],
    ['function', { f: () => 1 }, '$.f'],
    ['bigint', { n: 1n }, '$.n'],
    ['symbol', { s: Symbol('x') }, '$.s'],
    // eslint-disable-next-line no-restricted-syntax -- test cố ý tạo Date để kiểm tra stableStringify từ chối nó
    ['Date', { d: new Date(0) }, '$.d'],
    ['Map', { m: new Map() }, '$.m'],
    ['Set', { s: new Set() }, '$.s'],
    ['class instance', { c: new (class Foo {})() }, '$.c'],
  ])('throws on %s with the path', (_name, value, path) => {
    let error: unknown;
    try {
      stableStringify(value);
    } catch (e) {
      error = e;
    }
    if (!(error instanceof StableStringifyError)) throw new Error('expected StableStringifyError');
    expect(error.path).toBe(path);
    expect(error.message).toContain(path);
  });

  it('throws on cycles instead of overflowing the stack', () => {
    const a: Record<string, unknown> = {};
    a['self'] = a;
    expect(() => stableStringify(a)).toThrow(StableStringifyError);
  });

  it('allows the same object at two places (not a cycle)', () => {
    const shared = { x: 1 };
    expect(stableStringify({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it('property: output is valid JSON, idempotent, and independent of key insertion order', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const s = stableStringify(v);
        const parsed: unknown = JSON.parse(s);
        expect(stableStringify(parsed)).toBe(s);
        expect(stableStringify(reverseKeys(parsed))).toBe(s);
      }),
    );
  });

  it('hashValue = fnv1a64(stableStringify(v))', () => {
    const v = { b: [1, 2], a: 'x' };
    expect(hashValue(v)).toBe(fnv1a64(stableStringify(v)));
    expect(hashValue({ a: 'x', b: [1, 2] })).toBe(hashValue(v));
  });
});

function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) {
      Object.defineProperty(out, k, {
        value: reverseKeys(Reflect.get(v, k)),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return v;
}
