/**
 * Đối thủ AI (economic-model §9). Quyết định chạy ở tick ngày đầu mỗi tháng (sau chốt tháng), chỉ đọc dữ liệu
 * của chính công ty và dữ liệu thị trường công khai, rồi phát Command vào hàng đợi: lệnh đi qua đúng đường
 * validate/apply như của người chơi (bị từ chối thì thành event).
 * `decideMonthly` cũng được bot `sensible` của balance runner dùng lại với ngưỡng mở rộng khác.
 */
import {
  AI_PRICE_TICK,
  DAYS_PER_MONTH,
  EXPANSION_CANDIDATES,
  MAX_MARKETING_BUDGET_MONTHLY,
  MAX_STAFF_PER_STORE,
  MAX_STORES_PER_DISTRICT,
  PRICE_BAND,
  WAGE_BAND,
} from '../constants';
import { marketWage, refPrice } from '../commands/common';
import { newStoreRecord, storeCapex } from '../commands/openStore';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { fromFloatCents, money, roundHalfAwayFromZero, ZERO, type Money } from '../money';
import type { Rng } from '../rng';
import type { Command } from '../types/commands';
import type { DistrictDef, ExpansionRule, LoadedContent, Personality, QualityTier } from '../types/content';
import type { System } from '../types/context';
import type { Company, GameState, RivalProfile, Store } from '../types/state';
import { profileFromPersonality } from '../profile';
import { worldOf } from '../world';
import { expectedDemand } from './demand';
import { productivity } from './operations';

/** Tham số hành vi mà luật tháng đọc: chính là hồ sơ của công ty (economic-model §9). */
export type AiPolicy = Omit<RivalProfile, 'source'>;

/** Chính sách của một personality M1; `expansion` thay ngưỡng mở rộng (bot của balance runner dùng). */
export function aiPolicy(
  content: LoadedContent,
  personality: Personality,
  expansion?: ExpansionRule,
): AiPolicy {
  const profile = profileFromPersonality(content, personality);
  return expansion ? { ...profile, expansion: { ...profile.expansion, ...expansion } } : profile;
}

const roundToTick = (cents: number) => roundHalfAwayFromZero(cents / AI_PRICE_TICK) * AI_PRICE_TICK;

/** targetPrice = unitCost × tierMult × priceIndex × markup, làm tròn tới 5 cent. */
export function targetPrice(
  content: LoadedContent,
  tier: QualityTier,
  markup: number,
  priceIndex: number,
): Money {
  const { unitCost, qualityTiers } = content.industry;
  return money(roundToTick(unitCost * qualityTiers[tier].unitCostMultiplier * priceIndex * markup));
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Luật 1: giá dịch tối đa ±maxPriceStep về phía target (±priceAdjust theo utilization), làm tròn 5 cent. */
function nextPrice(state: GameState, content: LoadedContent, store: Store, policy: AiPolicy): Money {
  const rules = content.industry.aiRules;
  const target = targetPrice(content, policy.qualityTier, policy.markup, state.macro.priceIndex);
  const lm = store.lastMonth;
  const util = lm.capacity > 0 ? lm.served / lm.capacity : null;
  const adjusted =
    util === null
      ? target
      : util > rules.highUtilization
        ? target * (1 + rules.priceAdjust)
        : util < rules.lowUtilization
          ? target * (1 - rules.priceAdjust)
          : target;
  const stepped = clamp(
    adjusted,
    store.price * (1 - rules.maxPriceStep),
    store.price * (1 + rules.maxPriceStep),
  );
  const pref = refPrice(state, content);
  const lo = Math.ceil((PRICE_BAND.min * pref) / AI_PRICE_TICK) * AI_PRICE_TICK;
  const hi = Math.floor((PRICE_BAND.max * pref) / AI_PRICE_TICK) * AI_PRICE_TICK;
  return money(clamp(roundToTick(stepped), lo, hi));
}

/** Luật 2: staff để utilization dự kiến ≈ targetUtilization theo cầu trung bình tháng trước, ±maxStaffStep. */
function nextStaff(content: LoadedContent, store: Store): number {
  const { aiRules, customersPerStaffPerDay, minStaffPerStore } = content.industry;
  const lm = store.lastMonth;
  if (lm.days <= 0) return store.staff;
  const demandPerDay = lm.demand / lm.days;
  const perStaff = customersPerStaffPerDay * productivity(store.morale);
  const wanted = Math.ceil(demandPerDay / (aiRules.targetUtilization * perStaff));
  const stepped = clamp(wanted, store.staff - aiRules.maxStaffStep, store.staff + aiRules.maxStaffStep);
  return clamp(stepped, minStaffPerStore, MAX_STAFF_PER_STORE);
}

/** Tổng tiềm năng mỗi ngày của quận: Σ_s N_{d,s} × f_s. */
function districtPotential(content: LoadedContent, district: DistrictDef): number {
  let total = 0;
  for (const segmentId of Object.keys(content.industry.segments).sort()) {
    const segment = content.industry.segments[segmentId];
    if (!segment) continue;
    total += district.pop * (district.mix[segmentId] ?? 0) * segment.visitsPerPersonPerDay;
  }
  return total;
}

/**
 * Luật 4: chọn quận có Σ N·f / (1 + số cửa hàng đang mở trong quận) cao nhất, trong các quận công ty còn mở được
 * và đủ tiền (cash ≥ cashMultiple × capex). Bằng điểm thì phá hòa bằng rng.
 */
function chooseDistrict(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  cash: number,
  policy: AiPolicy,
  rng: Rng,
) {
  const openCount: Record<string, number> = {};
  const ownCount: Record<string, number> = {};
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (!s || s.status !== 'open') continue;
    openCount[s.districtId] = (openCount[s.districtId] ?? 0) + 1;
    if (s.companyId === companyId) ownCount[s.districtId] = (ownCount[s.districtId] ?? 0) + 1;
  }
  let best: DistrictDef[] = [];
  let bestScore = -Infinity;
  for (const d of worldOf(content).districts) {
    if ((ownCount[d.id] ?? 0) >= MAX_STORES_PER_DISTRICT) continue;
    if (cash < policy.expansion.cashMultiple * storeCapex(state, d)) continue;
    const score = districtPotential(content, d) / (1 + (openCount[d.id] ?? 0));
    if (score > bestScore) {
      bestScore = score;
      best = [d];
    } else if (score === bestScore) {
      best.push(d);
    }
  }
  if (best.length <= 1) return best[0];
  return best[rng.int(0, best.length - 1)];
}

/**
 * Địa điểm công ty còn mở được, xếp theo điểm số luật 4 (Σ N·f / (1 + số cửa hàng đang mở)) giảm dần; bằng điểm
 * thì theo thứ tự thế giới, riêng nhóm đứng đầu phá hòa bằng rng. Lọc theo thành phố và theo tiền nếu có.
 */
export function rankedDistricts(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  filter: {
    readonly cities?: ReadonlySet<number>;
    readonly minCashPerCapex?: number;
    readonly cash?: number;
  },
  rng: Rng,
): DistrictDef[] {
  const world = worldOf(content);
  const openCount: Record<string, number> = {};
  const ownCount: Record<string, number> = {};
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (!s || s.status !== 'open') continue;
    openCount[s.districtId] = (openCount[s.districtId] ?? 0) + 1;
    if (s.companyId === companyId) ownCount[s.districtId] = (ownCount[s.districtId] ?? 0) + 1;
  }
  const scored: { d: DistrictDef; index: number; score: number }[] = [];
  world.districts.forEach((d, index) => {
    if (filter.cities && !filter.cities.has(world.cityOf[index] ?? -1)) return;
    if ((ownCount[d.id] ?? 0) >= MAX_STORES_PER_DISTRICT) return;
    if (filter.cash !== undefined && filter.cash < (filter.minCashPerCapex ?? 1) * storeCapex(state, d))
      return;
    scored.push({ d, index, score: districtPotential(content, d) / (1 + (openCount[d.id] ?? 0)) });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = scored[0];
  if (top) {
    const ties = scored.filter((x) => x.score === top.score).length;
    if (ties > 1) {
      const pick = scored.splice(rng.int(0, ties - 1), 1)[0];
      if (pick) scored.unshift(pick);
    }
  }
  return scored.map((x) => x.d);
}

/** Σ cầu kỳ vọng/ngày của các cửa hàng của công ty, chỉ tính dân của thành phố `cityIndex`. */
function ownDemandInCity(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  cityIndex: number,
): number {
  const { byStore } = expectedDemand(state, content, cityIndex);
  let total = 0;
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (s && s.companyId === companyId) total += byStore[id] ?? 0;
  }
  return total;
}

/**
 * Luật 4b (economic-model §9): mở địa điểm có lãi biên cao nhất trong tối đa `EXPANSION_CANDIDATES` ứng viên,
 * nếu lãi biên dương và hoàn vốn trong `maxPaybackMonths`. Lãi biên tính cả phần khách lấy từ cửa hàng khác
 * của chính công ty.
 */
function chooseByMarginalGain(
  state: GameState,
  content: LoadedContent,
  company: Company,
  cash: number,
  policy: AiPolicy,
  openStores: readonly Store[],
  rng: Rng,
): DistrictDef | undefined {
  const world = worldOf(content);
  const { industry } = content;
  const inCities = new Set<number>();
  for (const s of openStores) {
    const at = world.indexOf.get(s.districtId);
    const k = at === undefined ? undefined : world.cityOf[at];
    if (k !== undefined) inCities.add(k);
  }
  const home = world.cityIndexOf.get(policy.homeCityId) ?? 0;
  const canEnterNewCity = inCities.size < industry.rivalGenerator.reachCities[policy.reach];
  const allowed = new Set<number>();
  world.cities.forEach((_, k) => {
    if (inCities.size === 0 ? k === home : inCities.has(k) || canEnterNewCity) allowed.add(k);
  });
  const candidates = rankedDistricts(
    state,
    content,
    company.id,
    { cities: allowed, cash, minCashPerCapex: policy.expansion.cashMultiple },
    rng,
  ).slice(0, EXPANSION_CANDIDATES);
  if (candidates.length === 0) return undefined;

  const priceIndex = state.macro.priceIndex;
  const price = targetPrice(content, policy.qualityTier, policy.markup, priceIndex);
  const margin =
    price - industry.unitCost * industry.qualityTiers[policy.qualityTier].unitCostMultiplier * priceIndex;
  const wage = clamp(policy.wageRatio, WAGE_BAND.min, WAGE_BAND.max) * marketWage(state);
  const capacity =
    industry.newStore.staff * industry.customersPerStaffPerDay * productivity(industry.newStore.morale);
  const baseline = new Map<number, number>();

  let best: DistrictDef[] = [];
  let bestGain = 0;
  for (const d of candidates) {
    const at = world.indexOf.get(d.id);
    const k = at === undefined ? undefined : world.cityOf[at];
    if (k === undefined) continue;
    let base = baseline.get(k);
    if (base === undefined) {
      base = ownDemandInCity(state, content, company.id, k);
      baseline.set(k, base);
    }
    // Cửa hàng giả định: như cửa hàng vừa mở, ở giá target của công ty. Không đổi state thật.
    const id = '~hypothetical';
    const store = {
      ...newStoreRecord(state, content, company, d, id, state.clock.day, storeCapex(state, d)),
      price,
    };
    const trial: GameState = {
      ...state,
      stores: { ...state.stores, [id]: store },
      storeIds: [...state.storeIds, id],
    };
    const delta = ownDemandInCity(trial, content, company.id, k) - base;
    const gain =
      DAYS_PER_MONTH * Math.min(delta, capacity) * margin -
      d.rentMonthly * priceIndex -
      industry.newStore.staff * wage;
    if (gain <= 0 || storeCapex(state, d) / gain > policy.expansion.maxPaybackMonths) continue;
    if (gain > bestGain) {
      bestGain = gain;
      best = [d];
    } else if (gain === bestGain) {
      best.push(d);
    }
  }
  if (best.length <= 1) return best[0];
  return best[rng.int(0, best.length - 1)];
}

/** Lãi đóng góp trung bình 3 tháng gần nhất / tổng capex cửa hàng đang mở. */
function monthlyRoi(state: GameState, companyId: string, openStores: readonly Store[]): number {
  const recent = (state.statements[companyId] ?? []).slice(-3);
  const capex = openStores.reduce((a, s) => a + s.capex, 0);
  if (recent.length === 0 || capex <= 0) return -Infinity;
  let contribution = 0;
  for (const m of recent) contribution += m.pnl.revenue - m.pnl.cogs - m.pnl.wages - m.pnl.rent;
  return contribution / recent.length / capex;
}

/** Quyết định tháng cho một công ty (economic-model §9). Không thay đổi state; trả danh sách lệnh. */
export function decideMonthly(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  policy: AiPolicy,
  rng: Rng,
): Command[] {
  const company = state.companies[companyId];
  if (!company || company.status === 'bankrupt' || company.status === 'exited') return [];
  const commands: Command[] = [];
  const openStores: Store[] = [];
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (s && s.companyId === companyId && s.status === 'open') openStores.push(s);
  }

  if (company.qualityTier !== policy.qualityTier) {
    commands.push({ type: 'SetQualityTier', companyId, payload: { tier: policy.qualityTier } });
  }

  for (const store of openStores) {
    if (store.negContributionMonths >= policy.closeAfterNegativeMonths) {
      commands.push({ type: 'CloseStore', companyId, payload: { storeId: store.id } });
      continue;
    }
    const price = nextPrice(state, content, store, policy);
    if (price !== store.price)
      commands.push({ type: 'SetPrice', companyId, payload: { storeId: store.id, price } });
    const staff = nextStaff(content, store);
    if (staff !== store.staff)
      commands.push({ type: 'SetStaff', companyId, payload: { storeId: store.id, staff } });
  }

  const market = marketWage(state);
  const wage = fromFloatCents(clamp(policy.wageRatio, WAGE_BAND.min, WAGE_BAND.max) * market);
  if (openStores.some((s) => s.wageMonthly !== wage)) {
    commands.push({ type: 'SetWage', companyId, payload: { storeId: 'all', wageMonthly: wage } });
  }

  const closing = commands.filter((c) => c.type === 'CloseStore').length;
  const remaining = openStores.length - closing;
  const lastRevenue = (state.statements[companyId] ?? []).at(-1)?.pnl.revenue ?? 0;
  // Luật 3c; không còn cửa hàng nào sau lần quyết định này thì không chi marketing.
  const marketing =
    remaining === 0
      ? ZERO
      : fromFloatCents(Math.min(MAX_MARKETING_BUDGET_MONTHLY, policy.marketingShareOfRevenue * lastRevenue));
  if (marketing !== company.marketingBudgetMonthly) {
    commands.push({ type: 'SetMarketingBudget', companyId, payload: { monthly: marketing } });
  }

  // Luật 4. Không mở rộng trong tháng vừa đóng cửa hàng (tránh vòng đóng rồi mở lại);
  // bootstrap (#48) chỉ khi công ty không có cửa hàng nào từ trước lần quyết định này.
  if (company.status === 'active' && closing === 0) {
    const cash = currentBalances(state.ledger, companyId)[ACC.Cash];
    if (policy.expansion.rule === 'marginalGain') {
      // Luật 4b: cả cửa hàng đầu tiên cũng phải có lãi biên dương (công ty không còn chỗ có lãi sẽ rút lui, §20.2).
      const district = chooseByMarginalGain(state, content, company, cash, policy, openStores, rng);
      if (district) commands.push({ type: 'OpenStore', companyId, payload: { districtId: district.id } });
    } else {
      const grow =
        openStores.length === 0 || monthlyRoi(state, companyId, openStores) > policy.expansion.minMonthlyRoi;
      if (grow) {
        const district = chooseDistrict(state, content, companyId, cash, policy, rng);
        if (district) commands.push({ type: 'OpenStore', companyId, payload: { districtId: district.id } });
      }
    }
  }
  return commands;
}

/** Bước 0 của tick ngày đầu tháng: AI quyết định, lệnh xếp sau lệnh của người chơi trong hàng đợi. */
export const aiSystem: System = (draft, ctx) => {
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.kind !== 'ai' || company.status === 'bankrupt' || company.status === 'exited')
      continue;
    for (const command of decideMonthly(
      draft,
      ctx.content,
      companyId,
      company.profile,
      ctx.rng(`ai:${companyId}`),
    )) {
      draft.commandQueue.push({ enqueuedDay: ctx.day, command });
    }
  }
};
