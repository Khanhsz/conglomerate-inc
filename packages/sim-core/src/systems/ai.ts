/** Đối thủ AI (economic-model §9). Luật tháng làm ở bước 06; hiện chỉ có công thức giá target. */
import { AI_PRICE_TICK } from '../constants';
import { money, roundHalfAwayFromZero, type Money } from '../money';
import type { LoadedContent, Personality } from '../types/content';
import type { System } from '../types/context';

/** targetPrice = unitCost × tierMult × priceIndex × markup, làm tròn tới 5 cent. */
export function aiTargetPrice(content: LoadedContent, personality: Personality, priceIndex: number): Money {
  const { unitCost, qualityTiers, aiPersonalities } = content.industry;
  const p = aiPersonalities[personality];
  const raw = unitCost * qualityTiers[p.qualityTier].unitCostMultiplier * priceIndex * p.markup;
  return money(roundHalfAwayFromZero(raw / AI_PRICE_TICK) * AI_PRICE_TICK);
}

/** TODO(bước 06): quyết định tháng của AI (giá, nhân sự, lương, marketing, mở/đóng cửa hàng). */
export const aiSystem: System = () => {};
