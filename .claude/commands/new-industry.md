---
description: Tạo khung industry pack mới (dùng từ M4)
argument-hint: <industry-id> <mô tả ngắn>
---

Tạo industry pack mới với id và mô tả: $ARGUMENTS

1. Đọc `packages/content/industries/coffee.yaml` và schema Zod trong `packages/content/src/schema.ts`.
2. Đề xuất (chưa ghi file) bộ tham số cho ngành mới: phân khúc khách, betas, giá tham chiếu, giá vốn, năng suất nhân viên, tier chất lượng, personality AI. Giải thích ngắn lý do kinh tế của từng nhóm tham số và nêu cơ chế nào của engine ngành này cần mà engine chưa có.
3. Sau khi tôi duyệt: tạo file YAML, scenario thử nghiệm, test validate content, và chạy `/balance-report 30 2` cho ngành mới.

Không sửa sim-core. Nếu ngành cần cơ chế mới, ghi vào `docs/open-questions.md`.
