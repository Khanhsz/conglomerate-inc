/**
 * Lệnh của người chơi đã vào hàng đợi nhưng chưa áp dụng (engine áp dụng ở đầu tick kế tiếp).
 * UI hiển thị giá trị đang chờ để thanh kéo không "nhảy về" khi game đang tạm dừng.
 */
import type { GameState, Money, WhatIfChange } from '@game/sim-core';
import { playerId } from './snapshot';

export interface PendingView {
  /** Theo cửa hàng của người chơi; lệnh sau ghi đè lệnh trước, `'all'` áp cho mọi cửa hàng. */
  readonly stores: Readonly<Record<string, WhatIfChange>>;
  readonly marketingBudgetMonthly: Money | null;
  /** Ngân sách kênh đang chờ, khóa `kênh|mục tiêu` (xem `channelKey`). */
  readonly channelBudgets: Readonly<Record<string, Money>>;
}

export const channelKey = (channel: string, target: string): string => `${channel}|${target}`;

export function pendingChanges(state: GameState): PendingView {
  const pid = playerId(state);
  const mine = state.storeIds.filter((id) => state.stores[id]?.companyId === pid);
  const stores: Record<string, WhatIfChange> = {};
  let marketing: Money | null = null;
  const channelBudgets: Record<string, Money> = {};
  const set = (ref: string, change: WhatIfChange) => {
    for (const id of ref === 'all' ? mine : [ref]) stores[id] = { ...stores[id], ...change };
  };
  for (const { command } of state.commandQueue) {
    if (command.companyId !== pid) continue;
    switch (command.type) {
      case 'SetPrice':
        set(command.payload.storeId, { price: command.payload.price });
        break;
      case 'SetStaff':
        set(command.payload.storeId, { staff: command.payload.staff });
        break;
      case 'SetWage':
        set(command.payload.storeId, { wageMonthly: command.payload.wageMonthly });
        break;
      case 'SetMarketingBudget':
        marketing = command.payload.monthly;
        break;
      case 'SetChannelBudget':
        channelBudgets[channelKey(command.payload.channel, command.payload.target)] = command.payload.monthly;
        break;
      default:
        break;
    }
  }
  return { stores, marketingBudgetMonthly: marketing, channelBudgets };
}
