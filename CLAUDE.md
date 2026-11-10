# CLAUDE.md — Conglomerate Inc. (tên tạm)

Game quản lý mô phỏng kinh doanh đa ngành, single-player, web-first (desktop sau qua Tauri).
Tham khảo cảm hứng: Coffee Inc 2, nhưng lõi mô phỏng dùng chung cho mọi ngành ("industry pack").

## Đọc trước khi làm bất kỳ việc gì
1. `docs/GDD.md` — game làm gì, cho ai, design pillars.
2. `docs/economic-model.md` — **nguồn sự thật duy nhất** cho mọi công thức. Tên biến trong code phải khớp tên trong tài liệu này.
3. `docs/specs/` — spec của milestone đang làm. Chỉ làm những gì spec yêu cầu.
4. `docs/adr/` — các quyết định kiến trúc đã chốt. Không đảo ngược ADR nếu chưa được yêu cầu.

## Kiến trúc (tóm tắt)
- pnpm monorepo, TypeScript `strict: true`, Node ≥ 20, ESM.
- `packages/sim-core` — mô phỏng thuần: không import DOM, không I/O, không thời gian thực.
- `packages/content` — industry pack + scenario dạng YAML, validate bằng Zod.
- `packages/balance` — CLI chạy headless nhiều seed, bot chiến lược, xuất CSV.
- `apps/web` — React + Vite. Sim chạy trong Web Worker.

## Quy tắc bắt buộc (vi phạm = chưa xong)
- **Deterministic:** trong `sim-core` cấm `Math.random`, `Date.now`, `new Date()`, `performance.now`, lặp `Object.keys` trên object có key do người chơi tạo mà không sort. Dùng `ctx.rng(streamName)` và `state.clock`.
- **Tiền:** type `Money` = số nguyên **cent** (branded `number`), luôn `Number.isSafeInteger`. Cấm phép tính float trực tiếp lên Money; dùng helper trong `sim-core/src/money.ts` (`mul`, `pct`, `sum`, `roundHalfAwayFromZero`).
- **Kế toán:** mọi dòng tiền / doanh thu / chi phí đi qua `ledger.post(entry)`. Bất biến: tổng Nợ = tổng Có trên mọi bút toán; Tài sản = Nợ phải trả + Vốn chủ ở mọi thời điểm. Không bao giờ sửa số dư trực tiếp.
- **Thay đổi state:** chỉ qua `Command` (hành động người chơi/AI) hoặc `System` (tick). State là dữ liệu thuần, serializable bằng `JSON.stringify` (không class, không Map/Set trong state).
- **Tham số cân bằng** nằm trong `packages/content`, không hard-code trong system. Hằng số cấu trúc (thứ tự system, số ngày/tháng) được phép ở `sim-core/src/constants.ts`.
- **Không thêm dependency** ngoài danh sách trong ADR-0001 mà không hỏi.
- Không tự bịa công thức kinh tế. Nếu spec thiếu, dừng lại và hỏi, hoặc ghi vào `docs/open-questions.md`.

## Lệnh
```bash
pnpm install
pnpm typecheck          # tsc -b toàn repo
pnpm test               # vitest run toàn repo
pnpm test:sim           # chỉ sim-core
pnpm balance:smoke      # 10 seed × 2 năm, fail nếu vi phạm bất biến hoặc NaN
pnpm balance -- --seeds 100 --years 3 --bots all --out out/balance.csv
pnpm dev                # apps/web
pnpm lint
```

## Định nghĩa "xong" cho mọi task
1. `pnpm typecheck && pnpm test && pnpm balance:smoke` đều xanh.
2. Có test cho hành vi mới (unit + property test nếu là công thức).
3. Nếu đổi công thức/tham số: cập nhật `docs/economic-model.md` trong cùng commit.
4. Tóm tắt ngắn: đã làm gì, giả định nào, việc gì còn mở.

## Phong cách code
- Hàm thuần, nhỏ; system là `(state, ctx) => void` thao tác trên draft (immer) hoặc trả patch — xem ADR-0001.
- Tên tiếng Anh trong code; comment/tài liệu có thể tiếng Việt.
- Không `any`. Không `as` ép kiểu trừ ở biên I/O đã validate bằng Zod.
- Commit nhỏ, message dạng `feat(sim-core): demand logit system`.

## Cách làm việc với tôi
- Task lớn: vào plan mode, đề xuất kế hoạch + danh sách file + test sẽ viết, chờ duyệt.
- Viết test trước khi implement công thức.
- Khi phân vân giữa hai cách, chọn cách đơn giản hơn và ghi lý do vào ADR hoặc PR summary.
