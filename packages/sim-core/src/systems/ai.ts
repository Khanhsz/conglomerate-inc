/**
 * Đối thủ AI (economic-model §9). Quyết định chạy ở tick ngày đầu mỗi tháng (sau chốt tháng), chỉ đọc dữ liệu
 * của chính công ty và dữ liệu thị trường công khai, rồi phát Command vào hàng đợi: lệnh đi qua đúng đường
 * validate/apply như của người chơi (bị từ chối thì thành event).
 * `decideMonthly` cũng được bot `sensible` của balance runner dùng lại với ngưỡng mở rộng khác.
 */
import {
  AI_PRICE_TICK,
  MAX_MARKETING_BUDGET_MONTHLY,
  MAX_STAFF_PER_STORE,
  MAX_STORES_PER_DISTRICT,
  PRICE_BAND,
  WAGE_BAND,
} from '../constants';
import { marketWage, refPrice } from '../commands/common';
import { storeCapex } from '../commands/openStore';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { fromFloatCents, money, roundHalfAwayFromZero, ZERO, type Money } from '../money';
import type { Rng } from '../rng';
import type { Command } from '../types/commands';
import type { DistrictDef, ExpansionRule, LoadedContent, Personality, QualityTier } from '../types/content';
import type { System } from '../types/context';
import type { GameState, Store } from '../types/state';
import { productivity } from './operations';

export interface AiPolicy {
  readonly qualityTier: QualityTier;
  readonly markup: number;
  readonly wageRatio: number;
  readonly marketingShareOfRevenue: number;
  readonly expansion: ExpansionRule;
}

export function aiPolicy(
  content: LoadedContent,
  personality: Personality,
  expansion?: ExpansionRule,
): AiPolicy {
  const p = content.industry.aiPersonalities[personality];
  return { ...p, expansion: expansion ?? content.industry.aiRules.expansion };
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

/** Giá target của một personality (dùng cho cửa hàng ban đầu). */
export function aiTargetPrice(content: LoadedContent, personality: Personality, priceIndex: number): Money {
  const p = content.industry.aiPersonalities[personality];
  return targetPrice(content, p.qualityTier, p.markup, priceIndex);
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
  for (const d of content.scenario.city.districts) {
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
  if (!company || company.status === 'bankrupt') return [];
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
    if (store.negContributionMonths >= content.industry.aiRules.closeAfterNegativeMonths) {
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
    const grow =
      openStores.length === 0 || monthlyRoi(state, companyId, openStores) > policy.expansion.minMonthlyRoi;
    if (grow) {
      const district = chooseDistrict(state, content, companyId, cash, policy, rng);
      if (district) commands.push({ type: 'OpenStore', companyId, payload: { districtId: district.id } });
    }
  }
  return commands;
}

/** Bước 0 của tick ngày đầu tháng: AI quyết định, lệnh xếp sau lệnh của người chơi trong hàng đợi. */
export const aiSystem: System = (draft, ctx) => {
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.kind !== 'ai' || company.status === 'bankrupt') continue;
    const policy = aiPolicy(ctx.content, company.personality);
    for (const command of decideMonthly(draft, ctx.content, companyId, policy, ctx.rng(`ai:${companyId}`))) {
      draft.commandQueue.push({ enqueuedDay: ctx.day, command });
    }
  }
};
