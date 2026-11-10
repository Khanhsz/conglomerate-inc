/**
 * Hash và tuần tự hóa ổn định (ADR-0001 #7, #10).
 * FNV-1a chạy trên byte UTF-8; mã hóa UTF-8 viết tay để sim-core không phụ thuộc TextEncoder (DOM/Node).
 */

/** Gọi `onByte` cho từng byte UTF-8 của chuỗi. Surrogate lẻ được thay bằng U+FFFD, giống TextEncoder. */
function forEachUtf8Byte(s: string, onByte: (byte: number) => void): void {
  for (const ch of s) {
    let cp = ch.codePointAt(0) ?? 0xfffd;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) {
      onByte(cp);
    } else if (cp < 0x800) {
      onByte(0xc0 | (cp >> 6));
      onByte(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      onByte(0xe0 | (cp >> 12));
      onByte(0x80 | ((cp >> 6) & 0x3f));
      onByte(0x80 | (cp & 0x3f));
    } else {
      onByte(0xf0 | (cp >> 18));
      onByte(0x80 | ((cp >> 12) & 0x3f));
      onByte(0x80 | ((cp >> 6) & 0x3f));
      onByte(0x80 | (cp & 0x3f));
    }
  }
}

/** FNV-1a 32-bit, trả số nguyên không dấu. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  forEachUtf8Byte(s, (byte) => {
    h = Math.imul(h ^ byte, 0x01000193);
  });
  return h >>> 0;
}

/**
 * FNV-1a 64-bit, trả 16 ký tự hex. Tính bằng 4 limb 16-bit (không dùng BigInt để nhanh trên chuỗi state lớn).
 * Nhân với prime 2^40 + 0x1b3: phần ×0x1b3 trên từng limb, phần dịch 40 bit = limb0, limb1 dịch 8 bit lên limb2, limb3.
 */
export function fnv1a64(s: string): string {
  let v0 = 0x2325;
  let v1 = 0x8422;
  let v2 = 0x9ce4;
  let v3 = 0xcbf2;
  forEachUtf8Byte(s, (byte) => {
    v0 ^= byte;
    const t0 = v0 * 0x1b3;
    let t1 = v1 * 0x1b3;
    let t2 = v2 * 0x1b3 + (v0 << 8);
    const t3 = v3 * 0x1b3 + (v1 << 8);
    t1 += t0 >>> 16;
    v0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    v1 = t1 & 0xffff;
    v3 = (t3 + (t2 >>> 16)) & 0xffff;
    v2 = t2 & 0xffff;
  });
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  return hex(v3) + hex(v2) + hex(v1) + hex(v0);
}

export class StableStringifyError extends Error {
  override name = 'StableStringifyError';
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`stableStringify: ${reason} at ${path}`);
  }
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const childPath = (path: string, key: string) =>
  IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

function isPlainObject(v: object): boolean {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * JSON với key sort đệ quy (theo code unit UTF-16). Chỉ nhận dữ liệu thuần JSON:
 * ném lỗi kèm đường dẫn khi gặp undefined, NaN, ±Infinity, function, bigint, symbol,
 * object không thuần (Date, Map, Set, class) hoặc vòng tham chiếu.
 */
export function stableStringify(value: unknown): string {
  const parts: string[] = [];
  const stack = new Set<object>();

  const visit = (v: unknown, path: string): void => {
    switch (typeof v) {
      case 'string':
        parts.push(JSON.stringify(v));
        return;
      case 'boolean':
        parts.push(v ? 'true' : 'false');
        return;
      case 'number':
        if (!Number.isFinite(v)) throw new StableStringifyError(path, `non-finite number ${String(v)}`);
        parts.push(JSON.stringify(v));
        return;
      case 'undefined':
      case 'function':
      case 'bigint':
      case 'symbol':
        throw new StableStringifyError(path, `unsupported ${typeof v}`);
      case 'object':
        break;
    }
    if (v === null) {
      parts.push('null');
      return;
    }
    if (stack.has(v)) throw new StableStringifyError(path, 'circular reference');
    stack.add(v);
    if (Array.isArray(v)) {
      parts.push('[');
      for (let i = 0; i < v.length; i++) {
        if (i > 0) parts.push(',');
        const itemPath = `${path}[${i}]`;
        if (!(i in v)) throw new StableStringifyError(itemPath, 'sparse array hole');
        visit(v[i], itemPath);
      }
      parts.push(']');
    } else {
      if (!isPlainObject(v)) {
        const ctor: unknown = Reflect.get(v, 'constructor');
        const name = typeof ctor === 'function' ? ctor.name : 'unknown';
        throw new StableStringifyError(path, `non-plain object (${name})`);
      }
      parts.push('{');
      const keys = Object.keys(v).sort();
      keys.forEach((key, i) => {
        if (i > 0) parts.push(',');
        parts.push(JSON.stringify(key), ':');
        visit(Reflect.get(v, key), childPath(path, key));
      });
      parts.push('}');
    }
    stack.delete(v);
  };

  visit(value, '$');
  return parts.join('');
}

/** Hash ổn định của một giá trị thuần JSON. */
export function hashValue(value: unknown): string {
  return fnv1a64(stableStringify(value));
}
