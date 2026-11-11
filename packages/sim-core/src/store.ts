/** Giá trị rỗng cho số liệu tháng của cửa hàng. */
import { sub, sum, ZERO, type Money } from './money';
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
    trainingAccrued: 0,
    benefitsAccrued: 0,
    amenitiesAccrued: 0,
    amenitiesSetup: ZERO,
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
    training: ZERO,
    benefits: ZERO,
    bonus: ZERO,
    amenities: ZERO,
  };
}

/** Lãi đóng góp = doanh thu − giá vốn − lương (gồm đào tạo, phúc lợi, thưởng) − thuê (economic-model §9.3, §16). */
export function storeContribution(m: StoreLastMonth): Money {
  return sub(m.revenue, sum([m.cogs, m.wages, m.rent, m.training, m.benefits, m.bonus, m.amenities]));
}
