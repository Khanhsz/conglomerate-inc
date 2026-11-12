/** Nhãn tiếng Việt dùng chung cho UI (gom từ các component, tránh lặp). */
import type { PolicyLevel, QualityTier, Reach } from '@game/sim-core';

/** Phân khúc khách (id trong industry pack). Id lạ hiển thị nguyên id. */
const SEGMENT_LABEL: Readonly<Record<string, string>> = {
  students: 'sinh viên',
  office: 'dân văn phòng',
  premium: 'khách cao cấp',
  other: 'khách khác',
};
export const segmentName = (id: string): string => SEGMENT_LABEL[id] ?? id;

/** Mức chính sách (đào tạo, phúc lợi…). */
export const LEVEL_NAME: { readonly [L in PolicyLevel]: string } = {
  0: 'Không',
  1: 'Cơ bản',
  2: 'Tốt',
  3: 'Cao cấp',
};

/** Phong cách của đối thủ theo bậc chất lượng (M1.8). */
export const TIER_STYLE: { readonly [T in QualityTier]: string } = {
  basic: 'giá rẻ',
  standard: 'cân bằng',
  premium: 'cao cấp',
};

/** Phạm vi hoạt động của đối thủ. */
export const REACH_LABEL: { readonly [R in Reach]: string } = {
  local: 'chuỗi địa phương',
  regional: 'chuỗi liên thành phố',
  national: 'chuỗi toàn quốc',
};
