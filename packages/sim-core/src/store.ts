/** Giá trị rỗng cho số liệu tháng của cửa hàng. */
import { ZERO } from './money';
import type { StoreLastMonth, StoreMonthToDate } from './types/state';

export function emptyMonthToDate(): StoreMonthToDate {
  return {
    demand: 0,
    served: 0,
    capacity: 0,
    days: 0,
    revenue: ZERO,
    cogs: ZERO,
    wagesAccrued: 0,
    rentAccrued: 0,
  };
}

export function emptyLastMonth(): StoreLastMonth {
  return {
    month: -1,
    demand: 0,
    served: 0,
    capacity: 0,
    days: 0,
    revenue: ZERO,
    cogs: ZERO,
    wages: ZERO,
    rent: ZERO,
    depreciation: ZERO,
  };
}
