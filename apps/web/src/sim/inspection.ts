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
  storeContribution,
} from '@game/sim-core';
import { playerId } from './snapshot';

export interface InspectionView {
  readonly storeId: string;
  readonly report: StoreInspection;
  readonly current: WhatIfResult;
  readonly curve: readonly PricePoint[];
  readonly recentDays: readonly StoreDayRecord[];
  /** 12 tháng gần nhất, kèm lãi đóng góp (doanh thu − giá vốn − lương − thuê) tính sẵn ở worker. */
  readonly history: readonly (StoreLastMonth & { readonly contribution: Money })[];
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
  return {
    storeId,
    report: inspectStore(state, content, storeId),
    current: whatIf(state, content, storeId, pending),
    curve: priceCurve(state, content, storeId),
    recentDays: store.recentDays,
    history: store.history.map((m) => ({
      ...m,
      contribution: storeContribution(m),
    })),
    morale: store.morale,
    skill: store.skill,
  };
}
