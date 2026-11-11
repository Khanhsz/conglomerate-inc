# Economic Model Spec — v0.1 (Milestone 1)

Nguồn sự thật cho mọi công thức. Ký hiệu trong ngoặc `code:` là tên bắt buộc trong code.
Giá trị mặc định nằm trong `packages/content/industries/coffee.yaml` và `packages/content/scenarios/m1-default.yaml`; con số trong tài liệu này chỉ để minh họa.

Quy ước: `t` = ngày, `m` = tháng. Tiền tính bằng cent (Money). Biến không có đơn vị tiền là `number` (float) được phép.

---

## 0. Thời gian
- 1 năm = 12 tháng × 30 ngày (`DAYS_PER_MONTH = 30`, `MONTHS_PER_YEAR = 12`).
- `clock = { day: number }` tính từ 0. `month = floor(day / 30)`, `year = floor(month / 12)`.
- Tỷ lệ năm → ngày: `dailyRate = (1 + annualRate)^(1/360) − 1`.

## 1. Vĩ mô (M1: hằng số theo scenario)
| Biến | code | Ý nghĩa | Mặc định |
|---|---|---|---|
| π | `macro.inflationAnnual` | lạm phát năm | 0.03 |
| i | `macro.policyRateAnnual` | lãi suất chính sách | 0.04 |
| I | `macro.incomeIndex` | chỉ số thu nhập (1.0 = gốc) | 1.0 |
| CPI | `macro.priceIndex` | chỉ số giá, bắt đầu 1.0 | 1.0 |
| τ | `macro.corporateTaxRate` | thuế TNDN | 0.20 |
| w̄ | `macro.marketWageMonthly` | lương thị trường / nhân viên / tháng (Money, chưa nhân CPI) | 220000 (=$2,200) |

Mỗi ngày từ ngày 1: `priceIndex_t = priceIndex_{t-1} × (1 + dailyRate(π))`. Ngày 0 giữ `priceIndex = 1.0` (không cập nhật).
Các đại lượng danh nghĩa sau luôn được nhân `priceIndex` (danh sách cố định, không có cờ trong content): `industry.referencePrice`, `industry.unitCost`, `industry.overheadBaseMonthly`, `industry.brand.halfSaturationDaily`, `macro.marketWageMonthly`, `district.fitOutCost` (lúc mở), `district.rentMonthly` (lúc mở và khi gia hạn).
`incomeIndex` tăng cùng tốc độ CPI ở M1 (thu nhập thực không đổi). Ghi chú cho M3: khi bật η > 0 phải định nghĩa lại `incomeIndex` là thu nhập **thực**, vì Pref đã được index theo CPI.

**Interface cho M3:** `MacroSystem` là một system riêng; M1 implement `ConstantMacroSystem`. Các system khác chỉ đọc `state.macro`, không đọc scenario trực tiếp.

## 2. Thành phố, quận, phân khúc
- City = lưới `gridW × gridH` quận (M1: 3×3), mỗi quận cạnh `districtSizeKm` (2 km).
- Quận `d` có dân số `pop_d` và tỷ trọng phân khúc `mix_{d,s}` (Σ_s mix = 1).
- Quy mô phân khúc s tại quận d: `N_{d,s} = pop_d × mix_{d,s}` (người).
- Khoảng cách quận e → quận d (Manhattan):
  `D(e,d) = (|x_e − x_d| + |y_e − y_d|) × districtSizeKm`, với `D(d,d) = sameDistrictKm` (0.5).

## 3. Cầu — multinomial logit
### 3.1 Utility của phân khúc s ở quận e đối với cửa hàng j
```
U_{e,s,j} = βq_s · Q_j
          − βp_s · ln(P_j / Pref)
          + βb_s · A_{c(j)}
          − βd_s · D(e, d(j))
          + βw_s · W_j
```
| Ký hiệu | code | Miền |
|---|---|---|
| Q_j chất lượng | `store.quality` = `qualityTiers[tier].quality` | [0,1] |
| P_j giá bán (Money) | `store.price` | > 0 |
| Pref giá tham chiếu | `industry.referencePrice × priceIndex` | > 0 |
| A_c nhận biết thương hiệu của công ty c | `company.brandAwareness` | [0,1] |
| W_j mức phục vụ | `store.serviceLevel` | [0,1] |
| β·_s | `segment.betas.{q,p,b,d,w}` | ≥ 0 |

Lưu ý: dùng `ln(P/Pref)` để độ co giãn theo giá phụ thuộc tỷ lệ, không phụ thuộc đơn vị tiền. Giá phải được nhân `incomeIndex`? → Không; thu nhập ảnh hưởng qua `βp_s,eff = βp_s / incomeIndex^η_s` với `η_s = segment.incomeElasticityOfPriceSensitivity` (M1 mặc định 0, tức tắt).

### 3.2 Lựa chọn ngoài (không mua)
`U_{e,s,0} = segment.outsideUtility` (hằng số hiệu chỉnh, calibrated).

### 3.3 Thị phần và lượng khách kỳ vọng
Tập lựa chọn của (e,s) = mọi cửa hàng đang mở trong thành phố có `D(e,d(j)) ≤ segment.maxTravelKm`.
```
share_{e,s,j} = exp(U_{e,s,j}) / ( exp(U_{e,s,0}) + Σ_k exp(U_{e,s,k}) )
demand_j = Σ_e Σ_s  N_{e,s} × f_s × share_{e,s,j}
```
`f_s = segment.visitsPerPersonPerDay`.
Tính bằng log-sum-exp ổn định số học (trừ max trước khi exp).

### 3.4 Nhiễu và giới hạn công suất
- `demandRealized_j = demand_j × exp(σ·z − σ²/2)`, `z ~ N(0,1)` từ `rng('demand:<storeId>')` (mỗi cửa hàng một stream, mở thêm cửa hàng không làm lệch nhiễu của cửa hàng khác), `σ = industry.dailyDemandNoise` (0.05). Kỳ vọng không đổi.
- `served_j = min(demandRealized_j, capacity_j)` (số thực; doanh thu làm tròn ở bước ghi sổ).
- `lost_j = demandRealized_j − served_j`.

### 3.5 Mức phục vụ W (cập nhật cuối ngày, dùng cho ngày hôm sau)
```
fill_j = demandRealized_j > 0 ? served_j / demandRealized_j : 1
W_target = 0.5 × fill_j + 0.5 × staffQuality_j
W_j ← W_j + κw × (W_target − W_j)        κw = industry.serviceAdjustRate (0.2)
```
`staffQuality_j = morale_j × skill_j` (cả hai ∈ [0,1]).

Thứ tự trong ngày của một cửa hàng (operationsSystem): gia hạn thuê nếu đến hạn → capacity dùng morale **đầu ngày** → served/lost → bút toán doanh thu, giá vốn → cộng dồn lương, thuê → cập nhật W bằng `fill` hôm nay và `staffQuality` **đầu ngày** → cập nhật morale (§4.2) → cập nhật skill (§4.3).

## 4. Vận hành cửa hàng
### 4.1 Công suất
```
productivity_j = 0.7 + 0.6 × morale_j            ∈ [0.7, 1.3]
capacity_j = staff_j × industry.customersPerStaffPerDay × productivity_j
```
`staff_j` là số nguyên ≥ `industry.minStaffPerStore`.

### 4.2 Tinh thần (efficiency wage)
```
wageRatio_j = store.wageMonthly / (macro.marketWageMonthly × priceIndex)
morale_target = 1 / (1 + exp(−k_m × (wageRatio_j − 1)))        k_m = industry.moraleWageSensitivity (6)
morale_j ← morale_j + κm × (morale_target − morale_j)          κm = industry.moraleAdjustRate (0.05 / ngày)
```
Lương = thị trường → morale hướng về 0.5. Lương +20% → ≈ 0.77.

### 4.3 Kỹ năng
`skill_j ← min(1, skill_j + industry.skillGainPerDay)` mỗi ngày (kể cả ngày vừa tuyển: phần trộn do tuyển đã áp ngay trong lệnh SetStaff); mỗi lần tuyển thêm Δ người: `skill_j ← (skill_j × staff_old + skill0 × Δ) / staff_new`, `skill0 = industry.newHireSkill` (0.4). Giảm staff không đổi skill.

### 4.4 Chất lượng
Tier chọn ở cấp công ty cho M1 (`company.qualityTier`), áp cho mọi cửa hàng. Mỗi tier có `quality` và `unitCostMultiplier`.

## 5. Thương hiệu (adstock có bão hòa)
Cập nhật hằng ngày cho mỗi công ty:
```
spendDaily = company.marketingBudgetMonthly / 30                (Money → float để tính)
lift = α × (1 − exp(−spendDaily / (halfSat × priceIndex)))
A ← A + (1 − A) × lift − δ × A
```
`α = industry.brand.alpha`, `halfSat = industry.brand.halfSaturationDaily` (Money), `δ = industry.brand.decayPerDay`.
Thêm hiệu ứng truyền miệng nhỏ: `A ← A + γ × Σ_j served_j / cityPopulation`, `γ = industry.brand.wordOfMouth`, `cityPopulation = Σ_d pop_d`. Clamp [0,1].

## 6. Chi phí và ghi nhận
| Khoản | Khi nào | Công thức | Bút toán |
|---|---|---|---|
| Doanh thu | mỗi ngày | `round(served_j × P_j)` | Nợ Cash / Có Revenue |
| Giá vốn | mỗi ngày | `round(served_j × industry.unitCost × tierMult × priceIndex)` | Nợ COGS / Có Cash |
| Lương | cộng dồn mỗi ngày, ghi sổ cuối tháng | mỗi ngày `wagesAccrued_j += staff_j × wageMonthly / 30`; cuối tháng ghi `round(wagesAccrued_j)` | Nợ Wages / Có Cash |
| Thuê mặt bằng | cộng dồn mỗi ngày, ghi sổ cuối tháng | mỗi ngày cửa hàng mở `rentAccrued_j += store.rentMonthly / 30`; cuối tháng ghi `round(rentAccrued_j)`. `rentMonthly` cố định theo hợp đồng lúc mở, index khi gia hạn mỗi 12 tháng | Nợ Rent / Có Cash |
| Marketing | cộng dồn mỗi ngày, ghi sổ cuối tháng | mỗi ngày `marketingAccrued += company.marketingBudgetMonthly / 30`; cuối tháng ghi `round(marketingAccrued)` | Nợ Marketing / Có Cash |
| Quản trị chung | cuối tháng | `round(overheadBaseMonthly × priceIndex × nStores^γo)`, `nStores` = số cửa hàng đang mở lúc chốt | Nợ Admin / Có Cash |
| Khấu hao | cuối tháng | `floor(capex / usefulLifeMonths)` mỗi cửa hàng, tính từ tháng mở (tròn tháng); tháng thứ `usefulLifeMonths` lấy phần còn lại để AccumDep = capex, sau đó dừng | Nợ Depreciation / Có AccumDep |
| Mở cửa hàng | khi lệnh | `capex = district.fitOutCost × priceIndex` | Nợ PP&E / Có Cash |
| Đóng cửa hàng | khi lệnh | ghi giảm GTCL vào `LossOnDisposal`; phí phá hợp đồng = 3 tháng thuê | xem §6.1 |
| Lãi vay | cuối tháng | xem §7 | Nợ InterestExpense / Có Cash |
| Thuế | cuối tháng | xem §6.2 | Nợ IncomeTax / Có TaxPayable |
| Nộp thuế | cuối quý | số dư TaxPayable (âm → hoàn thuế, xem §6.2) | Nợ TaxPayable / Có Cash |

Các accumulator (`wagesAccrued`, `rentAccrued`, `marketingAccrued`) là `number` (cent dạng float) trong state, chỉ thành Money khi làm tròn lúc ghi sổ, rồi reset về 0. Cộng dồn theo ngày để giá trị đặt vào ngày chốt tháng không quyết định chi phí cả tháng.
Bút toán có số tiền bằng 0 thì bỏ qua (không ghi). Mọi khoản chi bằng Cash đi qua helper thanh toán ở §7.2.

`γo = industry.overheadExponent` (1.2) — **phi hiệu quả theo quy mô**, là cơ chế chống "quá dễ".
`rentMonthly` mặc định = `district.rentMonthly × priceIndex` tại thời điểm mở.

### 6.1 Đóng cửa hàng
```
Nợ AccumDep        = khấu hao lũy kế của cửa hàng
Nợ LossOnDisposal  = capex − khấu hao lũy kế
Có PP&E            = capex
Nợ Rent / Có Cash  = 3 × rentMonthly  (phí chấm dứt)
```

### 6.2 Thuế (lũy kế trong năm, có chuyển lỗ)
Tại mỗi lần chốt tháng:
```
taxableYTD = max(0, preTaxProfitYTD − lossCarryforward)
taxDueYTD  = round(τ × taxableYTD)
taxExpense_m = taxDueYTD − taxBookedYTD          (có thể âm để hoàn nhập trong năm, nhưng taxBookedYTD ≥ 0)
```
`taxExpense_m < 0` ghi ngược: Nợ TaxPayable / Có IncomeTax. TaxPayable được phép âm trong năm (khoản thuế phải thu). Cuối quý quyết toán hai chiều: số dư dương → Nợ TaxPayable / Có Cash; số dư âm → Nợ Cash / Có TaxPayable (hoàn thuế).
Cuối năm: nếu `preTaxProfitYear < 0` thì `lossCarryforward += −preTaxProfitYear`; ngược lại `lossCarryforward = max(0, lossCarryforward − preTaxProfitYear)`. Reset YTD.

## 7. Vay nợ
### 7.1 Khoản vay kỳ hạn
- Lệnh `TakeLoan { principal, termMonths ∈ {12,24,36,60} }`.
- Lãi năm: `rate = policyRate + spread(leverage)` cố định cho cả khoản vay.
- `leverage = (totalDebt + principal) / max(1, EBITDA_trailing12m)`; `totalDebt` = Loans + Overdraft. Nếu < 12 tháng lịch sử, annualize phần có; chưa có tháng nào đã chốt → từ chối với lý do "chưa có lịch sử EBITDA".
- `spread`: leverage ≤ 1 → 2%; ≤ 2 → 3.5%; ≤ 3 → 5%; > 3 → **từ chối** (trả `CommandRejected` với lý do). Bậc spread nằm trong scenario.
- Trả góp đều (annuity) hàng tháng: `payment = round(P × r / (1 − (1+r)^−n))`, `r = rate/12` (quy ước lãi đơn theo tháng, khác với `dailyRate` ở §0 — có chủ đích). Lãi kỳ = `round(gốc còn lại × r)` ghi InterestExpense, phần còn lại giảm Loans; kỳ cuối tất toán đúng gốc còn lại.
- Kỳ trả đầu tiên ở lần chốt tháng của tháng **kế tiếp** tháng nhận khoản vay; đủ `n` kỳ.
- `RepayLoan { loanId }` trả sớm toàn bộ gốc còn lại + phí `finance.earlyRepaymentFee` (1%), phí ghi InterestExpense.

### 7.2 Thấu chi tự động (overdraft)
- Mọi khoản chi bằng Cash đi qua một helper thanh toán duy nhất: phần Cash không đủ được ghi thẳng Có Overdraft **trong cùng bút toán** (Nợ Chi phí / Có Cash + Có Overdraft). Cash không bao giờ âm, kể cả giữa các bước của một tick và trong chốt tháng.
- Khoản chi bắt buộc do system phát sinh (giá vốn, lương, thuê, lãi, thuế…) được phép vượt hạn mức; distress xét ở chốt tháng (§8). Lệnh tự nguyện (`OpenStore`, `RepayLoan`) bị validate theo `cash + hạn mức còn lại`.
- Khi Cash > 0 và Overdraft > 0, cuối ngày tự trả: Nợ Overdraft / Có Cash.
- Hạn mức: `overdraftLimit = max(finance.overdraftFloor, 1 × revenue_trailing3m)`, tính lại ở mỗi lần chốt tháng; chưa đủ 3 tháng thì cộng phần đã có.
- Lãi: `dailyRate(policyRate + finance.overdraftSpread)` (8%) × tổng số dư cuối ngày trong tháng, ghi cuối tháng.

## 8. Mất khả năng thanh toán và phá sản
Tại chốt tháng, cho mỗi công ty:
- `overdraft > overdraftLimit` → trạng thái `distress` + cảnh báo nêu **3 khoản chi lớn nhất tháng** và dự báo tiền mặt 3 tháng.
- 2 lần chốt tháng liên tiếp ở `distress` → `bankrupt`. Người chơi: game over (hiện báo cáo nguyên nhân). AI: tất cả cửa hàng đóng (thanh lý: ghi giảm GTCL theo §6.1 nhưng **không** tính phí chấm dứt 3 tháng thuê), công ty rời thị trường. Công ty `bankrupt` bị mọi system bỏ qua từ đó (không tính lãi, không chốt tháng).
- Cảnh báo sớm (không phải distress): dự báo tiền mặt 13 tuần âm theo xu hướng 3 tháng gần nhất.
- Định nghĩa dự báo: `tiền ròng = Cash − Overdraft`; `xu hướng` = trung bình 3 tháng gần nhất (đã chốt, gồm tháng này) của `CFO − trả gốc` (không tính CFI vì mở cửa hàng là đầu tư tự nguyện một lần, không tính góp vốn và tiền vay mới vì không lặp lại); `dự báo(k tháng) = tiền ròng + k × xu hướng`. 3 tháng cho distress; 13 tuần = 91/30 tháng cho cảnh báo sớm.
- Hạn mức thấu chi được tính lại (§7.2) ngay trước bước xét distress.
- Thanh lý khi phá sản ghi vào ngày đầu tháng kế tiếp (sau khi báo cáo tháng đã chốt); công ty `bankrupt` không còn chốt tháng.

## 9. Đối thủ AI (M1)
Quyết định chạy vào ngày đầu mỗi tháng, đọc **cùng dữ liệu người chơi thấy** (không gian lận).
| Personality | qualityTier | target markup trên giá vốn | lương / thị trường | marketing / doanh thu |
|---|---|---|---|---|
| discount | basic | 3.7× | 0.95 | 2% |
| balanced | standard | 3.9× | 1.05 | 4% |
| premium | premium | 4.0× | 1.20 | 6% |

(Giá trị nằm trong `coffee.yaml > aiPersonalities`; bảng chỉ minh họa. Các ngưỡng của luật dưới đây nằm trong `coffee.yaml > aiRules`.)

Luật tháng (mỗi cửa hàng):
0. Trạng thái ban đầu (ngày 0): cửa hàng AI mở ở `targetPrice` làm tròn 5 cent, lương = `wageRatio × marketWageMonthly`, marketing = 0 cho tới lần quyết định đầu tiên ở ngày 30.
1. Giá: `targetPrice = unitCost × tierMult × priceIndex × markup`. `adjTarget = targetPrice × (1 + priceAdjust)` nếu utilization (`served/capacity` tháng trước) > `highUtilization`; `× (1 − priceAdjust)` nếu < `lowUtilization`; ngược lại giữ nguyên (không cộng dồn qua các tháng). Giá mới = `adjTarget` kẹp trong ±`maxPriceStep` giá hiện tại. Làm tròn tới 5 cent. (Tham số trong `coffee.yaml > aiRules`; hiện là 0.03, 0.95, 0.6, 0.05.)
2. Nhân sự: chọn staff để utilization dự kiến ≈ `targetUtilization` (0.85) dựa trên demand trung bình/ngày tháng trước, thay đổi tối đa ±`maxStaffStep` (2) người/tháng.
3. Đóng cửa hàng nếu lợi nhuận đóng góp (doanh thu − giá vốn − lương − thuê) âm `closeAfterNegativeMonths` (3) tháng liên tiếp.
3b. Lương: mỗi tháng đặt `wageMonthly = round(wageRatio × marketWageMonthly × priceIndex)`.

Luật công ty:
3c. Marketing: `marketingBudgetMonthly = round(marketingShareOfRevenue × doanh thu công ty tháng trước)`; bằng 0 nếu sau lần quyết định không còn cửa hàng nào.
4. Mở cửa hàng mới nếu: ROI đóng góp 3 tháng gần nhất trên capex > `expansion.minMonthlyRoi` (0.02/tháng) **và** cash ≥ `expansion.cashMultiple` (hiện 3, vòng hiệu chỉnh 1) × capex **và** không ở distress **và** tháng này không đóng cửa hàng nào. Công ty chưa có cửa hàng nào thì mở cửa hàng đầu tiên nếu đủ tiền (bootstrap, #48). Chọn quận có `Σ_s N_{d,s} × f_s / (1 + số cửa hàng trong quận)` cao nhất. Tối đa 1 cửa hàng/tháng.
5. Dùng `rng('ai:<companyId>')` chỉ để phá hòa khi chọn quận.

## 10. Chốt tháng — thứ tự
Chốt tháng chạy sau khi `clock.day` đã tăng (spec §4 bước 8), nên mọi bút toán chốt tháng ghi `day = clock.day − 1` và `MonthlyStatements.month = floor((clock.day − 1) / 30)`.

1. Ghi lương, thuê, marketing, overhead, khấu hao, lãi vay/thấu chi, trả góp.
2. Thuế (§6.2); cuối quý nộp thuế.
3. Tạo `MonthlyStatements` cho mỗi công ty từ ledger (§11).
4. Kiểm tra distress/bankrupt (§8).
5. AI ra quyết định cho tháng mới (§9) — thực ra chạy ở tick ngày đầu tháng mới, sau bước 4.

## 11. Báo cáo tài chính (tính từ ledger)
- **P&L tháng:** Revenue, COGS, GrossProfit, Wages, Rent, Marketing, Admin, EBITDA, Depreciation, LossOnDisposal, EBIT, Interest, PreTax, IncomeTax, NetIncome.
- **Bảng cân đối:** Cash, PP&E (gross), AccumDep, TotalAssets | Overdraft, Loans, TaxPayable, TotalLiabilities | ShareCapital, RetainedEarnings (= Σ NetIncome từ đầu), TotalEquity.
- **Lưu chuyển tiền tệ (gián tiếp):** NetIncome + Depreciation + LossOnDisposal ± ΔTaxPayable = CFO; CFI = −capex; CFF = góp vốn + vay − trả gốc ± Δoverdraft. Kiểm tra: CFO + CFI + CFF = ΔCash.
  Lấy từ ledger: `capex` = phát sinh Nợ PPE trong tháng; vay / trả gốc = phát sinh Có / Nợ Loans; góp vốn = phát sinh ròng ShareCapital; các Δ = số dư cuối − đầu tháng. Đẳng thức chỉ đúng khi khấu hao luôn ghi Nợ Depreciation / Có AccumDep và thanh lý ghi đúng §6.1.
- **RetainedEarnings** không có tài khoản riêng: = Σ số dư thu nhập − Σ số dư chi phí từ đầu (không có bút toán kết chuyển).
- **KPI** (mẫu số ≤ 0 → `null`, không bao giờ NaN/Infinity):
  | KPI | Công thức |
  |---|---|
  | gross margin | `grossProfit / revenue` |
  | EBITDA margin | `ebitda / revenue` |
  | utilization trung bình | do month close cung cấp (Σ served / Σ capacity các cửa hàng trong tháng) |
  | revenue/store | `round(revenue / storeCount)` (Money) |
  | ROE năm hóa | `12 × netIncome / totalEquity` cuối tháng |
  | netDebt/EBITDA | `(loans + overdraft − cash) / (12 × ebitda)`; âm = tiền ròng |

## 12. Hệ thống tài khoản (chart of accounts)
| Mã | Tên | Loại |
|---|---|---|
| 1000 | Cash | Asset |
| 1500 | PPE | Asset |
| 1590 | AccumulatedDepreciation | Asset (contra) |
| 2000 | Overdraft | Liability |
| 2100 | TaxPayable | Liability |
| 2500 | Loans | Liability |
| 3000 | ShareCapital | Equity |
| 4000 | Revenue | Income |
| 5000 | COGS | Expense |
| 6000 | Wages | Expense |
| 6100 | Rent | Expense |
| 6200 | Marketing | Expense |
| 6300 | Depreciation | Expense |
| 6400 | Admin | Expense |
| 6900 | LossOnDisposal | Expense |
| 7000 | InterestExpense | Expense |
| 8000 | IncomeTax | Expense |

Vốn ban đầu: Nợ Cash / Có ShareCapital = `companies[].startingCash` trong scenario (trước capex của cửa hàng ban đầu).

## 13. Bất biến (phải có property test)
1. Mỗi `JournalEntry`: Σ debit = Σ credit, mọi amount là safe integer > 0.
2. Mọi thời điểm: TotalAssets = TotalLiabilities + TotalEquity.
3. Cash ≥ 0 luôn đúng (thấu chi hấp thụ phần âm).
4. Với mọi (e,s): Σ_j share + share_0 = 1 (sai số ≤ 1e-9); mọi share ∈ [0,1].
5. Tăng `P_j` (giữ nguyên mọi thứ khác) không làm tăng `share_{e,s,j}`; không làm giảm share của cửa hàng khác.
6. `served_j ≤ capacity_j`, `served_j ≤ demandRealized_j`.
7. Không NaN/Infinity ở bất kỳ trường số nào của state sau mỗi tick.
8. Cùng scenario + seed + chuỗi command ⇒ `hashState` giống hệt sau N ngày.
9. CFO + CFI + CFF = ΔCash mỗi tháng.

## 14. Mục tiêu hiệu chỉnh (calibration test trong M1)
Với scenario `m1-default` đúng như file (3 AI mỗi bên 3 cửa hàng ban đầu, người chơi không có cửa hàng và không thao tác; AI chạy luật §9), đo trung bình 12 tháng đầu:
- Tổng thị phần ngành (1 − Σ share_0 có trọng số, theo demand logit **trước** giới hạn công suất) ∈ [0.30, 0.50].
- Khách **được phục vụ** (`served`)/cửa hàng/ngày trung bình ∈ [250, 650].
- Biên EBITDA **cấp công ty** của AI balanced ở năm 1 ∈ [8%, 25%].
- Bot `random` phá sản trong 3 năm ở ≥ 50% seed; bot `sensible` sống ở ≥ 90% seed.
Nếu không đạt, chỉnh `outsideUtility` và tham số trong content (không chỉnh công thức) và ghi lại trong `docs/balance-log.md`.
