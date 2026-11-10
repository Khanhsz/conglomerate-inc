# Spec M1 — Sim core + prototype chơi được

Mục tiêu: một thành phố, ngành cà phê, người chơi + 3 AI, chạy 2–3 năm game deterministic với báo cáo tài chính đúng, có balance runner và UI tối giản để chơi thử.

Công thức: `docs/economic-model.md`. Kiến trúc: `docs/adr/0001-architecture.md`.

---

## 1. Cấu trúc repo
```
/
├─ CLAUDE.md
├─ package.json            # scripts: typecheck, test, test:sim, lint, balance, balance:smoke, dev
├─ pnpm-workspace.yaml
├─ tsconfig.base.json      # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├─ docs/
├─ packages/
│  ├─ sim-core/
│  │  └─ src/
│  │     ├─ index.ts             # public API (xem §5)
│  │     ├─ constants.ts
│  │     ├─ money.ts
│  │     ├─ rng.ts
│  │     ├─ hash.ts              # stableStringify + fnv1a64
│  │     ├─ types/               # state.ts, commands.ts, content.ts, statements.ts
│  │     ├─ ledger/              # accounts.ts, post.ts, balances.ts, statements.ts
│  │     ├─ commands/            # một file / command + registry.ts
│  │     ├─ systems/             # macro.ts, demand.ts, operations.ts, brand.ts, finance.ts, monthClose.ts, ai.ts
│  │     ├─ engine.ts            # createGame, step, runDays, enqueue
│  │     └─ selectors.ts         # đọc state cho UI/balance (không mutate)
│  ├─ content/
│  │  ├─ industries/coffee.yaml
│  │  ├─ scenarios/m1-default.yaml
│  │  └─ src/                    # schema.ts (Zod), load.ts
│  └─ balance/
│     └─ src/                    # cli.ts, bots/*.ts, report.ts
└─ apps/web/                     # Vite + React
```

## 2. Kiểu dữ liệu chính (tối thiểu; được thêm trường nếu cần, ghi lại)
```ts
type Id = string;
type Money = number & { readonly __brand: 'Money' };   // cent, safe integer

interface GameState {
  schemaVersion: 1;
  contentRef: { industryId: string; scenarioId: string; contentVersion: string };
  seed: number;                            // opts.seed thắng scenario.seed
  clock: { day: number };
  macro: MacroState;                       // economic-model §1
  city: { districtIds: Id[] };             // hình học lấy từ content
  companies: Record<Id, Company>; companyIds: Id[];
  stores: Record<Id, Store>; storeIds: Id[];
  loans: Record<Id, Loan>; loanIds: Id[];
  ledger: { entries: JournalEntry[]; nextEntryId: number;
            balances: Record<Id, AccountBalances> };  // số dư hiện tại, cập nhật trong post(); snapshot cho UI không kèm entries
  statements: Record<Id, MonthlyStatements[]>;   // theo companyId
  commandQueue: QueuedCommand[];           // { enqueuedDay, command } — không có id: lệnh bị từ chối chỉ để lại event
  events: GameEvent[];                     // union theo `kind`: commandRejected, storeOpened, storeClosed, distress, bankrupt, cashWarning, loanTaken, loanRepaid
  nextIds: { store: number; loan: number };
}

interface Company {
  id: Id; name: string; kind: 'player' | 'ai'; personality?: 'discount' | 'balanced' | 'premium';
  status: 'active' | 'distress' | 'bankrupt'; distressMonths: number;
  qualityTier: 'basic' | 'standard' | 'premium';
  brandAwareness: number;
  marketingBudgetMonthly: Money; marketingAccrued: number;   // cent dạng float, reset khi chốt tháng
  tax: { preTaxProfitYTD: Money; taxBookedYTD: Money; lossCarryforward: Money };
  overdraft: { limit: Money; dailyBalanceSum: Money };
}

interface Store {
  id: Id; companyId: Id; districtId: Id; openedDay: number; status: 'open' | 'closed'; closedDay?: number;
  price: Money; staff: number; wageMonthly: Money; rentMonthly: Money; rentResetDay: number;
  capex: Money; accumDep: Money;
  morale: number; skill: number; serviceLevel: number;
  today: { demand: number; served: number; lost: number; capacity: number };  // ghi đè mỗi ngày
  mtd: { demand: number; served: number; capacity: number; revenue: Money; cogs: Money;
         wagesAccrued: number; rentAccrued: number }; // reset đầu tháng; *Accrued là cent dạng float
  lastMonth: { revenue: Money; cogs: Money; wages: Money; rent: Money };  // cho AI §9 và UI
  negContributionMonths: number;
}

interface JournalEntry {
  id: number; day: number; companyId: Id; memo: string; refId?: Id;
  lines: { account: AccountCode; debit: Money; credit: Money }[];  // mỗi dòng đúng một vế > 0
}
```
Id sinh ra có đệm số 0 (`store-000010`, `loan-000003`) để sort theo chuỗi trùng thứ tự tạo. Type tách riêng `SegmentId` / `QualityTier` / `Personality` dù cùng có giá trị `premium`. Trường optional phải bỏ hẳn key, không gán `undefined`.
Doanh thu và giá vốn hằng ngày ghi **một bút toán cho mỗi công ty mỗi ngày** (gộp các cửa hàng); chi tiết theo cửa hàng nằm ở `store.mtd`.

## 3. Commands (M1)
| type | payload | validate chính |
|---|---|---|
| `OpenStore` | `{ districtId }` | company active; đủ cash + hạn mức thấu chi còn lại ≥ capex; tối đa 3 cửa hàng/quận/công ty |
| `CloseStore` | `{ storeId }` | thuộc công ty, đang mở |
| `SetPrice` | `{ storeId \| 'all', price }` | price ∈ [0.3, 5] × Pref hiện tại |
| `SetStaff` | `{ storeId, staff }` | integer ∈ [minStaff, 40] |
| `SetWage` | `{ storeId \| 'all', wageMonthly }` | ∈ [0.5, 3] × lương thị trường |
| `SetMarketingBudget` | `{ monthly }` | ≥ 0, ≤ $1M |
| `SetQualityTier` | `{ tier }` | tier tồn tại |
| `TakeLoan` | `{ principal, termMonths }` | economic-model §7.1; công ty chưa phá sản; cần ít nhất một tháng đã chốt |
| `RepayLoan` | `{ loanId }` | khoản vay của công ty, còn dư nợ; tiền mặt + hạn mức thấu chi còn lại ≥ dư nợ × (1 + phí) |

Command bị từ chối → push `GameEvent { kind: 'commandRejected', reason }`, không thay đổi gì khác.
Cửa hàng mới mặc định: giá = Pref, lương = lương thị trường, skill = newHireSkill; staff, morale, serviceLevel lấy từ `industry.newStore` (coffee: 4, 0.5, 0.6). Lệnh được chuẩn hóa qua JSON khi `enqueue` và validate lại ngay trước khi apply.
Trạng thái ban đầu: người chơi `qualityTier = standard`, marketing 0. Cửa hàng ban đầu của AI: giá = target theo personality (làm tròn 5 cent), staff = `industry.aiInitialStaff` (coffee: 5), lương theo personality, marketing 0 tới ngày 30; capex trừ vào `startingCash` qua cùng logic `OpenStore`. Chi tiết: economic-model §9.

## 4. Thứ tự tick (mỗi ngày)
```
0. nếu day % 30 == 0 và day > 0: (đã chốt tháng ở cuối ngày trước) → AI ra quyết định tháng (§9)
1. applyQueuedCommands
2. macroSystem            (cập nhật priceIndex; bỏ qua ở ngày 0)
3. brandSystem            (dùng spend + served hôm qua)
4. demandSystem           (share, demand, noise)
5. operationsSystem       (capacity, served, doanh thu + giá vốn ghi sổ, cộng dồn lương/thuê/marketing, morale, skill, serviceLevel)
6. financeDailySystem     (thấu chi tự trả, cộng dồn số dư thấu chi; việc rút thấu chi nằm trong helper thanh toán — economic-model §7.2)
7. clock.day += 1
8. nếu clock.day % 30 == 0: monthCloseSystem (economic-model §10; bút toán ghi day = clock.day − 1)
```
Thứ tự duyệt thực thể: luôn theo `companyIds` / `storeIds` đã sort.

## 5. Public API `@game/sim-core`
```ts
createGame(content: LoadedContent, opts?: { seed?: number }): GameState
enqueue(state, cmd: Command): GameState                // chỉ thêm vào queue
step(state, content): GameState                       // 1 ngày
runDays(state, content, n, onMonth?: (s) => void): GameState
validateCommand(state, content, cmd): { ok: true } | { ok: false; reason: string }
selectors: { balances(state, companyId), latestStatements(state, companyId), storeTable(state, companyId), marketShares(state, content) }
expectedDemand(state, content): { byStore, potential, captured }   // cầu kỳ vọng trước nhiễu (economic-model §3.3)
hashState(state): string
checkInvariants(state, content): InvariantViolation[]  // dùng trong test và balance:smoke
```

## 6. Balance runner (`packages/balance`)
- CLI: `pnpm balance -- --seeds 100 --years 3 --bots all --out out/balance.csv`.
- Mỗi run: scenario m1-default, người chơi điều khiển bởi một bot; 3 AI như thường.
- Bot (mỗi bot là hàm `(state, content) => Command[]`, gọi ngày đầu mỗi tháng):
  - `idle` — không làm gì sau khi mở 1 cửa hàng ở quận `c`.
  - `random` — mỗi tháng 1–3 lệnh ngẫu nhiên hợp lệ (dùng `rng('bot')`).
  - `sensible` — giống AI balanced, mở rộng khi ROI > 3%/tháng và cash ≥ 2× capex.
  - `aggressiveDebt` — vay tối đa có thể và mở 1 cửa hàng/tháng.
- Xuất CSV mỗi tháng mỗi công ty: seed, bot, month, companyId, stores, revenue, ebitda, netIncome, cash, debt, status, avgUtilization, marketShare.
- In bảng tóm tắt: tỷ lệ phá sản theo bot, trung vị vốn chủ năm cuối, trung vị số cửa hàng, thời gian chạy.
- `balance:smoke`: 10 seed × 2 năm × tất cả bot; exit code ≠ 0 nếu `checkInvariants` trả lỗi ở bất kỳ tháng nào hoặc có NaN.

## 7. UI tối giản (`apps/web`)
- Thanh trên: ngày/tháng/năm, tiền mặt, tốc độ (⏸ 1× 4× 16×), trạng thái công ty.
- Bản đồ lưới 3×3: mỗi quận hiện dân số, số cửa hàng theo màu công ty; click quận → nút "Mở cửa hàng (capex $…)".
- Bảng cửa hàng của người chơi: quận, giá, staff, lương, khách/ngày, utilization, serviceLevel, lãi đóng góp tháng trước; sửa giá/staff/lương inline (gửi command).
- Tab Tài chính: P&L 12 tháng gần nhất (bảng), bảng cân đối hiện tại, lưu chuyển tiền tệ tháng trước.
- Tab Thị trường: thị phần theo công ty (biểu đồ), giá trung bình mỗi đối thủ.
- Panel sự kiện: cảnh báo distress, lệnh bị từ chối, AI mở/đóng cửa hàng.
- Sim chạy trong Web Worker. Không cần đẹp; cần đúng và đọc được.

## 8. Test bắt buộc
| Nhóm | Test |
|---|---|
| money | làm tròn half-away-from-zero; `mul` với số âm; ném lỗi khi vượt safe integer |
| rng | cùng seed+stream+day → cùng chuỗi; stream khác → chuỗi khác; phân phối normal có mean≈0, sd≈1 (10k mẫu, dung sai 0.05) |
| content | coffee.yaml + m1-default.yaml qua Zod; mix tổng = 1 (±1e-9); lỗi rõ ràng khi thiếu trường |
| ledger | property: mọi entry cân; bảng cân đối luôn cân sau chuỗi bút toán ngẫu nhiên hợp lệ |
| demand | property: Σ share + share0 = 1; tăng giá không tăng share của mình (fast-check trên betas/giá ngẫu nhiên) |
| operations | served ≤ capacity; lương cao hơn → morale target cao hơn; morale hội tụ |
| finance | annuity payment khớp công thức; thấu chi giữ Cash ≥ 0; thuế lũy kế + chuyển lỗ (ví dụ số cụ thể) |
| statements | CFO + CFI + CFF = ΔCash; NetIncome tháng = Δ RetainedEarnings |
| engine | determinism: 2 năm, seed 42, cùng chuỗi command → `hashState` bằng nhau; seed khác → khác |
| calibration | economic-model §14 (đánh dấu `describe.skipIf(!process.env.CALIBRATE)` nếu chậm > 5s) |
| performance | 3 năm, 60 cửa hàng, 4 công ty < 1.5s trên Node (bench, không fail CI, in kết quả) |

## 9. Tiêu chí nghiệm thu M1
- [ ] `pnpm typecheck && pnpm test && pnpm balance:smoke` xanh.
- [ ] `pnpm balance -- --seeds 100 --years 3 --bots all` chạy xong, có CSV và bảng tóm tắt.
- [ ] Mục tiêu hiệu chỉnh §14 đạt, hoặc ghi rõ lệch bao nhiêu trong `docs/balance-log.md`.
- [ ] Chơi được trên web 15 phút: mở cửa hàng, chỉnh giá/lương, thấy P&L thay đổi hợp lý.
- [ ] Phá sản có báo cáo nguyên nhân (3 khoản chi lớn nhất + dự báo tiền mặt).
- [ ] `docs/open-questions.md` liệt kê mọi giả định Claude phải tự đặt.
