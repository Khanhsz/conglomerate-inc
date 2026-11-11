/**
 * Màn hình cửa hàng (M1.7, spec M1.7 §3): đánh giá sao theo tiêu chí và thị phần khu vực. Hàm thuần, không đổi kinh tế.
 */
import { segmentIdsOf } from '../awareness';
import { candidateUtility, demandCandidates, distanceKm, logitShares } from '../systems/demand';
import type { CompanyId, LoadedContent } from '../types/content';
import type { GameState, StoreId } from '../types/state';

export type ReviewCriterion = 'price' | 'product' | 'service' | 'atmosphere';
export const REVIEW_CRITERIA: readonly ReviewCriterion[] = ['price', 'product', 'service', 'atmosphere'];

export interface StoreReviews {
  /** Sao 1–5 theo bước nửa sao. */
  readonly stars: { readonly [C in ReviewCriterion]: number };
  readonly overall: number;
  /** Số khách tháng trước, để hiện "dựa trên N khách". */
  readonly basedOn: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Điểm x ∈ [0,1] → sao = 1 + 4x, làm tròn nửa sao. */
export const toStars = (x: number): number => Math.round(2 * (1 + 4 * clamp01(x))) / 2;

/**
 * Giá: x = 0.5 − 0.5·ln(P/Pref)/ln 2 (giá tham chiếu → 3 sao, nửa giá → 5, gấp đôi → 1);
 * Sản phẩm: x = Q; Phục vụ: x = W; Không gian: phần trọng số tiện ích đang bật (atmosphereScore).
 */
export function storeReviews(
  state: GameState,
  content: LoadedContent,
  storeId: StoreId,
): StoreReviews | null {
  const store = state.stores[storeId];
  const company = store ? state.companies[store.companyId] : undefined;
  if (!store || !company) return null;
  const pref = content.industry.referencePrice * state.macro.priceIndex;
  const scores: { readonly [C in ReviewCriterion]: number } = {
    price: 0.5 - (0.5 * Math.log(store.price / pref)) / Math.LN2,
    product: content.industry.qualityTiers[company.qualityTier].quality,
    service: store.serviceLevel,
    atmosphere: atmosphereScore(content, store.amenities),
  };
  const stars = {
    price: toStars(scores.price),
    product: toStars(scores.product),
    service: toStars(scores.service),
    atmosphere: toStars(scores.atmosphere),
  };
  const mean = REVIEW_CRITERIA.reduce((a, c) => a + stars[c], 0) / REVIEW_CRITERIA.length;
  return { stars, overall: Math.round(mean * 10) / 10, basedOn: Math.round(store.lastMonth.served) };
}

/** Không gian: Σ reviewWeight tiện ích đang bật / Σ reviewWeight mọi tiện ích (0 nếu content không có tiện ích). */
export function atmosphereScore(content: LoadedContent, active: readonly string[]): number {
  let on = 0;
  let all = 0;
  for (const id of Object.keys(content.industry.storeAmenities).sort()) {
    const w = content.industry.storeAmenities[id]?.reviewWeight ?? 0;
    all += w;
    if (active.includes(id)) on += w;
  }
  return all > 0 ? on / all : 0;
}

export interface AreaShare {
  /** null = "không mua". */
  readonly companyId: CompanyId | null;
  readonly share: number;
}

/**
 * Lượt mua của dân quận nơi có cửa hàng, chia theo công ty (gồm "không mua"), trọng số N·f theo phân khúc.
 * Cùng công thức logit với expectedDemand (economic-model §3.3). Tổng = 1.
 */
export function areaShares(state: GameState, content: LoadedContent, storeId: StoreId): AreaShare[] | null {
  const store = state.stores[storeId];
  const { industry, scenario } = content;
  const e = scenario.city.districts.findIndex((d) => d.id === store?.districtId);
  const origin = scenario.city.districts[e];
  if (!store || !origin) return null;
  const segmentIds = segmentIdsOf(content);
  const candidates = demandCandidates(state, content);
  const byCompany = new Map<CompanyId, number>();
  let outside = 0;
  let total = 0;
  for (let s = 0; s < segmentIds.length; s++) {
    const segmentId = segmentIds[s];
    const segment = segmentId === undefined ? undefined : industry.segments[segmentId];
    if (segmentId === undefined || !segment) continue;
    const visits = origin.pop * (origin.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
    if (visits === 0) continue;
    const reach = candidates.filter(
      (c) => distanceKm(scenario.city, origin, c.district) <= segment.maxTravelKm,
    );
    const utilities = reach.map((c) =>
      candidateUtility(
        segmentId,
        segment,
        state.macro.incomeIndex,
        c,
        distanceKm(scenario.city, origin, c.district),
        e * segmentIds.length + s,
      ),
    );
    const { outside: o, shares } = logitShares(segment.outsideUtility, utilities);
    total += visits;
    outside += visits * o;
    reach.forEach((c, i) =>
      byCompany.set(c.companyId, (byCompany.get(c.companyId) ?? 0) + visits * (shares[i] ?? 0)),
    );
  }
  if (total === 0) return [{ companyId: null, share: 1 }];
  return [
    ...state.companyIds
      .filter((id) => byCompany.has(id))
      .map((id) => ({ companyId: id, share: (byCompany.get(id) ?? 0) / total })),
    { companyId: null, share: outside / total },
  ];
}
