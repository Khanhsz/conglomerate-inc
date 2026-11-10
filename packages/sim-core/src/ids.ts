import { ID_DIGITS } from './constants';

/** `formatId('store', 7)` → `'store-000007'`: id đệm 0 để sort theo chuỗi trùng thứ tự tạo. */
export function formatId(prefix: string, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new RangeError(`id number must be a positive integer, got ${n}`);
  return `${prefix}-${String(n).padStart(ID_DIGITS, '0')}`;
}
