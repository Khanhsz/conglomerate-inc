/** Cầu multinomial logit (economic-model §2–§3). */
import type { CityDef, DistrictDef, LoadedContent, SegmentDef } from '../types/content';
import type { System } from '../types/context';
import type { GameState, StoreId } from '../types/state';

/** Khoảng cách Manhattan giữa hai quận; cùng quận = sameDistrictKm (economic-model §2). */
export function distanceKm(city: CityDef, from: DistrictDef, to: DistrictDef): number {
  if (from.id === to.id) return city.sameDistrictKm;
  return (Math.abs(from.x - to.x) + Math.abs(from.y - to.y)) * city.districtSizeKm;
}

export interface UtilityInputs {
  readonly quality: number;
  /** Giá bán và giá tham chiếu, cùng đơn vị (cent, có thể là số thực). */
  readonly price: number;
  readonly refPrice: number;
  readonly awareness: number;
  readonly distanceKm: number;
  readonly serviceLevel: number;
}

/** U = βq·Q − βp,eff·ln(P/Pref) + βb·A − βd·D + βw·W, với βp,eff = βp / incomeIndex^η (economic-model §3.1). */
export function storeUtility(segment: SegmentDef, incomeIndex: number, x: UtilityInputs): number {
  const { q, p, b, d, w } = segment.betas;
  const eta = segment.incomeElasticityOfPriceSensitivity;
  const priceBeta = eta === 0 ? p : p / incomeIndex ** eta;
  return (
    q * x.quality -
    priceBeta * Math.log(x.price / x.refPrice) +
    b * x.awareness -
    d * x.distanceKm +
    w * x.serviceLevel
  );
}

/** Thị phần logit có lựa chọn ngoài, tính bằng log-sum-exp (trừ max trước khi exp) để không tràn số. */
export function logitShares(
  outsideUtility: number,
  utilities: readonly number[],
): { outside: number; shares: number[] } {
  let max = outsideUtility;
  for (const u of utilities) if (u > max) max = u;
  const outsideWeight = Math.exp(outsideUtility - max);
  const weights = utilities.map((u) => Math.exp(u - max));
  let denominator = outsideWeight;
  for (const wgt of weights) denominator += wgt;
  return { outside: outsideWeight / denominator, shares: weights.map((wgt) => wgt / denominator) };
}

export interface DemandSnapshot {
  /** Lượt khách kỳ vọng mỗi ngày của từng cửa hàng đang mở. */
  readonly byStore: Record<StoreId, number>;
  /** Σ N·f: tổng lượt có thể mua nếu không ai chọn "không mua". */
  readonly potential: number;
  /** Σ demand của mọi cửa hàng. */
  readonly captured: number;
}

interface Candidate {
  readonly id: StoreId;
  readonly district: DistrictDef;
  readonly x: Omit<UtilityInputs, 'distanceKm'>;
}

/** Cầu kỳ vọng (trước nhiễu) của mọi cửa hàng đang mở (economic-model §3.3). Chỉ đọc state. */
export function expectedDemand(state: GameState, content: LoadedContent): DemandSnapshot {
  const { industry, scenario } = content;
  const { city } = scenario;
  const refPrice = industry.referencePrice * state.macro.priceIndex;
  const districts = new Map(city.districts.map((d) => [d.id, d]));

  const candidates: Candidate[] = [];
  for (const id of state.storeIds) {
    const store = state.stores[id];
    if (!store || store.status !== 'open') continue;
    const company = state.companies[store.companyId];
    const district = districts.get(store.districtId);
    if (!company || company.status === 'bankrupt' || !district) continue;
    candidates.push({
      id,
      district,
      x: {
        quality: industry.qualityTiers[company.qualityTier].quality,
        price: store.price,
        refPrice,
        awareness: company.brandAwareness,
        serviceLevel: store.serviceLevel,
      },
    });
  }

  const byStore: Record<StoreId, number> = {};
  for (const c of candidates) byStore[c.id] = 0;
  let potential = 0;
  let captured = 0;
  const segmentIds = Object.keys(industry.segments).sort();

  for (const origin of city.districts) {
    for (const segmentId of segmentIds) {
      const segment = industry.segments[segmentId];
      if (!segment) continue;
      const visits = origin.pop * (origin.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
      potential += visits;
      if (visits === 0) continue;
      const reachable: Candidate[] = [];
      const utilities: number[] = [];
      for (const c of candidates) {
        const km = distanceKm(city, origin, c.district);
        if (km > segment.maxTravelKm) continue;
        reachable.push(c);
        utilities.push(storeUtility(segment, state.macro.incomeIndex, { ...c.x, distanceKm: km }));
      }
      const { shares } = logitShares(segment.outsideUtility, utilities);
      reachable.forEach((c, i) => {
        const demand = visits * (shares[i] ?? 0);
        byStore[c.id] = (byStore[c.id] ?? 0) + demand;
        captured += demand;
      });
    }
  }
  return { byStore, potential, captured };
}

/**
 * Cầu thực tế = kỳ vọng × exp(σz − σ²/2), z ~ N(0,1) từ stream riêng của từng cửa hàng (quyết định #19),
 * nên mở thêm cửa hàng không làm lệch nhiễu của cửa hàng khác. Ghi `store.today.demand`.
 */
export const demandSystem: System = (draft, ctx) => {
  const snapshot = expectedDemand(draft, ctx.content);
  const sigma = ctx.content.industry.dailyDemandNoise;
  for (const id of draft.storeIds) {
    const store = draft.stores[id];
    if (!store) continue;
    const expected = snapshot.byStore[id];
    if (expected === undefined) {
      store.today.demand = 0;
      continue;
    }
    const z = ctx.rng(`demand:${id}`).normal();
    store.today.demand = expected * Math.exp(sigma * z - (sigma * sigma) / 2);
  }
};
