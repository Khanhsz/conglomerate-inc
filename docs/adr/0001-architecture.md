# ADR-0001: Kiến trúc nền tảng

- Trạng thái: Accepted
- Ngày: 2026-11-11

## Bối cảnh
Game quản lý cần mô phỏng hàng nghìn thực thể theo tick, phải deterministic để replay/debug/cân bằng bằng bot, và phải mở rộng ngành bằng dữ liệu. Phần lớn code được viết cùng Claude Code, nên cần ranh giới module và quy ước chặt để code sinh ra dễ kiểm chứng.

## Quyết định
1. **pnpm monorepo, TypeScript strict, ESM.** Packages: `sim-core`, `content`, `balance`; app: `apps/web`.
2. **State thuần JSON.** Không class, Map, Set, Date, bigint trong `GameState`. Collection dạng `Record<Id, T>` + mảng `ids` đã sort để duyệt có thứ tự. Id có đệm số 0 (`store-000010`) để sort theo chuỗi trùng thứ tự tạo.
3. **Tiền = cent dạng số nguyên (`Money` branded number).** Đủ an toàn tới ~9×10^13 USD. Lý do chọn thay vì bigint: serialize JSON trực tiếp, nhanh, đơn giản trong UI.
4. **Lịch 360 ngày.** 12 × 30 ngày; đơn giản hóa chốt tháng và lãi suất.
5. **Mutation qua immer.** Tick: `produce(state, draft => runSystems(draft, ctx))`. System có chữ ký `(draft: GameState, ctx: SimContext) => void`.
6. **Command pattern.** `Command = { type, companyId, payload }`. Mỗi command có `validate(state) → Ok | Rejected(reason)` và `apply(draft, ctx)`. Command được xếp hàng và áp dụng ở đầu tick tiếp theo theo thứ tự nhận.
7. **RNG:** xoshiro128** seed bằng splitmix32. `ctx.rng(stream)` trả về generator riêng cho mỗi stream, seed = splitmix32(FNV-1a 32-bit của chuỗi `seedGốc|stream|day`). Stream có thể gắn thực thể (`demand:<storeId>`). Thêm system mới không làm lệch chuỗi ngẫu nhiên của system cũ.
8. **Content:** YAML → Zod schema → object đã validate, nạp một lần lúc khởi tạo game và đóng băng (`Object.freeze` deep) trong `ctx.content`. Không lưu content trong state; state chỉ lưu `contentVersion` + id (`contentRef`). Type `LoadedContent` định nghĩa ở `sim-core`; package `content` phụ thuộc `sim-core` (schema Zod `satisfies` type đó), không có chiều ngược lại. `loadContent` nhận chuỗi YAML, không đọc file.
9. **Sim chạy trong Web Worker** ở web; giao tiếp bằng message `{ type: 'tick' | 'command' | 'snapshot' }`. UI chỉ nhận snapshot + statements, không giữ tham chiếu state sống.
10. **Hash state** bằng FNV-1a 64-bit trên `stableStringify(state)` (key sort) cho test determinism. Cam kết deterministic trên **cùng một engine JS**; `Math.exp/log/pow` có thể lệch bit giữa V8 và WebKit, replay/save đa nền tảng cần ADR riêng.

## Dependency được phép (M1)
Runtime: `immer`, `zod`, `yaml`, `react`, `react-dom`, `zustand`, `echarts` (hoặc `recharts`), `@tanstack/react-table`.
Dev: `typescript`, `vitest`, `fast-check`, `vite`, `@vitejs/plugin-react`, `eslint` + `typescript-eslint`, `prettier`, `tsx`, `@playwright/test` (chỉ cho smoke test UI ở bước 07).
Thêm dependency khác: hỏi trước.

## Hệ quả
- Không thể dùng float cho tiền → cần helper money đầy đủ và test làm tròn.
- immer có chi phí; nếu tick quá chậm (> mục tiêu hiệu năng), cân nhắc mutate trực tiếp trên bản sao trong worker — cần ADR mới.
