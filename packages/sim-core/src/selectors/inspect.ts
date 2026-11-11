/**
 * Công cụ giải thích cho người chơi (M1.5 nhóm A). Chỉ đọc state, không đổi công thức kinh tế:
 * - inspectStore: vì sao cầu của cửa hàng như vậy (theo phân khúc, quận nguồn, so với đối thủ mạnh nhất);
 * - whatIf / priceCurve: ước tính kỳ vọng nếu đổi giá / nhân viên / lương, đối thủ giữ nguyên, chưa tính nhiễu.
 */
import { segmentIdsOf } from '../awareness';
import { AI_PRICE_TICK, DAYS_PER_MONTH, PRICE_BAND } from '../constants';
import { money, mul, sub, sum, type Money } from '../money';
import {
  demandCandidates,
  distanceKm,
  expectedDemand,
  logitShares,
  candidateUtility,
  utilityParts,
  type DemandCandidate,
  type UtilityParts,
} from '../systems/demand';
import { moraleTarget, productivity } from '../systems/operations';
import type { LoadedContent, SegmentDef } from '../types/content';
import type { Company, GameState, Store } from '../types/state';

export type UtilityPart = 'quality' | 'price' | 'brand' | 'distance' | 'service' | 'atmosphere';
const PARTS: readonly UtilityPart[] = ['quality', 'price', 'brand', 'distance', 'service', 'atmosphere'];

export interface UtilityGap {
  readonly part: UtilityPart;
  /** Utility của mình − của đối thủ ở thành phần này (âm = đang thua). */
  readonly gap: number;
  /** Số khách/ngày thêm được trong ô này nếu xóa được khoảng chênh. */
  readonly customers: number;
}

export interface StoreInspection {
  readonly storeId: string;
  readonly districtId: string;
  readonly expectedDemand: number;
  readonly capacityToday: number;
  readonly lostToday: number;
  readonly bySegment: readonly {
    readonly segmentId: string;
    readonly demand: number;
    /** Tổng lượt mua tiềm năng của phân khúc trong tầm với của cửa hàng. */
    readonly reachableVisits: number;
    /** demand / reachableVisits. */
    readonly share: number;
  }[];
  readonly byOrigin: readonly { readonly districtId: string; readonly demand: number }[];
  /** Đối thủ (công ty khác) chia nhiều khách nhất trong các ô có cửa hàng này, tối đa 3. */
  readonly rivals: readonly {
    readonly storeId: string;
    readonly companyId: string;
    readonly districtId: string;
    /** Khách/ngày của đối thủ trong các ô chung. */
    readonly overlap: number;
  }[];
  /** So sánh ở ô (quận nguồn × phân khúc) mang lại nhiều khách nhất. */
  readonly focus: {
    readonly originId: string;
    readonly segmentId: string;
    readonly visits: number;
    readonly own: UtilityParts;
    readonly rival: {
      readonly storeId: string;
      readonly companyId: string;
      readonly parts: UtilityParts;
    } | null;
    /** Chỉ các thành phần đang thua, nhiều khách nhất trước. */
    readonly gaps: readonly UtilityGap[];
  } | null;
}

function getStore(state: GameState, storeId: string): Store {
  const store = state.stores[storeId];
  if (!store) throw new Error(`unknown store ${storeId}`);
  return store;
}

interface Cell {
  /** Chỉ số ô nhận biết (e × S + s, §18.1). */
  readonly index: number;
  readonly originId: string;
  readonly segmentId: string;
  readonly segment: SegmentDef;
  readonly visits: number;
  readonly reachable: readonly { readonly c: DemandCandidate; readonly km: number; readonly u: number }[];
  readonly shares: readonly number[];
}

export function inspectStore(state: GameState, content: LoadedContent, storeId: string): StoreInspection {
  const store = getStore(state, storeId);
  const { industry, scenario } = content;
  const { city } = scenario;
  const incomeIndex = state.macro.incomeIndex;
  const candidates = demandCandidates(state, content);
  const me = candidates.find((c) => c.id === storeId);

  const bySegment = new Map<string, { demand: number; reachableVisits: number }>();
  const byOrigin = new Map<string, number>();
  const overlap = new Map<string, number>();
  let total = 0;
  let best: { cell: Cell; demand: number } | null = null;

  const segmentIds = segmentIdsOf(content);
  const S = segmentIds.length;
  if (me) {
    for (let e = 0; e < city.districts.length; e++) {
      const origin = city.districts[e];
      if (!origin) continue;
      for (let s = 0; s < S; s++) {
        const segmentId = segmentIds[s];
        const segment = segmentId === undefined ? undefined : industry.segments[segmentId];
        if (segmentId === undefined || !segment) continue;
        const index = e * S + s;
        const visits = origin.pop * (origin.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
        if (visits === 0) continue;
        const reachable = candidates.flatMap((c) => {
          const km = distanceKm(city, origin, c.district);
          return km > segment.maxTravelKm
            ? []
            : [{ c, km, u: candidateUtility(segmentId, segment, incomeIndex, c, km, index) }];
        });
        const mine = reachable.findIndex((r) => r.c.id === storeId);
        if (mine < 0) continue;
        const { shares } = logitShares(
          segment.outsideUtility,
          reachable.map((r) => r.u),
        );
        const demand = visits * (shares[mine] ?? 0);
        total += demand;
        const seg = bySegment.get(segmentId) ?? { demand: 0, reachableVisits: 0 };
        bySegment.set(segmentId, {
          demand: seg.demand + demand,
          reachableVisits: seg.reachableVisits + visits,
        });
        byOrigin.set(origin.id, (byOrigin.get(origin.id) ?? 0) + demand);
        reachable.forEach((r, i) => {
          if (r.c.companyId !== me.companyId)
            overlap.set(r.c.id, (overlap.get(r.c.id) ?? 0) + visits * (shares[i] ?? 0));
        });
        if (!best || demand > best.demand) {
          best = {
            cell: { index, originId: origin.id, segmentId, segment, visits, reachable, shares },
            demand,
          };
        }
      }
    }
  }

  const rivals = [...overlap.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .flatMap(([id, value]) => {
      const s = state.stores[id];
      return s ? [{ storeId: id, companyId: s.companyId, districtId: s.districtId, overlap: value }] : [];
    });

  return {
    storeId,
    districtId: store.districtId,
    expectedDemand: total,
    capacityToday: store.today.capacity,
    lostToday: store.today.lost,
    bySegment: [...bySegment.entries()]
      .sort((a, b) => b[1].demand - a[1].demand)
      .map(([segmentId, v]) => ({
        segmentId,
        ...v,
        share: v.reachableVisits > 0 ? v.demand / v.reachableVisits : 0,
      })),
    byOrigin: [...byOrigin.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([districtId, demand]) => ({ districtId, demand })),
    rivals,
    focus: me && best ? compareInCell(best.cell, me, incomeIndex) : null,
  };
}

/** So utility với đối thủ (công ty khác) mạnh nhất trong ô; quy mỗi khoảng chênh âm ra số khách/ngày. */
function compareInCell(
  cell: Cell,
  me: DemandCandidate,
  incomeIndex: number,
): NonNullable<StoreInspection['focus']> {
  const mine = cell.reachable.findIndex((r) => r.c.id === me.id);
  const own = cell.reachable[mine];
  if (!own) throw new Error('store not in its own focus cell');
  const ownParts = utilityParts(
    cell.segment,
    incomeIndex,
    { ...me.x, awareness: me.awareness[cell.index] ?? 0, distanceKm: own.km },
    me.amenity[cell.segmentId],
  );
  let rival: (typeof cell.reachable)[number] | undefined;
  for (const r of cell.reachable) if (r.c.companyId !== me.companyId && (!rival || r.u > rival.u)) rival = r;
  if (!rival)
    return {
      originId: cell.originId,
      segmentId: cell.segmentId,
      visits: cell.visits,
      own: ownParts,
      rival: null,
      gaps: [],
    };

  const rivalParts = utilityParts(
    cell.segment,
    incomeIndex,
    { ...rival.c.x, awareness: rival.c.awareness[cell.index] ?? 0, distanceKm: rival.km },
    rival.c.amenity[cell.segmentId],
  );
  const before = cell.shares[mine] ?? 0;
  const gaps: UtilityGap[] = [];
  for (const part of PARTS) {
    const gap = ownParts[part] - rivalParts[part];
    if (gap >= 0) continue;
    const utilities = cell.reachable.map((r, i) => (i === mine ? r.u - gap : r.u));
    const after = logitShares(cell.segment.outsideUtility, utilities).shares[mine] ?? 0;
    gaps.push({ part, gap, customers: cell.visits * (after - before) });
  }
  gaps.sort((a, b) => b.customers - a.customers);
  return {
    originId: cell.originId,
    segmentId: cell.segmentId,
    visits: cell.visits,
    own: ownParts,
    rival: { storeId: rival.c.id, companyId: rival.c.companyId, parts: rivalParts },
    gaps,
  };
}

export interface WhatIfChange {
  readonly price?: Money;
  readonly staff?: number;
  readonly wageMonthly?: Money;
}

export interface WhatIfResult {
  readonly price: Money;
  readonly staff: number;
  readonly wageMonthly: Money;
  readonly expectedDemand: number;
  /** Công suất với morale hiện tại. */
  readonly capacity: number;
  readonly served: number;
  readonly revenuePerDay: Money;
  readonly cogsPerDay: Money;
  readonly wagesPerDay: Money;
  readonly rentPerDay: Money;
  /** Doanh thu − giá vốn − lương − thuê, mỗi ngày. */
  readonly contributionPerDay: Money;
  /** Morale mà lương này hướng tới (economic-model §4.2). */
  readonly moraleTarget: number;
}

/** Ước tính kỳ vọng mỗi ngày nếu đổi giá / nhân viên / lương của một cửa hàng; đối thủ giữ nguyên. */
export function whatIf(
  state: GameState,
  content: LoadedContent,
  storeId: string,
  change: WhatIfChange,
): WhatIfResult {
  const store = getStore(state, storeId);
  const company = state.companies[store.companyId];
  if (!company) throw new Error(`unknown company ${store.companyId}`);
  const price = change.price ?? store.price;
  const staff = change.staff ?? store.staff;
  const wageMonthly = change.wageMonthly ?? store.wageMonthly;

  // Bản sao nông: chỉ thay giá của cửa hàng này (state gốc không bị chạm).
  const modified: GameState = { ...state, stores: { ...state.stores, [storeId]: { ...store, price } } };
  const demand = expectedDemand(modified, content).byStore[storeId] ?? 0;
  return estimate(state, content, store, company, { price, staff, wageMonthly }, demand);
}

/** Kinh tế một ngày của cửa hàng với cầu kỳ vọng `demand` đã biết (dùng chung cho whatIf và priceCurve). */
function estimate(
  state: GameState,
  content: LoadedContent,
  store: Store,
  company: Company,
  levers: { readonly price: Money; readonly staff: number; readonly wageMonthly: Money },
  demand: number,
): WhatIfResult {
  const { industry } = content;
  const { price, staff, wageMonthly } = levers;
  const capacity = staff * industry.customersPerStaffPerDay * productivity(store.morale);
  const served = Math.min(demand, capacity);
  const priceIndex = state.macro.priceIndex;

  const revenuePerDay = mul(price, served);
  const cogsPerDay = mul(
    industry.unitCost,
    served * industry.qualityTiers[company.qualityTier].unitCostMultiplier * priceIndex,
  );
  const wagesPerDay = mul(wageMonthly, staff / DAYS_PER_MONTH);
  const rentPerDay = mul(store.rentMonthly, 1 / DAYS_PER_MONTH);
  return {
    price,
    staff,
    wageMonthly,
    expectedDemand: demand,
    capacity,
    served,
    revenuePerDay,
    cogsPerDay,
    wagesPerDay,
    rentPerDay,
    contributionPerDay: sub(revenuePerDay, sum([cogsPerDay, wagesPerDay, rentPerDay])),
    moraleTarget: moraleTarget(
      wageMonthly / (state.macro.marketWageMonthly * priceIndex),
      industry.moraleWageSensitivity,
    ),
  };
}

export interface PricePoint {
  readonly price: Money;
  readonly expectedDemand: number;
  readonly served: number;
  readonly contributionPerDay: Money;
}

/** `points` mức giá giãn đều theo log trong dải hợp lệ (0.3–5 × Pref, bước 5 cent), kèm ước tính. */
export function priceCurve(
  state: GameState,
  content: LoadedContent,
  storeId: string,
  points = 25,
): PricePoint[] {
  const pref = content.industry.referencePrice * state.macro.priceIndex;
  const lo = Math.ceil((PRICE_BAND.min * pref) / AI_PRICE_TICK) * AI_PRICE_TICK;
  const hi = Math.floor((PRICE_BAND.max * pref) / AI_PRICE_TICK) * AI_PRICE_TICK;
  const out: PricePoint[] = [];
  const prices: Money[] = [];
  let last = -1;
  for (let i = 0; i < points; i++) {
    const raw = lo * (hi / lo) ** (i / (points - 1));
    const price = Math.min(hi, Math.max(lo, Math.round(raw / AI_PRICE_TICK) * AI_PRICE_TICK));
    if (price <= last) continue;
    last = price;
    prices.push(money(price));
  }
  // Nhanh: chỉ utility của cửa hàng này đổi theo giá, nên phần "mọi lựa chọn khác" của mỗi ô tính một lần (§3.3).
  const store = getStore(state, storeId);
  const company = state.companies[store.companyId];
  if (!company) throw new Error(`unknown company ${store.companyId}`);
  const demands = ownDemandAtPrices(state, content, storeId, prices);
  const levers = { staff: store.staff, wageMonthly: store.wageMonthly };
  prices.forEach((price, i) => {
    const r = estimate(state, content, store, company, { ...levers, price }, demands[i] ?? 0);
    out.push({
      price: r.price,
      expectedDemand: r.expectedDemand,
      served: r.served,
      contributionPerDay: r.contributionPerDay,
    });
  });
  return out;
}

/**
 * Cầu kỳ vọng của một cửa hàng ở từng mức giá, các yếu tố khác giữ nguyên. Cùng logit §3.3 với expectedDemand:
 * với mỗi ô (quận nguồn, phân khúc), share = 1 / (1 + exp(LSE(các lựa chọn khác) − u(P))).
 */
export function ownDemandAtPrices(
  state: GameState,
  content: LoadedContent,
  storeId: string,
  prices: readonly number[],
): number[] {
  const { industry, scenario } = content;
  const { city } = scenario;
  const incomeIndex = state.macro.incomeIndex;
  const candidates = demandCandidates(state, content);
  const me = candidates.find((c) => c.id === storeId);
  const out = prices.map(() => 0);
  if (!me) return out;
  const segmentIds = segmentIdsOf(content);
  const S = segmentIds.length;
  for (let e = 0; e < city.districts.length; e++) {
    const origin = city.districts[e];
    if (!origin) continue;
    for (let s = 0; s < S; s++) {
      const segmentId = segmentIds[s];
      const segment = segmentId === undefined ? undefined : industry.segments[segmentId];
      if (segmentId === undefined || !segment) continue;
      const index = e * S + s;
      const visits = origin.pop * (origin.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
      if (visits === 0) continue;
      const ownKm = distanceKm(city, origin, me.district);
      if (ownKm > segment.maxTravelKm) continue;
      const others: number[] = [segment.outsideUtility];
      for (const c of candidates) {
        if (c.id === storeId) continue;
        const km = distanceKm(city, origin, c.district);
        if (km <= segment.maxTravelKm)
          others.push(candidateUtility(segmentId, segment, incomeIndex, c, km, index));
      }
      let max = -Infinity;
      for (const u of others) if (u > max) max = u;
      let sumExp = 0;
      for (const u of others) sumExp += Math.exp(u - max);
      const logSumOthers = max + Math.log(sumExp);
      // utility ở giá tham chiếu (ln 1 = 0) rồi trừ phần giá cho từng mức
      const atRef = candidateUtility(
        segmentId,
        segment,
        incomeIndex,
        { ...me, x: { ...me.x, price: me.x.refPrice } },
        ownKm,
        index,
      );
      const eta = segment.incomeElasticityOfPriceSensitivity;
      const priceBeta = eta === 0 ? segment.betas.p : segment.betas.p / incomeIndex ** eta;
      prices.forEach((p, i) => {
        const u = atRef - priceBeta * Math.log(p / me.x.refPrice);
        out[i] = (out[i] ?? 0) + visits / (1 + Math.exp(logSumOthers - u));
      });
    }
  }
  return out;
}
