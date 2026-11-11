/** Dữ liệu panel "Chi tiết cửa hàng" (M1.5 A1–A3): chỉ cho cửa hàng của người chơi. */
import {
  inspectStore,
  type Money,
  priceCurve,
  whatIf,
  type GameState,
  type LoadedContent,
  type PricePoint,
  type StoreDayRecord,
  type StoreInspection,
  type StoreLastMonth,
  type WhatIfChange,
  type WhatIfResult,
  areaShares,
  storeContribution,
  storeReviews,
  sub,
  type AreaShare,
  type StoreReviews,
  sum,
} from '@game/sim-core';
import { playerId } from './snapshot';

export interface InspectionView {
  readonly storeId: string;
  readonly report: StoreInspection;
  readonly current: WhatIfResult;
  readonly curve: readonly PricePoint[];
  readonly recentDays: readonly StoreDayRecord[];
  /** 12 tháng gần nhất, kèm lãi đóng góp (doanh thu − giá vốn − lương − thuê) tính sẵn ở worker. */
  readonly history: readonly (StoreLastMonth & {
    readonly contribution: Money;
    readonly wagesTotal: Money;
  })[];
  /** Lãi đóng góp tháng gần nhất trừ tháng trước đó (null khi chưa đủ 2 tháng). */
  readonly contributionDelta: Money | null;
  /** Đánh giá sao và thị phần khu vực (M1.7 U4). */
  readonly reviews: StoreReviews | null;
  readonly area: readonly AreaShare[];
  readonly morale: number;
  readonly skill: number;
}

export function buildInspection(
  state: GameState,
  content: LoadedContent,
  storeId: string,
  /** Lệnh đang chờ áp dụng: ước tính hiện tại tính theo giá trị sẽ có hiệu lực. */
  pending: WhatIfChange = {},
): InspectionView | null {
  const store = state.stores[storeId];
  if (!store || store.companyId !== playerId(state) || store.status !== 'open') return null;
  const h = store.history;
  const prev = h[h.length - 2];
  const last = h[h.length - 1];
  return {
    contributionDelta: prev && last ? sub(storeContribution(last), storeContribution(prev)) : null,
    reviews: storeReviews(state, content, storeId),
    area: areaShares(state, content, storeId) ?? [],
    storeId,
    report: inspectStore(state, content, storeId),
    current: whatIf(state, content, storeId, pending),
    curve: priceCurve(state, content, storeId),
    recentDays: store.recentDays,
    history: store.history.map((m) => ({
      ...m,
      contribution: storeContribution(m),
      wagesTotal: sum([m.wages, m.training, m.benefits, m.bonus]),
    })),
    morale: store.morale,
    skill: store.skill,
  };
}
