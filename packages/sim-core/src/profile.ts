/** Hồ sơ đối thủ suy từ bảng kiểu cố định của M1 (economic-model §9). Không dùng rng. */
import type { LoadedContent, Personality } from './types/content';
import type { RivalProfile } from './types/state';

/**
 * Hồ sơ của công ty khai sẵn: đúng các giá trị M1 (`aiPersonalities` + `aiRules`), luật mở rộng `averageRoi`,
 * không giới hạn thành phố. `maxPaybackMonths` không dùng với luật này.
 */
export function profileFromPersonality(content: LoadedContent, personality: Personality): RivalProfile {
  const { aiPersonalities, aiRules } = content.industry;
  const p = aiPersonalities[personality];
  return {
    source: 'personality',
    qualityTier: p.qualityTier,
    markup: p.markup,
    wageRatio: p.wageRatio,
    marketingShareOfRevenue: p.marketingShareOfRevenue,
    expansion: {
      rule: 'averageRoi',
      minMonthlyRoi: aiRules.expansion.minMonthlyRoi,
      cashMultiple: aiRules.expansion.cashMultiple,
      maxPaybackMonths: 0,
    },
    closeAfterNegativeMonths: aiRules.closeAfterNegativeMonths,
    reach: 'national',
    homeCityId: content.scenario.cities[0]?.id ?? '',
  };
}
