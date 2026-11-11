import type { Department } from '@game/sim-core';

/** Chức năng mỗi phòng mở ra (spec M1.6 §6). `ready = false`: phòng mở được nhưng chức năng đang làm. */
export const DEPARTMENT_INFO: {
  readonly [D in Department]: { readonly does: string; readonly ready: boolean };
} = {
  hr: {
    does: 'Danh sách cửa hàng và tình trạng nhân sự; chính sách đào tạo, phúc lợi, thưởng, lương chuẩn (tab Nhân sự).',
    ready: true,
  },
  product: {
    does: 'Menu nhiều sản phẩm, giá niêm yết, chọn nhà cung cấp, R&D sản phẩm mới, giá vốn và đánh giá sao.',
    ready: false,
  },
  finance: {
    does: 'Báo cáo hợp nhất theo cửa hàng, biểu đồ, tư vấn vay, tái cấp vốn, hạn mức tín dụng (tab Tài chính).',
    ready: true,
  },
  marketing: {
    does: 'Kênh marketing theo quận và phân khúc, bản đồ nhận biết, hiệu quả (ROI) từng kênh.',
    ready: false,
  },
  board: {
    does: 'Tuyển C-level (COO, CHRO, CPO, CMO, CFO) để tự điều hành các phòng.',
    ready: false,
  },
};
