// Hằng số cấu trúc và luật game (economic-model §0, spec §3). Tham số cân bằng nằm trong packages/content.
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

/** Độ dài số trong id (`store-000007`): sort theo chuỗi trùng thứ tự tạo. */
export const ID_DIGITS = 6;

/** Giới hạn validate của lệnh (spec §3). */
export const MAX_STORES_PER_DISTRICT = 3;
export const MAX_STAFF_PER_STORE = 40;
/** Giá ∈ [min, max] × Pref hiện tại. */
export const PRICE_BAND = { min: 0.3, max: 5 } as const;
/** Lương ∈ [min, max] × lương thị trường hiện tại. */
export const WAGE_BAND = { min: 0.5, max: 3 } as const;
/** $1M, đơn vị cent. */
export const MAX_MARKETING_BUDGET_MONTHLY = 100_000_000;

/** Hợp đồng thuê gia hạn (và index CPI) mỗi 12 tháng (economic-model §6). */
export const RENT_TERM_DAYS = DAYS_PER_YEAR;
/** Phí chấm dứt hợp đồng thuê khi đóng cửa hàng = 3 tháng thuê (economic-model §6.1). */
export const LEASE_TERMINATION_MONTHS = 3;
/** AI làm tròn giá tới 5 cent (economic-model §9). */
export const AI_PRICE_TICK = 5;
