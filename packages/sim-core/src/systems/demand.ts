/** Cầu multinomial logit (economic-model §2–§3). */
import { segmentIdsOf } from '../awareness';
import type { CityDef, DistrictDef, LoadedContent, SegmentDef, SegmentId } from '../types/content';
import type { System } from '../types/context';
import type { GameState, StoreId } from '../types/state';
import { worldOf, type World } from '../world';
import { isOut } from '../companyStatus';

/** Khoảng cách Manhattan giữa hai quận của cùng một thành phố; cùng quận = sameDistrictKm (economic-model §2). */
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

/** Từng thành phần của utility (có dấu), để giải thích cho người chơi; tổng = storeUtility. */
export interface UtilityParts {
  readonly quality: number;
  readonly price: number;
  readonly brand: number;
  readonly distance: number;
  readonly service: number;
  /** Tiện ích cửa hàng (M1.7, §21). */
  readonly atmosphere: number;
  readonly total: number;
}

export function utilityParts(
  segment: SegmentDef,
  incomeIndex: number,
  x: UtilityInputs,
  atmosphere = 0,
): UtilityParts {
  const { q, p, b, d, w } = segment.betas;
  const eta = segment.incomeElasticityOfPriceSensitivity;
  const priceBeta = eta === 0 ? p : p / incomeIndex ** eta;
  return {
    quality: q * x.quality,
    price: -priceBeta * Math.log(x.price / x.refPrice),
    brand: b * x.awareness,
    distance: -d * x.distanceKm,
    service: w * x.serviceLevel,
    atmosphere,
    total: storeUtility(segment, incomeIndex, x) + atmosphere,
  };
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

/** Một cửa hàng đang mở trong tập lựa chọn, kèm các thuộc tính utility (trừ khoảng cách và nhận biết). */
export interface DemandCandidate {
  readonly id: StoreId;
  readonly companyId: string;
  readonly district: DistrictDef;
  /** Chỉ số thành phố của cửa hàng (thứ tự scenario). */
  readonly city: number;
  readonly x: Omit<UtilityInputs, 'distanceKm' | 'awareness'>;
  /** A_{c,e,s} của công ty (§18.1): ô (e, s) ở `e × S + s`. */
  readonly awareness: readonly number[];
  /** Utility cộng thêm theo phân khúc từ tiện ích đang bật (M1.7, §21); rỗng khi không bật gì. */
  readonly amenity: Readonly<Record<SegmentId, number>>;
}

/** Σ_a utility_a × segmentWeight_{a,s} của các tiện ích đang bật (economic-model §21). */
export function amenityUtility(
  content: LoadedContent,
  amenities: readonly string[],
): Record<SegmentId, number> {
  const out: Record<SegmentId, number> = {};
  for (const a of amenities) {
    const def = content.industry.storeAmenities[a];
    if (!def) continue;
    for (const s of Object.keys(def.segmentWeight).sort()) {
      out[s] = (out[s] ?? 0) + def.utility * (def.segmentWeight[s] ?? 0);
    }
  }
  return out;
}

/**
 * Utility của một ứng viên cho khách ở ô `cell` (quận e, phân khúc s) cách km: §3.1 với A_{c,e,s} (§18.1)
 * + tiện ích (§21). Không có tiện ích thì đúng bằng §3.1.
 */
export function candidateUtility(
  segmentId: SegmentId,
  segment: SegmentDef,
  incomeIndex: number,
  c: DemandCandidate,
  km: number,
  cell: number,
): number {
  const u = storeUtility(segment, incomeIndex, {
    ...c.x,
    awareness: c.awareness[cell] ?? 0,
    distanceKm: km,
  });
  const bonus = c.amenity[segmentId];
  return bonus === undefined ? u : u + bonus;
}

/** Cửa hàng đang mở của công ty chưa phá sản, theo thứ tự storeIds. */
export function demandCandidates(state: GameState, content: LoadedContent): DemandCandidate[] {
  const { industry } = content;
  const world = worldOf(content);
  const refPrice = industry.referencePrice * state.macro.priceIndex;
  const candidates: DemandCandidate[] = [];
  for (const id of state.storeIds) {
    const store = state.stores[id];
    if (!store || store.status !== 'open') continue;
    const company = state.companies[store.companyId];
    const at = world.indexOf.get(store.districtId);
    const district = at === undefined ? undefined : world.districts[at];
    const city = at === undefined ? undefined : world.cityOf[at];
    if (!company || isOut(company) || !district || city === undefined) continue;
    candidates.push({
      id,
      companyId: company.id,
      district,
      city,
      x: {
        quality: industry.qualityTiers[company.qualityTier].quality,
        price: store.price,
        refPrice,
        serviceLevel: store.serviceLevel,
      },
      awareness: company.awareness,
      amenity: store.amenities.length > 0 ? amenityUtility(content, store.amenities) : {},
    });
  }
  return candidates;
}

/**
 * Khoảng cách từ địa điểm gốc `e` (chỉ số trong thế giới) tới cửa hàng ứng viên; khác thành phố thì không với
 * tới (∞, economic-model §2).
 */
export function kmToCandidate(world: World, e: number, c: DemandCandidate): number {
  const k = world.cityOf[e];
  const city = k === undefined ? undefined : world.cities[k];
  const origin = world.districts[e];
  if (!city || !origin || c.city !== k) return Infinity;
  return distanceKm(city, origin, c.district);
}

/**
 * Cầu kỳ vọng (trước nhiễu) của mọi cửa hàng đang mở (economic-model §3.3). Chỉ đọc state.
 * Có `cityIndex` thì chỉ tính dân của thành phố đó (cửa hàng nơi khác nhận 0): dùng cho ước tính của AI.
 */
export function expectedDemand(state: GameState, content: LoadedContent, cityIndex?: number): DemandSnapshot {
  const { industry } = content;
  const world = worldOf(content);
  const candidates = demandCandidates(state, content);
  const from = cityIndex === undefined ? 0 : (world.cityStart[cityIndex] ?? 0);
  const to = cityIndex === undefined ? world.districts.length : from + (world.citySize[cityIndex] ?? 0);

  const byStore: Record<StoreId, number> = {};
  for (const c of candidates) byStore[c.id] = 0;
  let potential = 0;
  let captured = 0;
  const segmentIds = segmentIdsOf(content);
  const S = segmentIds.length;

  for (let e = from; e < to; e++) {
    const origin = world.districts[e];
    const k = world.cityOf[e];
    const city = k === undefined ? undefined : world.cities[k];
    if (!origin || !city) continue;
    for (let s = 0; s < S; s++) {
      const segmentId = segmentIds[s];
      const segment = segmentId === undefined ? undefined : industry.segments[segmentId];
      if (segmentId === undefined || !segment) continue;
      const visits = origin.pop * (origin.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
      potential += visits;
      if (visits === 0) continue;
      const reachable: DemandCandidate[] = [];
      const utilities: number[] = [];
      for (const c of candidates) {
        // Khách chỉ mua trong thành phố mình sống (§2); thứ tự ứng viên giữ theo storeIds.
        if (c.city !== k) continue;
        const km = distanceKm(city, origin, c.district);
        if (km > segment.maxTravelKm) continue;
        reachable.push(c);
        utilities.push(candidateUtility(segmentId, segment, state.macro.incomeIndex, c, km, e * S + s));
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
