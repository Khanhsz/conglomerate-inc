# Câu hỏi mở

Claude ghi vào đây mọi chỗ spec thiếu hoặc mâu thuẫn, và mọi giả định phải tự đặt.

| # | Tài liệu / mục | Vấn đề | Đề xuất | Mức độ | Quyết định |
|---|---|---|---|---|---|
| 1 | economic-model §3.1 | Giá P_j có nên chiết khấu theo incomeIndex không? Hiện chọn qua η_s, mặc định 0 (tắt) ở M1. | Giữ tắt ở M1, bật ở M3 cùng macro động | ghi chú | Chấp nhận |
| 2 | coffee.yaml, §9 | Ước lượng tĩnh (12 cửa hàng, ngày 0, A=0.05, W=0.6): thị phần ngành 0.51; khách/cửa hàng/ngày 283–500; EBITDA balanced 10–16%, premium 24–26%, **discount −7% đến +3%**. Discount chịu cùng chi phí cố định/nhân sự nhưng không có lợi thế năng suất nên cấu trúc yếu. | Cân nhắc thêm `customersPerStaffPerDay` theo tier (basic cao hơn, phục vụ nhanh) hoặc rent thấp hơn ở quận ngoại vi; quyết định ở bước 06 khi có bot chạy động | nên sửa | |
| 3 | §14 | Mục tiêu "biên EBITDA balanced 8–25%" đo trên ước lượng tĩnh; khi chạy động, brand và serviceLevel thay đổi sẽ dịch kết quả. | Đo lại bằng balance runner ở bước 06 | ghi chú | |
