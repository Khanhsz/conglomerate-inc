# ADR-0003 — Thế giới nhiều thành phố và đối thủ có hồ sơ, có vòng đời

Ngày: 2026-11-12. Trạng thái: chấp nhận. Spec: `docs/specs/M1.8-atlas-rivals.md`. Công thức: economic-model §2, §5, §9, §18, §20.

## Bối cảnh
- M1 có một thành phố 3×3 và ba đối thủ khai sẵn theo ba kiểu cố định. Seed cố định nên ván nào cũng giống nhau.
- Đối thủ bị loại (phá sản hoặc đóng hết cửa hàng) thì không ai vào thay; thị trường trống dần.
- Yêu cầu mới: 7 thành phố, mỗi nơi 30–35 địa điểm chia ba khu; đối thủ sinh ngẫu nhiên theo seed, là doanh nghiệp thật trong mô phỏng; ai bị loại thì có đối thủ mới gia nhập.
- GDD xếp "đa thành phố" ở M4. Phần bản đồ được kéo lên sớm theo yêu cầu; M&A, đa ngành vẫn ở M4.

## Quyết định
1. **Thế giới là danh sách phẳng các địa điểm.**
   - Content: `scenario.cities[]`. YAML cũ dạng `city:` vẫn nạp được, chuẩn hóa thành một phần tử.
   - `worldDistricts(content)` trả mọi địa điểm: thành phố theo thứ tự scenario, địa điểm theo thứ tự trong thành phố. Kết quả cache theo content (WeakMap), không nằm trong state.
   - Mọi chỉ số theo địa điểm (ô nhận biết `e × S + s`, bảng với tới) dùng vị trí trong danh sách này. Id địa điểm duy nhất toàn cục.
   - Một thành phố thì danh sách trùng với `city.districts` cũ, nên M1 giữ nguyên từng cent.
2. **Thành phố tách biệt về cầu.** Khách chỉ mua trong thành phố mình sống. Truyền miệng và ngân sách thương hiệu chung tính theo từng thành phố (economic-model §5). Vĩ mô, trụ sở, quản trị chung vẫn ở cấp công ty.
3. **Công ty là tập động.** `companyIds` có thể dài thêm trong ván (đối thủ gia nhập). Id sinh từ `nextIds.company`. Công ty bị loại vẫn ở lại trong state (sổ sách còn nguyên), chỉ đổi `status`.
4. **Đối thủ mang hồ sơ trong state.** `AiCompany.profile` chứa mọi tham số hành vi; luật AI chỉ đọc hồ sơ, không tra bảng kiểu cố định.
   - Đối thủ khai sẵn bằng `personality` nhận hồ sơ suy ra từ `aiPersonalities` và `aiRules`, không dùng rng.
   - Đối thủ sinh ngẫu nhiên lấy hồ sơ từ dải trong `industry.rivalGenerator` bằng `ctx.rng('rival:<n>')`.
5. **Ra / vào thị trường là một system** (`entrySystem`) chạy ở bước 0 của tick đầu tháng, trước luật AI. Scenario không khai `competition` thì system không làm gì.
6. **Scenario `atlas` sinh bằng script** (`packages/content/scripts/build-atlas.ts`) từ bảng mô tả gọn; file YAML đầu ra được commit và có test so khớp. Thành phố cố định giữa các ván; chỉ đối thủ là ngẫu nhiên.

## Hệ quả
- `GameState.schemaVersion` tăng lên 2 (thêm `profile`, `market`, `nextIds.company`, trạng thái `exited`). Chưa có save nên không cần migration.
- Snapshot của web chỉ dựng chi tiết thành phố đang xem; worker nhận thêm message `viewCity`.
- Hiệu năng: khoảng 225 địa điểm và 15–25 công ty. Cầu duyệt ứng viên theo từng thành phố và dùng bảng với tới đã cache. Bench thêm kịch bản atlas.
- Cân bằng: mục tiêu §14 vẫn đo trên `m1-default`. Atlas có bộ mục tiêu riêng, do balance-analyst đề xuất và người dùng duyệt.
- Bảng màu công ty phải đủ cho số đối thủ cùng có mặt trong một thành phố (tối đa 5 + người chơi); màu gắn với công ty từ lúc thành lập.

## Phương án đã cân nhắc
- **Mỗi thành phố một state riêng:** tách bạch nhưng công ty hoạt động nhiều thành phố phải gộp sổ; bỏ.
- **Sinh thành phố ngẫu nhiên theo seed:** đa dạng hơn nhưng không cân bằng và kiểm thử được; người dùng chọn thành phố thiết kế sẵn.
- **Giữ ba kiểu đối thủ cố định, chỉ đổi tên:** không đáp ứng yêu cầu "mỗi đối thủ một doanh nghiệp riêng".
