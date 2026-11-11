/**
 * Phòng Marketing (economic-model §18.3): nhận biết theo quận × phân khúc và hiệu quả từng kênh. Hàm thuần,
 * không đổi state.
 */
import { channelIdsOf, GENERAL_CHANNEL, meanAwareness, segmentIdsOf } from '../awareness';
import { DAYS_PER_MONTH } from '../constants';
import { sum, ZERO, type Money } from '../money';
import { expectedDemand } from '../systems/demand';
import type { ChannelScope, CompanyId, LoadedContent } from '../types/content';
import type { Company, GameState } from '../types/state';

export interface ChannelEffect {
  /** `general` hoặc id kênh trong content. */
  readonly channel: string;
  readonly name: string;
  readonly scope: ChannelScope;
  readonly segmentWeight: { readonly [segment: string]: number };
  readonly alpha: number;
  /** Chi mỗi ngày để đạt 63% hiệu quả tối đa, theo giá hôm nay. */
  readonly halfSaturationDaily: number;
  /** Từng dòng ngân sách đang đặt (`city` hoặc quận). */
  readonly budgets: readonly { readonly target: string; readonly monthly: Money }[];
  /** Tổng ngân sách tháng của kênh. */
  readonly monthlySpend: Money;
  /** Phần nhận biết hiện có do kênh đóng góp, trung bình theo dân số. */
  readonly contribution: number;
  /** Từng ô, cùng thứ tự với `awareness`; rỗng khi kênh chưa từng chi. */
  readonly contributionCells: readonly number[];
  /** Lượt khách/ngày có thêm nhờ phần đóng góp đó: cầu hiện tại − cầu nếu bỏ phần đóng góp. */
  readonly extraCustomersPerDay: number;
  /** extra × (giá TB − giá vốn) × 30 / ngân sách tháng; null khi kênh không có ngân sách. */
  readonly roi: number | null;
}

export interface MarketingEffect {
  readonly districtIds: readonly string[];
  readonly segmentIds: readonly string[];
  /** A_{c,e,s}: ô (e, s) ở `e × S + s`. */
  readonly awareness: readonly number[];
  /** Trung bình theo dân số. */
  readonly meanAwareness: number;
  /** `general` trước, rồi các kênh theo id tăng dần. */
  readonly channels: readonly ChannelEffect[];
}

/** Σ cầu kỳ vọng/ngày và giá bình quân theo cầu của các cửa hàng đang mở của công ty. */
function companyDemand(state: GameState, content: LoadedContent, companyId: CompanyId) {
  const { byStore } = expectedDemand(state, content);
  let demand = 0;
  let revenue = 0;
  for (const id of state.storeIds) {
    const store = state.stores[id];
    const d = byStore[id];
    if (!store || store.companyId !== companyId || d === undefined) continue;
    demand += d;
    revenue += d * store.price;
  }
  return { demand, avgPrice: demand > 0 ? revenue / demand : 0 };
}

function withAwareness(state: GameState, company: Company, awareness: number[]): GameState {
  return { ...state, companies: { ...state.companies, [company.id]: { ...company, awareness } } };
}

export function marketingEffect(
  state: GameState,
  content: LoadedContent,
  companyId: CompanyId,
): MarketingEffect {
  const company = state.companies[companyId];
  if (!company) throw new Error(`marketingEffect: unknown company ${companyId}`);
  const { industry, scenario } = content;
  const segmentIds = segmentIdsOf(content);
  const priceIndex = state.macro.priceIndex;
  const unitCost =
    industry.unitCost * industry.qualityTiers[company.qualityTier].unitCostMultiplier * priceIndex;
  const now = companyDemand(state, content, companyId);

  const effect = (
    channel: string,
    def: Pick<ChannelEffect, 'name' | 'scope' | 'segmentWeight' | 'alpha'> & { halfSat: Money },
    budgets: ChannelEffect['budgets'],
  ): ChannelEffect => {
    const monthlySpend = budgets.length > 0 ? sum(budgets.map((b) => b.monthly)) : ZERO;
    const cells = company.channelAwareness.find((c) => c.channel === channel)?.cells ?? [];
    let extra = 0;
    if (now.demand > 0 && cells.some((c) => c > 0)) {
      const reduced = company.awareness.map((a, i) => Math.max(0, a - (cells[i] ?? 0)));
      extra = now.demand - companyDemand(withAwareness(state, company, reduced), content, companyId).demand;
    }
    return {
      channel,
      name: def.name,
      scope: def.scope,
      segmentWeight: def.segmentWeight,
      alpha: def.alpha,
      halfSaturationDaily: def.halfSat * priceIndex,
      budgets,
      monthlySpend,
      contribution: cells.length > 0 ? meanAwareness(content, cells) : 0,
      contributionCells: cells,
      extraCustomersPerDay: extra,
      roi:
        monthlySpend > 0
          ? extra === 0
            ? 0
            : (extra * (now.avgPrice - unitCost) * DAYS_PER_MONTH) / monthlySpend
          : null,
    };
  };

  const everySegment: Record<string, number> = {};
  for (const s of segmentIds) everySegment[s] = 1;
  const general = effect(
    GENERAL_CHANNEL,
    {
      name: 'Thương hiệu chung',
      scope: 'city',
      segmentWeight: everySegment,
      alpha: industry.brand.alpha,
      halfSat: industry.brand.halfSaturationDaily,
    },
    company.marketingBudgetMonthly > 0 ? [{ target: 'city', monthly: company.marketingBudgetMonthly }] : [],
  );
  const others = channelIdsOf(content).flatMap((id) => {
    const def = industry.marketingChannels[id];
    if (!def) return [];
    const budgets = company.channelBudgets
      .filter((b) => b.channel === id)
      .map((b) => ({ target: b.target, monthly: b.monthly }));
    return [effect(id, { ...def, halfSat: def.halfSaturationDaily }, budgets)];
  });

  return {
    districtIds: scenario.city.districts.map((d) => d.id),
    segmentIds,
    awareness: company.awareness,
    meanAwareness: meanAwareness(content, company.awareness),
    channels: [general, ...others],
  };
}
