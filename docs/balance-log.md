# Nhật ký cân bằng

Mỗi vòng chỉnh tham số ghi một mục. Không chỉnh công thức ở đây.

## Mẫu
### Vòng N — YYYY-MM-DD
- Lệnh: `pnpm balance -- --seeds 100 --years 3 --bots all`
- Thay đổi: `coffee.yaml > segments.office.outsideUtility` 1.5 → 1.8
- Lý do: thị phần ngành 0.58 > mục tiêu 0.50
- Kết quả: thị phần 0.58 → 0.47; khách/cửa hàng/ngày 610 → 520; tỷ lệ phá sản bot random 0.62 → 0.66

---

### Vòng 0 — 2026-11-11 (mốc, chưa chỉnh)
- Lệnh: `pnpm balance -- --seeds 100 --years 3 --bots all --out out/balance-r0.csv` (5 bot gồm `none` = mốc đo §14; 315 s với 4 worker).
- Thay đổi: không (tham số như khi bắt đầu bước 06).
- Kết quả §14:
  | Chỉ số | Mục tiêu | Vòng 0 |
  |---|---|---|
  | Thị phần ngành năm 1 | [30%, 50%] | **72.3% ✗** |
  | Khách/cửa hàng/ngày năm 1 | [250, 650] | 371 ✓ |
  | Biên EBITDA AI balanced năm 1 | [8%, 25%] | 14.5% ✓ |
  | Bot random phá sản (3 năm) | ≥ 50% | 100% ✓ |
  | Bot sensible sống (3 năm) | ≥ 90% | 100% ✓ |
- Chẩn đoán (subagent balance-analyst):
  - Thị phần tăng từ 0.447 ở tháng 0 lên 0.823 ở tháng 11.
  - Khoảng một nửa do brand bão hòa (#9): A của AI đạt ~0.75. Nửa còn lại do AI mở 1 cửa hàng/tháng ngay từ tháng 1 (9 → 22 cửa hàng trong năm 1).
  - Việc mở rộng của AI bị giới hạn bởi tiền mặt, không phải ROI: quét `minMonthlyRoi` từ 0.02 tới 0.08 gần như không đổi gì.
  - Chỉ tăng `outsideUtility` thì thị phần về được mục tiêu nhưng cầu/cửa hàng tụt.
  - Ghi nhận thêm: AI bean (discount) phá sản ở 100% seed (lỗi cấu trúc #2); không chiến lược nào của người chơi thắng việc đứng yên.

### Vòng 1 — 2026-11-11
- Lệnh: `pnpm balance -- --seeds 100 --years 3 --bots all --out out/balance-r1.csv`.
- Thay đổi:
  - `coffee.yaml > segments.*.outsideUtility` +1.0 mỗi phân khúc: students 1.4 → 2.4, office 2.0 → 3.0, premium 2.4 → 3.4, other 2.8 → 3.8.
  - `coffee.yaml > aiRules.expansion.cashMultiple` 1.5 → 3.
- Lý do:
  - Bù phần brand bão hòa và phần tăng do có thêm cửa hàng.
  - Hãm AI mở rộng để cầu/cửa hàng và biên không tụt theo.
  - Mô hình thay thế của balance-analyst dự kiến: thị phần ~0.41, khách ~325, biên balanced ~15.7%.
