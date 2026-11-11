# ADR-0002 — Tick bằng bản sao có chọn lọc thay cho immer

Ngày: 2026-11-11. Trạng thái: chấp nhận. Thay **điểm 5 của ADR-0001**, chỉ cho `step`. Đóng #46.

## Bối cảnh
`pnpm bench` (3 năm × 60 cửa hàng × 4 công ty) mất **5.4 s**, mục tiêu < 1.5 s (spec §8). Profile cho thấy immer chiếm **66%** thời gian:
- proxy cho mỗi lần đọc / ghi trường;
- đóng băng sâu toàn bộ state sau mỗi tick;
- sao chép mảng.

Gần như mọi cửa hàng đều đổi mỗi ngày, nên immer không tiết kiệm được nhờ chia sẻ cấu trúc. Chạy cùng các system trên object thường chỉ mất **0.63 s**.

ADR-0001 đã ghi: "nếu tick quá chậm, cân nhắc mutate trực tiếp trên bản sao — cần ADR mới".

## Quyết định
- `step(state)` gọi `beginTick(state)` (`packages/sim-core/src/tick.ts`). Hàm này sao chép đúng những phần state có thể bị ghi trong một ngày:
  - gốc, `clock`, `macro`, `nextIds`;
  - mỗi công ty kèm các object con;
  - mỗi cửa hàng kèm `today`, `mtd`, `overrides` và các mảng của nó;
  - mỗi khoản vay;
  - các mảng id, `commandQueue`, `events`, `statements[c]`;
  - `ledger.entries` (`slice`) và bản đồ số dư.
- Sau đó `runSystems(draft, ctx)` chạy đúng thứ tự spec §4 trên bản sao. Chữ ký system không đổi: `(draft, ctx) => void`.
- Phần không sao chép thì dùng chung với state cũ, và **không bao giờ bị sửa tại chỗ**:
  - bút toán đã ghi;
  - `lastMonth` (được thay, không sửa);
  - `MonthlyStatements` (đã đóng băng);
  - content.
- `createGame` và `enqueue` vẫn dùng immer (gọi hiếm). immer vẫn là dependency.

## Lưới an toàn
- **Chế độ kiểm tra** (`setDevChecks(true)`, `devChecks.ts`): `step` đóng băng sâu state trả về; đóng băng tăng dần, bỏ qua cây con đã đóng băng.
  - Bật cho mọi test qua `setupFiles` của vitest, và cho `balance:smoke` (cả trong worker thread).
  - Nếu một system ghi vào phần mà `beginTick` quên sao chép, test ném `TypeError` ngay.
- **`tick.test.ts`:**
  - 2 năm có kịch bản chạm mọi lệnh M1.6/M1.7: hash mỗi tháng **giống hệt** khi chạy qua immer;
  - property theo seed;
  - state vào không đổi;
  - ghi vào bản sao không chạm bản gốc đã đóng băng.
- **Hồi quy M1** (`regression.m1.test.ts`) vẫn khớp từng cent.

## Hệ quả
- Bench **0.70 s** (trước 5.4 s). `pnpm test` 16 s (trước 21 s, nay có cả đóng băng sâu). `balance:smoke` 23 s (trước 42 s).
- **Quy tắc mới:** thêm trường có thể bị ghi vào `GameState` thì phải thêm vào `beginTick`. Chế độ kiểm tra trong test sẽ báo nếu quên.
- Worker web và bench tắt chế độ kiểm tra, nên không tốn chi phí đóng băng.
