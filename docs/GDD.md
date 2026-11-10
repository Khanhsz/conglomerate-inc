# Game Design Document — Conglomerate Inc. (v0.1)

## 1. Elevator pitch
Khởi nghiệp với một quán cà phê, lớn thành chuỗi, tập đoàn đa ngành rồi nhà đầu tư — trong một nền kinh tế có chu kỳ thật sự. Mọi con số trên báo cáo tài chính đều truy được nguyên nhân.

## 2. Design pillars
1. **Quyết định có đánh đổi rõ ràng** — giá, lương, nợ, mở rộng đều hiện chi phí trên báo cáo.
2. **Kinh tế đáng tin, không phải kinh tế thật 100%** — dựa trên lý thuyết chuẩn, đơn giản hóa có chủ đích.
3. **Tăng trưởng theo tầng** — mỗi tầng đổi loại quyết định: Founder → Chain → Corporation → Conglomerate.
4. **Minh bạch dữ liệu** — người chơi luôn hỏi được "tại sao" (variance analysis, tooltip nguyên nhân).
5. **Mở rộng bằng dữ liệu** — ngành mới = file content mới, không sửa engine.

Mọi tính năng mới phải chỉ ra pillar nó phục vụ.

## 3. Người chơi mục tiêu
Người chơi Coffee Inc, Capitalism Lab, Startup Company; sinh viên kinh tế/quản trị. Phiên chơi 30–90 phút, chiến dịch 20–40 giờ.

## 4. Core loop
Quan sát (dashboard) → Quyết định (command) → Mô phỏng (tick ngày) → Báo cáo (chốt tháng) → Điều chỉnh.

- Tick = 1 ngày game. Tốc độ: tạm dừng, 1×(1 ngày/giây), 4×, 16×.
- Lịch game: 12 tháng × 30 ngày = 360 ngày/năm (đơn giản hóa có chủ đích, xem ADR-0001).
- Chốt sổ cuối mỗi tháng: P&L, bảng cân đối, lưu chuyển tiền tệ, KPI.

## 5. Tầng tiến trình
| Tầng | Điều kiện mở | Quyết định mới | Milestone |
|---|---|---|---|
| Founder | bắt đầu | giá, nhân sự, lương, marketing, mở/đóng cửa hàng, vay | M1–M2 |
| Chain | ≥ 5 cửa hàng | chuỗi cung ứng, quản lý vùng, nhượng quyền, VC | M2 |
| Corporation | doanh thu năm ≥ $20M | C-level, R&D, IPO, trái phiếu, ngành thứ 2 | M3–M4 |
| Conglomerate | niêm yết + ≥ 2 ngành | M&A, holding, bất động sản, danh mục đầu tư | M4 |

## 6. Phạm vi Milestone 1 (vertical prototype của sim-core)
- 1 thành phố (lưới 3×3 quận), 1 ngành (cà phê), 4 phân khúc khách (students, office, premium, other).
- Người chơi + 3 đối thủ AI (discount / balanced / premium).
- Hành động: mở/đóng cửa hàng, đặt giá, đặt số nhân viên, đặt lương, ngân sách marketing, chọn tier chất lượng, vay/trả nợ.
- Vĩ mô: hằng số theo scenario (lạm phát, lãi suất chính sách, chỉ số thu nhập). Mô hình động ở M3.
- Báo cáo tài chính đầy đủ từ sổ cái kép; thấu chi tự động; phá sản có cảnh báo.
- Balance runner headless + 4 bot.
- UI tối giản để chơi thử: bản đồ lưới, danh sách cửa hàng, P&L tháng, điều khiển tốc độ.

**Ngoài phạm vi M1:** tồn kho/hư hỏng, nhà cung cấp, nhiều thành phố, IPO, chứng khoán, C-level, sự kiện, save/load (chỉ cần serialize được), âm thanh, đồ họa đẹp.

## 7. Điều kiện thắng/thua (M1)
- Thua: phá sản (xem economic-model §8).
- Không có điều kiện thắng ở M1; hiển thị điểm = giá trị sổ sách vốn chủ + 5× EBITDA của 12 tháng gần nhất (tổng năm).

## 8. Lộ trình milestone
| Milestone | Nội dung | Cổng qua |
|---|---|---|
| M0 Tiền sản xuất | GDD, economic-model, CLAUDE.md, ADR, mô hình bảng tính | bảng tính cho chu kỳ lãi/lỗ hợp lý |
| M1 Sim core | spec `docs/specs/M1-sim-core.md` | 2 năm game deterministic, bất biến kế toán luôn đúng, bot không vỡ |
| M2 Vertical slice | tồn kho, nhà cung cấp, tutorial, UI đầy đủ 1 thành phố | 5 playtester chơi 60 phút, giải thích được lãi/lỗ |
| M3 Tài chính & vĩ mô | macro NK rút gọn, VC/IPO, chứng khoán, C-level | không bot nào thắng > 40% seed |
| M4 Đa ngành | industry pack thứ 2–3, đa thành phố, M&A, sự kiện | ngành thứ 3 thêm chủ yếu bằng dữ liệu |
| M5 Polish & ra mắt | cân bằng, UX, vi/en, Tauri, Early Access | phát hành |
