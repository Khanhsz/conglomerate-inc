/** Lấy giá trị hoặc ném lỗi rõ ràng (thay cho `!` trong test). */
export function must<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to exist`);
  return value;
}
