/** Giá trị rỗng cho số liệu tháng của cửa hàng. */
import { add, fromFloatCents, pct, sub, sum, ZERO, type Money } from './money';
import type { Store, StoreLastMonth, StoreMonthToDate } from './types/state';

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

/** Chi phí tháng của một cửa hàng từ số cộng dồn, đã làm tròn như khi ghi sổ. */
export interface StoreMonthCosts {
  readonly wages: Money;
  readonly rent: Money;
  readonly training: Money;
  readonly benefits: Money;
  /** Phí lắp đặt trong tháng + chi phí tháng (§21). */
  readonly amenities: Money;
  /** Thưởng §16.4: `bonusRate × max(0, lãi đóng góp trước thưởng)`. */
  readonly bonus: Money;
}

/**
 * Chi phí tháng của cửa hàng (dùng chung cho chốt tháng và số liệu tháng đang chạy, economic-model §16.4,
 * §21). Mỗi khoản cộng dồn làm tròn riêng, rồi tính thưởng trên lãi đóng góp dương trước thưởng.
 */
export function storeMonthCosts(mtd: StoreMonthToDate, bonusRate: number): StoreMonthCosts {
  const wages = fromFloatCents(mtd.wagesAccrued);
  const rent = fromFloatCents(mtd.rentAccrued);
  const training = fromFloatCents(mtd.trainingAccrued);
  const benefits = fromFloatCents(mtd.benefitsAccrued);
  const amenities = add(mtd.amenitiesSetup, fromFloatCents(mtd.amenitiesAccrued));
  const beforeBonus = sub(mtd.revenue, sum([mtd.cogs, wages, rent, training, benefits, amenities]));
  const bonus = beforeBonus > 0 ? pct(beforeBonus, bonusRate) : ZERO;
  return { wages, rent, training, benefits, amenities, bonus };
}

/**
 * Tháng đang chạy (chưa chốt sổ) dưới dạng bản ghi tháng: đúng số chốt tháng sẽ ghi nếu tháng kết thúc
 * hôm nay. Khấu hao để 0 (không thuộc lãi đóng góp; chỉ biết ở chốt tháng).
 */
export function storeMonthToDate(store: Store, month: number, bonusRate: number): StoreLastMonth {
  const m = store.mtd;
  return {
    month,
    demand: m.demand,
    served: m.served,
    capacity: m.capacity,
    days: m.days,
    revenue: m.revenue,
    cogs: m.cogs,
    ...storeMonthCosts(m, bonusRate),
    depreciation: ZERO,
  };
}
