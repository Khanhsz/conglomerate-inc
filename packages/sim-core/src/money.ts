/**
 * Tiền tệ: số nguyên cent (economic-model, CLAUDE.md). Mọi phép toán trên Money đi qua module này.
 * Mọi hàm ném `MoneyError` khi kết quả không phải safe integer (kể cả NaN/Infinity).
 */

declare const moneyBrand: unique symbol;
export type Money = number & { readonly [moneyBrand]: 'Money' };

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function isMoney(n: number): n is Money {
  return Number.isSafeInteger(n);
}

/** Kiểm tra và gắn brand. Chuẩn hóa -0 thành 0 để state và hash không phân biệt hai giá trị. */
export function money(n: number): Money {
  if (!isMoney(n)) throw new MoneyError(`Money must be a safe integer number of cents, got ${String(n)}`);
  return (n === 0 ? 0 : n) as Money; // điểm duy nhất gắn brand
}

export const ZERO: Money = money(0);

/** Làm tròn nửa ra xa số 0: 2.5 → 3, −2.5 → −3. Không bao giờ trả −0. */
export function roundHalfAwayFromZero(x: number): number {
  if (!Number.isFinite(x)) throw new MoneyError(`Cannot round non-finite value ${String(x)}`);
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

/** Số cent dạng float (ví dụ served × price) → Money, làm tròn half-away-from-zero. */
export function fromFloatCents(x: number): Money {
  return money(roundHalfAwayFromZero(x));
}

export function add(a: Money, b: Money): Money {
  return money(a + b);
}

export function sub(a: Money, b: Money): Money {
  return money(a - b);
}

/** Tổng, kiểm tra tràn ở từng bước. */
export function sum(values: readonly Money[]): Money {
  let total = ZERO;
  for (const v of values) total = add(total, v);
  return total;
}

/** m × factor, làm tròn half-away-from-zero về cent. */
export function mul(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new MoneyError(`Cannot multiply Money by ${String(factor)}`);
  return fromFloatCents(m * factor);
}

/** m × rate với rate là phân số (0.2 = 20%). Cùng phép tính với `mul`, đặt tên cho dễ đọc ở chỗ dùng tỷ lệ. */
export function pct(m: Money, rate: number): Money {
  return mul(m, rate);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "$1,234.56" / "-$0.05". Tự định dạng (không dùng Intl) để kết quả không phụ thuộc locale. */
export function toDisplay(m: Money): string {
  const negative = m < 0;
  const abs = Math.abs(m);
  const dollars = Math.floor(abs / 100);
  const cents = abs - dollars * 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}
