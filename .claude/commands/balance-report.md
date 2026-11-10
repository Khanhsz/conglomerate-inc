---
description: Chạy balance runner và tóm tắt so với mục tiêu hiệu chỉnh
argument-hint: [số seed, mặc định 100] [số năm, mặc định 3]
---

Chạy `pnpm balance -- --seeds ${1:-100} --years ${2:-3} --bots all --out out/balance.csv`.

Sau đó dùng subagent balance-analyst phân tích `out/balance.csv` so với `docs/economic-model.md` §14.
Trình bày: bảng chỉ số (mục tiêu | hiện tại | đạt?), và tối đa 3 đề xuất chỉnh tham số. Không tự sửa file content trừ khi tôi đồng ý.

Tham số người dùng: $ARGUMENTS
