/**
 * Chế độ kiểm tra (ADR-0002): khi bật, `step` đóng băng sâu state trả về, nên mọi chỗ ghi nhầm vào state cũ
 * (phần `beginTick` không sao chép) ném TypeError ngay trong test. Tắt mặc định (worker, bench) để không tốn chi phí.
 * Là cấu hình chạy, không phải state game, nên không ảnh hưởng determinism.
 */
let enabled = false;

export function setDevChecks(on: boolean): void {
  enabled = on;
}

export function devChecksEnabled(): boolean {
  return enabled;
}

/** Đóng băng sâu; bỏ qua cây con đã đóng băng (state cũ dùng chung), nên mỗi tick chỉ đi qua phần mới. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
  return value;
}
