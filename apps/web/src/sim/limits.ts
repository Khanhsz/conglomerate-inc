/** Giới hạn thanh kéo (M1.5 A5): khớp đúng luật validate của lệnh ở thời điểm hiện tại. */
import {
  AI_PRICE_TICK,
  MAX_MARKETING_BUDGET_MONTHLY,
  MAX_STAFF_PER_STORE,
  PRICE_BAND,
  WAGE_BAND,
  type GameState,
  type LoadedContent,
} from '@game/sim-core';

export interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface Limits {
  /** Cent, bước 5 cent: [0.3, 5] × Pref hiện tại. */
  readonly price: Range;
  /** Cent, bước $10: [0.5, 3] × lương thị trường hiện tại. */
  readonly wage: Range;
  readonly staff: Range;
  /** Cent, thang bậc ba trên thanh kéo. */
  readonly marketing: Range;
  /** Cent, bước $1,000; ngân hàng có thể từ chối khoản vay theo leverage. */
  readonly loan: Range;
}

const WAGE_STEP = 1_000;

export function sliderLimits(state: GameState, content: LoadedContent): Limits {
  const pref = content.industry.referencePrice * state.macro.priceIndex;
  const market = state.macro.marketWageMonthly * state.macro.priceIndex;
  return {
    price: {
      min: Math.ceil((PRICE_BAND.min * pref) / AI_PRICE_TICK) * AI_PRICE_TICK,
      max: Math.floor((PRICE_BAND.max * pref) / AI_PRICE_TICK) * AI_PRICE_TICK,
      step: AI_PRICE_TICK,
    },
    wage: {
      min: Math.ceil((WAGE_BAND.min * market) / WAGE_STEP) * WAGE_STEP,
      max: Math.floor((WAGE_BAND.max * market) / WAGE_STEP) * WAGE_STEP,
      step: WAGE_STEP,
    },
    staff: { min: content.industry.minStaffPerStore, max: MAX_STAFF_PER_STORE, step: 1 },
    marketing: { min: 0, max: MAX_MARKETING_BUDGET_MONTHLY, step: 1_000 },
    loan: { min: 100_000, max: 50_000_000, step: 100_000 },
  };
}
