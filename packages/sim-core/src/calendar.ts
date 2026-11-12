/** Lịch 360 ngày (economic-model §0): tháng m gồm các ngày [30m, 30m + 29]. */
import { DAYS_PER_MONTH } from './constants';

function assertIndex(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${what} must be a non-negative integer, got ${n}`);
}

export function monthOf(day: number): number {
  assertIndex(day, 'day');
  return Math.floor(day / DAYS_PER_MONTH);
}

export function firstDayOfMonth(month: number): number {
  assertIndex(month, 'month');
  return month * DAYS_PER_MONTH;
}

export function lastDayOfMonth(month: number): number {
  return firstDayOfMonth(month) + DAYS_PER_MONTH - 1;
}
