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

> M1.6: với nhiều sản phẩm, `βq·Q − βp·ln(P/Pref)` được thay bằng inclusive value của menu (§17.3); `A_c` thay bằng `A_{c,e,s}` (§18.1). Cấu hình mặc định cho kết quả đúng bằng công thức trên.

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

> M1.6: phúc lợi cộng vào morale_target; thưởng cộng vào wageRatio (§16.3–16.4).

### 4.3 Kỹ năng
`skill_j ← min(1, skill_j + industry.skillGainPerDay)` mỗi ngày (kể cả ngày vừa tuyển: phần trộn do tuyển đã áp ngay trong lệnh SetStaff); mỗi lần tuyển thêm Δ người: `skill_j ← (skill_j × staff_old + skill0 × Δ) / staff_new`, `skill0 = industry.newHireSkill` (0.4). Giảm staff không đổi skill.

> M1.6: đào tạo nhân hệ số cho skillGainPerDay và cộng vào newHireSkill (§16.2).

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

> M1.6: nhận biết theo quận và phân khúc, nhiều kênh (§18). Chỉ dùng kênh `general` thì đúng bằng công thức trên.

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

> M1.6: giá vốn tính theo sản phẩm và nhà cung cấp (§17.2); văn phòng và phòng ban là chi phí thêm (§15); overhead chung giữ nguyên.

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

> M1.6: hạn mức tín dụng của phòng Tài chính thay hạn mức mặc định khi được đặt (§19.1).

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

1. Ghi lương, thuê, marketing, overhead, khấu hao, lãi vay/thấu chi, trả góp. M1.6, cùng bước, theo thứ tự: đào tạo và phúc lợi (§16) → thưởng (§16.4, sau lương và thuê) → thuê và overhead văn phòng (§15.1) → chi phí cố định phòng ban (§15.2) → lương, phúc lợi và thưởng C-level (§19.2) → R&D (§17.5) → phí cam kết tín dụng (§19.1).
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
| 6150 | OfficeRent (M1.6) | Expense |
| 6200 | Marketing | Expense |
| 6300 | Depreciation | Expense |
| 6400 | Admin | Expense |
| 6410–6450 | DeptHr, DeptProduct, DeptFinance, DeptMarketing, DeptBoard (M1.6, §15.2) | Expense |
| 6600 | ResearchAndDevelopment (M1.6, §17.5) | Expense |
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

---

# Phần M1.6 — Văn phòng, phòng ban và Ban điều hành
Spec: `docs/specs/M1.6-office-departments.md`. Nguyên tắc chung cho §15–§19:
- **Cấu hình mặc định giữ nguyên M1.** Không văn phòng, menu chỉ có sản phẩm chính, chỉ dùng kênh marketing tổng hợp, không chính sách nhân sự, không hạn mức tín dụng. Với cấu hình này, ledger và báo cáo **giống hệt từng cent** so với M1. Có test hồi quy cho điều này.
- Mọi tham số mới nằm trong `coffee.yaml` (industry) hoặc scenario. Giá trị ghi ở đây là **đề xuất khởi đầu để hiệu chỉnh**, không phải số thực nghiệm.
- Mọi khoản chi đi qua helper thanh toán §7.2. Khoản cộng dồn theo ngày đi theo đúng quy ước §6 (float cent, làm tròn khi ghi sổ cuối tháng).

## 15. Văn phòng và phòng ban
### 15.1 Văn phòng
- `LeaseOffice { districtId, size }`, `size` ∈ `office.sizes`. Mỗi công ty có tối đa 1 văn phòng.
  - Capex sửa sang: `office.sizes[size].fitOut × priceIndex`. Ghi Nợ PPE / Có Cash. Khấu hao như cửa hàng (§6, `usefulLifeMonths`).
  - Thuê: `rentMonthly = district.rentMonthly × sizes[size].rentMultiplier × priceIndex`, cố định theo hợp đồng lúc thuê, gia hạn có index mỗi 12 tháng như cửa hàng. Cộng dồn ngày, cuối tháng ghi Nợ **OfficeRent (6150)** / Có Cash.
  - Overhead văn phòng: `sizes[size].overheadMonthly × priceIndex`, cộng dồn ngày, cuối tháng ghi Nợ Admin (6400) / Có Cash.
- `ReleaseOffice` (dùng khi chuyển hoặc nâng cấp văn phòng):
  - xử lý như đóng cửa hàng §6.1: ghi giảm GTCL vào LossOnDisposal, phí phá hợp đồng = 3 tháng thuê;
  - phòng ban và Ban điều hành đóng theo, C-level nghỉ với trợ cấp (§19.2).
  - Lệnh chuyển văn phòng ở UI = `ReleaseOffice` rồi `LeaseOffice` trong cùng tick; phòng ban phải mở lại.
- Đề xuất `office.sizes`:

| size | slot | fitOut | rentMultiplier | overheadMonthly |
|---|---|---|---|---|
| small | 2 | $40,000 | 0.6 | $1,500 |
| medium | 4 | $80,000 | 1.0 | $3,000 |
| large | 5 (đủ mọi phòng) | $150,000 | 1.6 | $6,000 |

### 15.2 Phòng ban
- `dept` ∈ {`hr`, `product`, `finance`, `marketing`, `board`}. Mỗi phòng chiếm 1 slot văn phòng.
- `OpenDepartment { dept }`: cần có văn phòng, còn slot và phòng đó chưa mở.
  - Phí mở một lần `departments[dept].openingCost × priceIndex`: Nợ Dept<dept> / Có Cash ngay khi lệnh áp dụng.
  - Chi phí cố định `departments[dept].fixedMonthly × priceIndex`: cộng dồn ngày, cuối tháng ghi Nợ Dept<dept> / Có Cash.
- `CloseDepartment { dept }`: không hoàn phí mở; khoản cộng dồn tới ngày đóng vẫn ghi ở chốt tháng; chức năng của phòng tắt.
  - Chính sách đang đặt bởi phòng đó **trở về mặc định M1** từ ngày hôm sau: đào tạo, phúc lợi, thưởng về 0; kênh marketing ngoài kênh tổng hợp về 0; hạn mức tín dụng về thấu chi §7.2.
  - Menu và nhà cung cấp **giữ nguyên** (chỉ không sửa được nữa).
  - C-level phụ trách phòng nghỉ, có trợ cấp (§19.2).
- Tài khoản (Expense):

| Mã | Tên |
|---|---|
| 6410 | DeptHr |
| 6420 | DeptProduct |
| 6430 | DeptFinance |
| 6440 | DeptMarketing |
| 6450 | DeptBoard |

- Đề xuất `departments`:

| dept | openingCost | fixedMonthly |
|---|---|---|
| hr | $10,000 | $3,000 |
| product | $20,000 | $4,000 |
| finance | $10,000 | $3,000 |
| marketing | $15,000 | $3,500 |
| board | $20,000 | $2,000 (chưa gồm lương C-level) |

- **Khóa chức năng:** `validateCommand` từ chối lệnh thuộc phòng chưa mở, với lý do "cần phòng X". Lệnh M1 (giá, nhân viên, lương, marketing tổng hợp, tier, vay, trả nợ) **không** bị khóa.
- **Overhead chung §6** (`overheadBase × n^γo`) **giữ nguyên**; văn phòng và phòng ban là chi phí thêm (#56).

## 16. Phòng Nhân sự
Chính sách công ty: `company.hrPolicy = { wageRatio: number | null, trainingLevel: 0..3, benefitsLevel: 0..3, bonusRate: number }`. Mặc định `{ null, 0, 0, 0 }` (= M1). Lệnh `SetHrPolicy { …partial }` cần phòng `hr`.

### 16.1 Lương chuẩn và ghi đè
- `wageRatio ≠ null` thì mọi cửa hàng **không ghi đè lương** có `wageMonthly = round(wageRatio × marketWageMonthly × priceIndex)`. Giá trị này áp khi lệnh có hiệu lực, và đầu mỗi tháng (theo CPI).
- `SetWage` cho một cửa hàng bật `store.overrides.wage = true`. `ClearOverride { storeId, field: 'wage' }` tắt cờ và áp lương chuẩn ngay.
- `wageRatio` phải nằm trong dải validate của `SetWage` (0.5–3).

### 16.2 Đào tạo
- `trainingLevel = L` thì:
  - chi phí mỗi ngày: `trainingAccrued += staff_j × hrPolicies.trainingCostPerStaffMonthly[L] × priceIndex / 30`, cuối tháng ghi vào **Wages (6000)**;
  - `skillGain_eff = industry.skillGainPerDay × hrPolicies.trainingMult[L]` (thay §4.3);
  - `newHireSkill_eff = min(1, industry.newHireSkill + hrPolicies.trainingNewHire[L])`, dùng trong phép trộn khi tuyển (§4.3).
- Đề xuất: `trainingCostPerStaffMonthly = [$0, $20, $50, $100]`, `trainingMult = [1, 1.5, 2, 3]`, `trainingNewHire = [0, 0.05, 0.10, 0.15]`.

### 16.3 Phúc lợi
- `benefitsLevel = L` thì:
  - chi phí mỗi ngày: `benefitsAccrued += staff_j × wageMonthly_j × hrPolicies.benefitsShare[L] / 30`, cuối tháng ghi vào Wages;
  - `morale_target = clamp01( 1/(1+exp(−k_m(wageRatio_eff − 1))) + hrPolicies.benefitsMorale[L] )` (thay §4.2).
- Đề xuất: `benefitsShare = [0, 0.03, 0.06, 0.10]`, `benefitsMorale = [0, 0.05, 0.09, 0.12]`. Lợi ích giảm dần theo mức: phúc lợi rẻ hơn tăng lương ở mức thấp, đắt hơn ở mức cao.

### 16.4 Thưởng hiệu suất
- `bonusRate ∈ [0, hrPolicies.bonusRateMax]`, đề xuất max 0.2.
- Ở chốt tháng, sau bước ghi lương và thuê, mỗi cửa hàng nhận `bonus_j = round(bonusRate × max(0, contribution_j))`, ghi vào Wages. `contribution_j` tính như luật AI §9.3: doanh thu − giá vốn − lương − thuê **trước thưởng**, kể cả đào tạo và phúc lợi.
- Morale tháng sau: `wageRatio_eff = (wageMonthly_j + bonusPerHead_j) / (marketWageMonthly × priceIndex)`, với `bonusPerHead_j = bonus_j(tháng trước) / staff_j`.
- Khi `bonusRate = 0` thì `wageRatio_eff = wageRatio` (§4.2).

## 17. Phòng Sản phẩm
### 17.1 Danh mục
- `industry.ingredients[g].suppliers[]`: `{ id, unitPrice (cent float/đơn vị, trước CPI), quality ∈ [0,1] }`.
- `industry.products[i]`:
  - `category`, `recipe: { g: { qty, qualityWeight } }` với Σ `qualityWeight` = 1;
  - `qualityBonus ∈ [0, 0.2]`, `prepUnits > 0`;
  - `refPrice` (cent);
  - `starter: boolean`;
  - `rd: { cost, days }` cho sản phẩm không phải starter.
- **Sản phẩm chính** `core` (cà phê pha máy):
  - recipe `{ coffeeBase: { qty: 1, qualityWeight: 1 } }`, `qualityBonus 0`, `prepUnits 1`, `refPrice = referencePrice`, category `coffee`;
  - ingredient `coffeeBase` có 3 nhà cung cấp trùng tier M1: basic $0.675 / 0.35, standard $0.90 / 0.60, premium $1.35 / 0.85.
- **Tier M1 trở thành gói nhà cung cấp:** `qualityTiers[tier].supplierPreset: { g: supplierId }`. `SetQualityTier` (không khóa) đặt toàn bộ nhà cung cấp theo gói. `SetSupplier` (cần phòng `product`) đặt riêng từng nguyên liệu, và tier hiển thị thành "tùy chỉnh".

### 17.2 Chất lượng, giá vốn, giá bán
```
Q_i      = clamp01( Σ_g qualityWeight_{i,g} × quality(sup_c(g)) + qualityBonus_i )
unitCOGS_i = Σ_g qty_{i,g} × unitPrice(sup_c(g)) × priceIndex          (cent float)
P_{i,j}  = store.priceOverride[i] ?? company.listPrice[i]               (Money)
```
- Với `core` theo gói M1: `Q = qualityTiers[tier].quality` và `unitCOGS = unitCost × unitCostMultiplier × priceIndex`, đúng như M1.
- `SetPrice { storeId, price }` (M1, không khóa) = ghi đè giá `core` ở cửa hàng đó.
- `SetProductPrice { productId, price }` (cần `product`) đặt giá niêm yết công ty. `ClearOverride { storeId, field: 'price', productId }` cho cửa hàng về giá niêm yết.
- Dải giá mỗi sản phẩm: `[0.3, 5] × refPrice_i × priceIndex`, bước 5 cent (như §3).
- Giá vốn ghi sổ mỗi ngày: `round(Σ_i served_{i,j} × unitCOGS_i)`, Nợ COGS / Có Cash. Một bút toán mỗi cửa hàng mỗi ngày, như M1.

### 17.3 Cầu: nested logit (thay phần chất lượng và giá trong §3.1)
```
u_{s,i}   = βq_s·Q_i − βp_s,eff·ln(P_{i,j}/(refPrice_i·priceIndex)) + βcat_{s,cat(i)}
V_{s,j}   = IV_{s,j} + βb_s·A + −βd_s·D + βw_s·W         (thay βq·Q − βp·ln(P/Pref) ở §3.1)
IV_{s,j}  = |menu_j| = 1 ? u_{s,i} : λ·ln Σ_{i∈menu_j} exp(u_{s,i}/λ)      (log-sum-exp ổn định)
π_{i|j,s} = exp(u_{s,i}/λ) / Σ_{k∈menu_j} exp(u_{s,k}/λ)
demand_{i,j} = Σ_e Σ_s N_{e,s} × f_s × share_{e,s,j} × π_{i|j,s}
```
- `λ = industry.menuNesting` (đề xuất 0.6). `βcat_{s,c} = segment.categoryAffinity[c]`, mặc định 0 (`coffee` = 0 mọi phân khúc).
- Menu 1 sản phẩm thì nhánh đặc biệt `IV = u` cho kết quả **đúng bằng** M1, không qua exp/ln.
- **Tính chất:** thêm sản phẩm vào menu không làm giảm IV; IV ≤ max u + λ ln |menu|. Lợi ích từ độ rộng menu giảm dần.
- Nhiễu §3.4 nhân lên `demand_j` tổng, rồi chia theo π.

### 17.4 Công suất theo đơn vị pha chế
```
load_j    = Σ_i demandRealized_{i,j} × prepUnits_i
served_{i,j} = demandRealized_{i,j} × min(1, capacity_j / load_j)
```
Giới hạn là `Σ_i served_{i,j} × prepUnits_i ≤ capacity_j`. Với `core` (prepUnits 1) thì trùng §3.4. `fill_j` ở §3.5 = `Σ served / Σ demandRealized` (tính theo khách).

### 17.5 Menu và R&D
- `SetMenu { productIds }` (cần `product`): áp cho mọi cửa hàng. Gồm 1–`industry.maxMenuSize` (8) sản phẩm đã mở khóa; luôn phải có ít nhất 1 sản phẩm.
- `StartResearch { productId }` (cần `product`, mỗi công ty 1 dự án cùng lúc):
  - chi phí `rd.cost × priceIndex` dàn đều theo ngày: `rdAccrued += cost/days`, cuối tháng ghi Nợ **R&D (6600)** / Có Cash;
  - sau `rd.days` ngày, sản phẩm được mở khóa;
  - `CancelResearch` dừng dự án, không hoàn phần đã chi.
- **Đánh giá sao** (chỉ giao diện; điểm `x ∈ [0,1]` → `stars = max(1, round(2·(1 + 4x))/2)`):
  - Chất lượng: `x = Q_i`;
  - Giá trị: `x = σ(βq̄·Q_i − βp̄·ln(P/Pref) − c0)`, với β̄ là trung bình có trọng số dân số; `c0` trong content;
  - Biên lợi nhuận: `x = clamp01((P − unitCOGS)/P)`;
  - Phổ biến: `x = π` trung bình theo khách / max π trong menu.

## 18. Phòng Marketing: kênh và vùng
### 18.1 Nhận biết theo quận và phân khúc
`A_{c,e,s}` thay `A_c` (§5). Utility §3.1 của khách sống ở quận e, phân khúc s dùng `βb_s · A_{c(j),e,s}`.

### 18.2 Kênh
- `industry.marketingChannels[ch] = { scope: 'city' | 'district', segmentWeight: {s: w ∈ [0,1]}, alpha, halfSaturationDaily }`.
- Kênh `general` = tham số §5 (`alpha`, `halfSaturationDaily`), `scope: city`, mọi trọng số 1. `SetMarketingBudget` (M1, không khóa) đặt ngân sách kênh `general`.
- `SetChannelBudget { channel, target: 'city' | districtId, monthly }` (cần `marketing`):
  - kênh `city` chỉ nhận target `city`;
  - kênh `district` nhận từng quận.
- Mỗi ngày:
```
spendDaily_{ch,e} = budget_{ch,target}/30                       (scope city: cùng một giá trị cho mọi quận)
lift_{ch,e,s} = alpha_ch × segmentWeight_{ch,s} × (1 − exp(−spendDaily_{ch,e}/(halfSat_ch × priceIndex)))
lift_{e,s}    = 1 − Π_ch (1 − lift_{ch,e,s})
A_{c,e,s} ← A + (1 − A) × lift_{e,s} − δ × A + γ × Σ_j served_j / cityPopulation      (clamp [0,1])
```
- Kênh city tác động như nhau lên mọi quận: tiếp cận toàn thành phố, giống M1.
- Chỉ có `general` thì `lift_{e,s} = lift` M1 và `A_{c,e,s} = A_c` ở mọi ô, **đúng bằng M1**. Thứ tự phép tính giữ nguyên.
- Chi phí cộng dồn mọi kênh vào Marketing (6200) như §6.
- Đề xuất các kênh:

| ch | scope | trọng số students/office/premium/other | alpha | halfSat/ngày |
|---|---|---|---|---|
| social | city | 1 / 0.6 / 0.4 / 0.5 | 0.012 | $80 |
| outdoor | district | 0.6 / 1 / 0.8 / 0.8 | 0.02 | $25 |
| flyers | district | 1 / 0.5 / 0.2 / 1 | 0.015 | $10 |
| events | district | 0.8 / 0.6 / 1 / 0.6 | 0.025 | $40 |

### 18.3 Hiệu quả (selector, không đổi state)
- Theo dõi `liftCum_{c,ch,e,s}`: phần nhận biết tăng thêm do kênh trong 30 ngày gần nhất. Phần chung của nhiều kênh chia theo tỷ lệ `lift_ch`.
- **Khách tăng thêm** của kênh = `expectedDemand(A) − expectedDemand(A − liftCum_ch)` trên các cửa hàng của công ty.
- **ROI** = `extra × (giá TB − giá vốn TB) × 30 / chi kênh 30 ngày`.

## 19. Phòng Tài chính và Ban điều hành
### 19.1 Tài chính
- **Báo cáo theo cửa hàng** (selector): P&L tháng của từng cửa hàng gồm doanh thu, giá vốn, lương (gồm đào tạo, phúc lợi, thưởng), thuê, khấu hao.
  - Các khoản cấp công ty (overhead, văn phòng, phòng ban, marketing, R&D, lãi, thuế) để riêng.
  - **Σ cửa hàng + cấp công ty = P&L công ty §11** (bất biến, có test).
  - Để làm được điều này, `store.mtd` thêm `depreciation`, `training`, `benefits`, `bonus`.
- **Tư vấn** (selector): với mỗi kỳ hạn tính `loanQuote`; khoản vay tối đa trước khi spread tăng bậc; leverage; DSCR = EBITDA 12 tháng / nghĩa vụ trả nợ 12 tháng; lãi / EBITDA; khuyến nghị theo luật.
- `RefinanceLoan { loanId, termMonths }` (cần `finance`): áp như `RepayLoan` (§7.1, có phí) rồi `TakeLoan` với gốc = gốc còn lại + phí, theo spread hiện tại. Validate như hai lệnh gộp lại.
- `SetCreditLine { limit }` (cần `finance`):
  - `limit ≤ max(overdraftFloor, creditLine.revenueMultiple × revenue_trailing3m)` và leverage ≤ `creditLine.maxLeverage`;
  - leverage = (Loans + Overdraft) / EBITDA năm; EBITDA năm ≤ 0 thì không cấp (không đo được khả năng trả nợ);
  - hạn mức áp dụng cho lãi thấu chi của cả tháng nếu đang có lúc chốt tháng;
  - khi đặt, hạn mức thấu chi §7.2 = `limit` thay công thức mặc định; mỗi lần chốt tháng xét lại, và nếu vượt mức tối đa mới thì cắt xuống;
  - lãi thấu chi dùng `overdraftSpread − creditLine.spreadDiscount`;
  - phí cam kết mỗi ngày `(limit − overdraft) × dailyRate(creditLine.commitmentFeeAnnual)`, cộng dồn, cuối tháng ghi InterestExpense.
  - `limit = 0` thì quay về §7.2.
  - Đề xuất: `revenueMultiple 2`, `maxLeverage 2`, `spreadDiscount 0.02`, `commitmentFeeAnnual 0.005`.

### 19.2 Ban điều hành (C-level)
- Cần phòng `board`. Vai trò: `coo` (cửa hàng: giá, nhân viên), `chro` (hr), `cpo` (product), `cmo` (marketing), `cfo` (finance). Vai trò chỉ tuyển được khi phòng tương ứng đã mở; riêng COO chỉ cần `board`.
- **Ứng viên:**
  - ngày đầu mỗi tháng, mỗi vai trò có `executives.candidatesPerRole` (3) ứng viên mới, sinh từ `rng('bod:<companyId>:<role>')`;
  - năng lực `stars ∈ {1..5}`, phân phối theo `executives.starWeights`;
  - lương đòi `salary = executives.baseSalaryMonthly × (0.6 + 0.2·stars) × priceIndex`, làm tròn tới $100;
  - mức phúc lợi tối thiểu `minBenefits ∈ {0..3}` = `max(0, stars − 2)`;
  - danh sách ứng viên nằm trong state và được thay mới mỗi tháng.
- **Tuyển:** `HireExecutive { role, candidateId, benefitsLevel }`, cần `benefitsLevel ≥ minBenefits`.
  - Lương cộng dồn ngày, cuối tháng ghi **DeptBoard (6450)**.
  - Phúc lợi = `executives.benefitsShare[level] × salary` (cùng tài khoản).
  - Mức 2–3 có thêm thưởng `executives.profitShare[level] × max(0, EBITDA tháng)` ở chốt tháng.
- **Cho nghỉ:** `DismissExecutive { role }` trả `executives.severanceMonths` (1) tháng lương ngay.
- **Tự điều hành:** `SetDelegation { role, enabled }`.
  - Ngày đầu tháng (cùng lúc AI §9), mỗi C-level đang bật sinh lệnh cho công ty. Lệnh đi qua `validateCommand` và **không chạm vào trường cửa hàng đang ghi đè** (`store.overrides`).
  - Luật theo vai trò và năng lực:

| Năng lực | Nhịp quyết định | Bộ luật |
|---|---|---|
| 1★ | 3 tháng/lần | luật AI §9 cho phần việc của vai trò |
| 2★ | 2 tháng/lần | như 1★ |
| 3★ | mỗi tháng | luật AI §9 |
| 4★ | mỗi tháng | luật AI §9, cộng luật mở rộng của vai trò (spec M1.6 §7) |
| 5★ | mỗi tháng | chọn phương án có lãi đóng góp kỳ vọng cao nhất trong tập ứng viên bằng `whatIf` / selector tương ứng |

- Đề xuất: `baseSalaryMonthly $8,000`, `starWeights [0.25, 0.3, 0.25, 0.15, 0.05]`, `benefitsShare [0, 0.1, 0.15, 0.2]`, `profitShare [0, 0, 0.01, 0.02]`.

### 19.3 AI (M1.6)
Mỗi personality có `office: { openAtStores, size, departments[] }`. Ngày đầu tháng, khi số cửa hàng ≥ `openAtStores`, AI thuê văn phòng và mở các phòng trong danh sách (tối đa 1 hành động/tháng). AI không tuyển C-level: luật AI chính là "ban điều hành" của nó. AI dùng gói nhà cung cấp theo tier, menu `core` và kênh `general`, cho tới khi spec hiệu chỉnh vòng 2 đổi lại (#57).
