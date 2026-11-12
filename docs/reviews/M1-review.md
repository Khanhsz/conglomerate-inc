# Review độc lập M1 (bước 08) — 2026-11-11

Hai subagent review song song, không sửa file:
- `economist-reviewer`: đối chiếu `packages/sim-core` với `docs/economic-model.md`; tái hiện lỗi bằng script.
- `code-reviewer`: kiểm quy tắc CLAUDE.md trên toàn repo.

**Không có phát hiện mức cao.** Các mục mức trung đều đã sửa, mỗi lỗi kèm test tái hiện viết trước khi sửa.

| Mức | File:line (lúc review) | Nguồn | Vấn đề | Cách xử lý | Trạng thái |
|---|---|---|---|---|---|
| trung | `sim-core/src/systems/monthClose.ts:53-63` | economist | Hoàn thuế cuối quý vào Cash khi Overdraft > 0. Bước tự trả thấu chi đã chạy xong trong ngày, nên distress xét trên thấu chi gộp → distress hoặc bankrupt oan. | Tiền hoàn trả thấu chi trước, phần dư mới vào Cash. Test "tax refund while in overdraft". | Đã sửa |
| trung | `sim-core/src/systems/ai.ts:205-213` | economist | AI đóng cửa hàng lỗ cuối cùng rồi bootstrap mở cửa hàng mới ngay trong cùng lần quyết định (vòng đóng–mở); marketing vẫn theo doanh thu cũ. | Không mở rộng trong tháng có đóng cửa hàng; bootstrap chỉ khi không có cửa hàng từ trước; marketing = 0 khi không còn cửa hàng. Đã thêm test; cập nhật economic-model §9. | Đã sửa |
| trung | `sim-core/src/systems/ai.ts:210` | cả hai | Điều kiện `cash <= spendingPower(...)` luôn đúng. | Bỏ điều kiện. | Đã sửa |
| trung | `systems/{loans,tax,monthClose,operations,brand}.test.ts` | code | Công thức chỉ có test ví dụ, chưa có property test. | Thêm property test: trả góp hết gốc sau n kỳ; thuế không âm và tổng năm khớp; Σ khấu hao = capex; `moraleTarget` ∈ [0,1] và đơn điệu; `brandLift` ∈ [0, α] và đơn điệu. | Đã sửa |
| trung | `.github/workflows/ci.yml` | code | CI chưa chạy `pnpm balance:smoke`. | Thêm bước vào CI. | Đã sửa |
| thấp | `sim-core/src/engine.test.ts:162` | code | Test determinism mới chạy 360 ngày, spec §8 yêu cầu 2 năm. | Nâng lên 720 ngày. | Đã sửa |
| thấp | `balance/src/report.test.ts` | code | Thiếu test hiệu chỉnh §14 trên sim thật (`skipIf(!CALIBRATE)`). | Thêm `balance/src/calibration.test.ts`. | Đã sửa |
| thấp | `sim-core/src/systems/ai.ts:104, 133` | code | Duyệt phân khúc không sort; số 3 viết cứng. | Sort key; dùng `MAX_STORES_PER_DISTRICT`. | Đã sửa |
| thấp | `operations.ts:57-58`, `monthClose.ts`, `loans.ts` | code | Nhân/chia trên Money trước khi làm tròn, không qua helper. | Dùng `mul(...)` (kết quả làm tròn không đổi; mọi test số cụ thể vẫn xanh). | Đã sửa |
| thấp | `apps/web/src/components/FinanceTab.tsx:231` | code | Nhãn "+1%" viết cứng. | Lấy từ `scenario.finance.earlyRepaymentFee` qua `Snapshot.rules`. | Đã sửa |
| thấp | `docs/economic-model.md` §9; spec §4 bước 3 | economist | §9 ghi cứng ngưỡng 1.5 (đã đổi thành 3); câu chữ về brand "spend hôm qua" lệch code. | §9 ghi tên tham số kèm giá trị hiện tại; sửa câu chữ spec. | Đã sửa |
| thấp | `sim-core/src/systems/forecast.ts` | economist | `principalRepaid` gồm cả trả sớm tự nguyện → dự báo giả trong 3 tháng sau khi trả sớm. | Chỉ trừ gốc theo lịch (cần tách theo refId hoặc thêm trường). | Mở — #52 |
| thấp | `sim-core/src/systems/ai.ts:148-155` | economist | Tử số ROI lấy P&L công ty (gồm phí chấm dứt thuê và cửa hàng đã đóng), mẫu số chỉ capex cửa hàng đang mở. | Tính từ `store.lastMonth` của cửa hàng đang mở, hoặc ghi định nghĩa vào §9. | Mở — #52 |
| thấp | `sim-core/src/engine.ts:159`, `balance/src/bench.ts` | code | `JSON.parse` / `yaml.parse` trả `any` gán thẳng vào kiểu. | `QueuedCommand.command: unknown` hoặc validate shape ở `enqueue`; bench sửa content đã typed bằng immer. | Mở — #53 |
| thấp | `eslint.config.js` | code | Lint không type-aware: không bắt `any` ngầm, không cấm `as`, không bắt `Date()` (không new) hay `crypto`. | Bật `recommendedTypeChecked` và `consistent-type-assertions: never` (override cho money.ts); thêm selector. | Mở — #53 |
| thấp | `apps/web/src/sim/snapshot.ts`, `GameState.events` | code | `events` tăng không giới hạn; snapshot lọc toàn mảng mỗi tick. | Giới hạn hoặc tách log khỏi state; cache `gameOver`. | Mở — #54 |
| thấp | `sim-core/src/systems/monthClose.ts:195, 219` | code | Dựng báo cáo 2 lần mỗi công ty mỗi tháng. | Lấy preTax từ `periodTotals` một lần. | Mở — #54 (gộp với #46) |
| thấp | `package.json`, `apps/web/package.json` | code | `@types/*` chưa có trong ADR-0001. | Bạn chốt #28 rồi sửa ADR. | Chờ quyết định |

Đã có từ trước (#46): bench `pnpm bench` ~3.2 s so với mục tiêu 1.5 s; cần ADR mới.
