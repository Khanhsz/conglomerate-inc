# Chuỗi prompt cho Claude Code — Milestone 1

Dùng lần lượt, mỗi prompt một phiên (hoặc `/clear` giữa các bước). Chỉ chuyển bước khi bước trước đạt "Định nghĩa xong" trong CLAUDE.md và bạn đã review diff.

Cách dùng: mở terminal ở thư mục repo (đã chép bộ file này vào), chạy `claude`, dán prompt.
Với bước lớn, bật plan mode (Shift+Tab) trước khi dán.

| # | Bước | Plan mode | Thời gian ước tính |
|---|---|---|---|
| 00 | Kickoff: đọc tài liệu, phản biện spec, lập kế hoạch | Có | 15–30 phút |
| 01 | Scaffold monorepo + tooling | Có | 30–60 phút |
| 02 | Nền tảng: money, rng, hash, content loader | Không | 1–2 giờ |
| 03 | Ledger + báo cáo tài chính | Có | 2–3 giờ |
| 04 | Engine, commands, demand system | Có | 2–4 giờ |
| 05 | Operations, brand, finance, month close | Có | 3–5 giờ |
| 06 | AI đối thủ + balance runner + hiệu chỉnh | Có | 3–5 giờ |
| 07 | UI tối giản | Có | 3–5 giờ |
| 08 | Review độc lập + dọn dẹp | Không | 1 giờ |

---

## 00 — Kickoff (prompt đầu tiên)

```
Bạn là senior game engineer kiêm kinh tế học ứng dụng, cùng tôi xây một game mô phỏng kinh doanh đa ngành (tham khảo Coffee Inc 2).

Trong phiên này CHƯA VIẾT CODE. Hãy:

1. Đọc kỹ theo thứ tự: CLAUDE.md, docs/GDD.md, docs/economic-model.md, docs/adr/0001-architecture.md, docs/specs/M1-sim-core.md, packages/content/industries/coffee.yaml, packages/content/scenarios/m1-default.yaml.

2. Phản biện spec với tư cách người sẽ implement nó. Tìm:
   - mâu thuẫn giữa các tài liệu (tên biến, đơn vị, thứ tự tick, công thức);
   - chỗ thiếu định nghĩa khiến bạn phải tự đoán;
   - rủi ro số học (tràn số, NaN, làm tròn tiền, log/exp);
   - chỗ mà tham số mặc định có vẻ sẽ cho kết quả phi lý — làm một phép ước lượng nhanh (back-of-envelope) cho cửa hàng "balanced" ở quận c: khách/ngày, doanh thu tháng, EBITDA tháng, và so với mục tiêu hiệu chỉnh ở economic-model §14.

3. Ghi kết quả vào docs/open-questions.md dạng bảng: #, tài liệu/mục, vấn đề, đề xuất của bạn, mức độ (chặn / nên sửa / ghi chú).

4. Đề xuất kế hoạch implement M1 chia theo các bước 01–08 trong prompts/README.md: với mỗi bước liệt kê file sẽ tạo, test sẽ viết trước, và rủi ro. Nếu bạn thấy nên đổi thứ tự hay gộp/tách bước, nói rõ lý do.

5. Dừng lại và chờ tôi trả lời các câu hỏi "chặn" trước khi làm bước 01.

Ràng buộc: không thêm dependency ngoài ADR-0001; không sửa công thức trong economic-model.md nếu tôi chưa đồng ý — chỉ đề xuất.
```

---

## 01 — Scaffold

```
Làm bước 01 theo docs/specs/M1-sim-core.md §1 và ADR-0001.

- Tạo pnpm workspace: packages/sim-core, packages/content, packages/balance, apps/web (Vite + React + TS, để trống một trang "Hello").
- tsconfig.base.json: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ESM, project references.
- Scripts gốc đúng như CLAUDE.md (typecheck, test, test:sim, lint, balance, balance:smoke, dev). balance và balance:smoke tạm in "not implemented" và exit 0.
- ESLint (typescript-eslint) với rule cấm trong packages/sim-core: Math.random, Date.now, new Date, performance.now (no-restricted-properties / no-restricted-syntax). Viết một test nhỏ chứng minh lint bắt được Math.random trong sim-core.
- Vitest workspace; mỗi package có một test giả để chứng minh pipeline chạy.
- .gitignore, .editorconfig, .nvmrc (Node 20).
- Một file .github/workflows/ci.yml chạy install, typecheck, lint, test.

Xong khi: pnpm install && pnpm typecheck && pnpm lint && pnpm test xanh. Commit "chore: scaffold monorepo".
```

## 02 — Nền tảng

```
Làm bước 02: money, rng, hash, content loader.

Viết test TRƯỚC, chạy cho thấy test đỏ, rồi implement.

1. packages/sim-core/src/money.ts — type Money (branded number, cent). Hàm: money(n) (assert safe integer), add, sub, sum, mul(m, factor) và pct(m, rate) trả Money làm tròn half-away-from-zero, fromFloatCents, toDisplay(m) → "$1,234.56", compare. Ném lỗi rõ ràng khi kết quả không phải safe integer hoặc NaN.
2. rng.ts — splitmix32 để seed xoshiro128**. createRngFactory(seed) → (stream: string, day: number) => Rng với next(), float(), int(lo, hi), normal() (Box–Muller, không cache giá trị thứ hai để tránh state ẩn). Seed của stream = hash(seed, stream, day).
3. hash.ts — stableStringify (sort key đệ quy, ném lỗi nếu gặp undefined/NaN/Infinity/function) và fnv1a64 → hex string.
4. packages/content/src/schema.ts + load.ts — Zod schema cho industry và scenario khớp coffee.yaml và m1-default.yaml; refine: mix mỗi quận tổng = 1 (±1e-9), mọi district có x,y trong lưới, id duy nhất, mọi segment trong mix tồn tại trong industry. Hàm loadContent(industryYaml, scenarioYaml) → LoadedContent đã deepFreeze. Lỗi validate phải chỉ đúng đường dẫn trường.

Test theo bảng docs/specs/M1-sim-core.md §8 (money, rng, content).
```

## 03 — Ledger và báo cáo tài chính

```
Làm bước 03: sổ cái kép và báo cáo tài chính, theo economic-model §6, §11, §12, §13.

Vào plan mode trước, cho tôi xem: kiểu dữ liệu, chữ ký hàm, danh sách property test.

Yêu cầu:
- accounts.ts: chart of accounts §12 dạng const, mỗi tài khoản có loại và vế tăng (normal balance).
- post.ts: post(draftLedger, entry) — validate cân, mọi amount là Money > 0, mỗi dòng đúng một vế; gán id tăng dần.
- balances.ts: balancesAt(ledger, companyId, uptoDay) và periodTotals(ledger, companyId, fromDay, toDay). Tối ưu sau; trước mắt duyệt tuyến tính là được nhưng thiết kế để có thể thêm số dư lũy kế theo tháng.
- statements.ts: buildMonthlyStatements(ledger, companyId, month) → { pnl, balanceSheet, cashFlow, kpis } đúng §11; RetainedEarnings = Σ NetIncome; cash flow gián tiếp.
- Property test (fast-check): sinh chuỗi nghiệp vụ ngẫu nhiên hợp lệ (góp vốn, bán hàng, trả lương, mua TSCĐ, khấu hao, vay, trả nợ, thấu chi, thuế) → bảng cân đối luôn cân; CFO+CFI+CFF = ΔCash; NetIncome tháng = ΔRetainedEarnings.
- Một test ví dụ bằng số cụ thể cho một tháng đơn giản mà tôi có thể đọc và kiểm tra bằng tay.
```

## 04 — Engine, commands, demand

```
Làm bước 04 theo docs/specs/M1-sim-core.md §2–§5 và economic-model §2–§3.

Plan mode trước.

- types/state.ts, types/commands.ts đúng §2–§3 của spec (được thêm trường, liệt kê trong summary).
- engine.ts: createGame (tạo công ty, góp vốn qua ledger, mở cửa hàng ban đầu của AI ở ngày 0 qua cùng logic với OpenStore), enqueue, step, runDays. Dùng immer produce. Thứ tự tick đúng §4; các system chưa làm thì để stub rỗng có TODO trỏ tới bước 05/06.
- commands/: registry + từng command với validate/apply. Ở bước này implement đầy đủ OpenStore, CloseStore, SetPrice, SetStaff, SetWage, SetMarketingBudget, SetQualityTier; TakeLoan/RepayLoan để bước 05.
- systems/demand.ts: utility, log-sum-exp, maxTravelKm, nhiễu lognormal với rng('demand', day). Ghi store.today.demand.
- hashState, checkInvariants (các bất biến có thể kiểm tại thời điểm này).

Test: property cho share (economic-model §13 mục 4–5), determinism 360 ngày, command bị từ chối không làm đổi hash state ngoài events.
```

## 05 — Operations, brand, finance, month close

```
Làm bước 05: economic-model §4–§8 và §10.

Plan mode trước, liệt kê từng bút toán sẽ phát sinh mỗi ngày và cuối tháng (đối chiếu bảng §6).

- operationsSystem: capacity, served/lost, doanh thu + giá vốn ghi sổ hằng ngày (làm tròn qua money helper), morale, skill, serviceLevel, mtd.
- brandSystem: adstock bão hòa + truyền miệng.
- financeDailySystem: thấu chi tự rút/tự trả, cộng dồn số dư.
- TakeLoan/RepayLoan với spread theo leverage; annuity.
- monthCloseSystem: thứ tự §10; thuế lũy kế + chuyển lỗ §6.2; nộp thuế cuối quý; gia hạn thuê 12 tháng có index CPI; khấu hao; đóng cửa hàng §6.1; distress/bankrupt §8 kèm GameEvent nêu 3 khoản chi lớn nhất tháng và dự báo tiền mặt 13 tuần.
- Lưu MonthlyStatements vào state.statements.

Test: bảng §8 của spec (operations, finance, statements) + một kịch bản "phá sản cố ý" (giá rất thấp, lương rất cao) phải dẫn tới bankrupt trong ≤ 8 tháng và có event giải thích.
Chạy 3 năm seed 42 và in ra P&L năm của từng công ty để tôi xem độ hợp lý.
```

## 06 — AI đối thủ, balance runner, hiệu chỉnh

```
Làm bước 06: economic-model §9 và §14, spec §6.

- systems/ai.ts: luật tháng cho 3 personality, chỉ đọc dữ liệu công khai (selectors), phát Command qua cùng đường validate như người chơi.
- packages/balance: CLI, 4 bot, CSV, bảng tóm tắt, balance:smoke.
- Chạy hiệu chỉnh: pnpm balance -- --seeds 100 --years 3 --bots all. So với mục tiêu §14.
  Nếu lệch: chỉ chỉnh tham số trong content (outsideUtility, betas, rent, unitCost…), KHÔNG chỉnh công thức. Mỗi lần chỉnh ghi vào docs/balance-log.md: tham số, giá trị cũ → mới, lý do, kết quả trước/sau. Tối đa 6 vòng; nếu vẫn không đạt, dừng và báo cáo cái gì cản trở.

Dùng subagent balance-analyst để đọc CSV và đề xuất chỉnh tham số.
```

## 07 — UI tối giản

```
Làm bước 07 theo spec §7.

Plan mode trước, kèm phác thảo layout bằng ASCII.

- Sim chạy trong Web Worker (apps/web/src/worker.ts); store Zustand ở main thread chỉ giữ snapshot + statements.
- Vòng lặp tốc độ: 1× = 1 ngày/giây, 4×, 16×; tạm dừng khi có event distress.
- Các màn hình: thanh trên, bản đồ 3×3, bảng cửa hàng có sửa inline, tab Tài chính, tab Thị trường, panel sự kiện.
- Định dạng tiền bằng money.toDisplay; không làm toán tiền ở UI.
- Playwright smoke test: mở trang, mở 1 cửa hàng ở quận c, chạy 2 tháng ở 16×, thấy P&L có Revenue > 0.
Nếu có công cụ trình duyệt, hãy tự chụp màn hình và sửa chỗ vỡ layout.
```

## 08 — Review độc lập

```
Dùng subagent economist-reviewer review toàn bộ packages/sim-core đối chiếu docs/economic-model.md: mọi công thức, đơn vị, thứ tự tick, bút toán. Sau đó dùng subagent code-reviewer kiểm tra quy tắc trong CLAUDE.md (determinism, Money, ledger, không any).
Tổng hợp phát hiện thành bảng (mức độ, file:line, vấn đề, cách sửa), sửa các mục mức cao, ghi phần còn lại vào docs/open-questions.md. Cập nhật checklist nghiệm thu ở docs/specs/M1-sim-core.md §9.
```
