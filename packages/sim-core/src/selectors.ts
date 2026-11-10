/** Đọc state cho UI / balance runner (spec §5). Không mutate. */
import { currentBalances } from './ledger/balances';
import { sub, sum, type Money } from './money';
import { expectedDemand } from './systems/demand';
import type { LoadedContent } from './types/content';
import type { AccountBalances } from './types/ledger';
import type { MonthlyStatements } from './types/statements';
import type { GameState, StoreId } from './types/state';

export interface StoreRow {
  readonly id: StoreId;
  readonly districtId: string;
  readonly status: 'open' | 'closed';
  readonly price: Money;
  readonly staff: number;
  readonly wageMonthly: Money;
  readonly demandToday: number;
  readonly servedToday: number;
  /** served / capacity hôm nay; null khi capacity = 0. */
  readonly utilizationToday: number | null;
  readonly serviceLevel: number;
  /** Doanh thu − giá vốn − lương − thuê tháng trước (economic-model §9 luật 3). */
  readonly lastMonthContribution: Money;
}

export interface MarketShares {
  /** 1 − Σ share₀ có trọng số: phần lượt mua rơi vào cửa hàng (economic-model §14). */
  readonly industryShare: number;
  /** Phần của từng công ty trên tổng lượt tiềm năng (cộng lại = industryShare). */
  readonly byCompany: Readonly<Record<string, number>>;
}

export const selectors = {
  balances(state: GameState, companyId: string): Readonly<AccountBalances> {
    return currentBalances(state.ledger, companyId);
  },

  latestStatements(state: GameState, companyId: string): MonthlyStatements | null {
    const list = state.statements[companyId] ?? [];
    return list[list.length - 1] ?? null;
  },

  storeTable(state: GameState, companyId: string): StoreRow[] {
    const rows: StoreRow[] = [];
    for (const id of state.storeIds) {
      const s = state.stores[id];
      if (!s || s.companyId !== companyId) continue;
      const lm = s.lastMonth;
      rows.push({
        id,
        districtId: s.districtId,
        status: s.status,
        price: s.price,
        staff: s.staff,
        wageMonthly: s.wageMonthly,
        demandToday: s.today.demand,
        servedToday: s.today.served,
        utilizationToday: s.today.capacity > 0 ? s.today.served / s.today.capacity : null,
        serviceLevel: s.serviceLevel,
        lastMonthContribution: sub(lm.revenue, sum([lm.cogs, lm.wages, lm.rent])),
      });
    }
    return rows;
  },

  /** Thị phần theo cầu kỳ vọng hiện tại (trước nhiễu và trước giới hạn công suất, quyết định #4). */
  marketShares(state: GameState, content: LoadedContent): MarketShares {
    const snap = expectedDemand(state, content);
    const byCompany: Record<string, number> = {};
    for (const companyId of state.companyIds) byCompany[companyId] = 0;
    for (const id of state.storeIds) {
      const store = state.stores[id];
      const demand = snap.byStore[id];
      if (!store || demand === undefined || snap.potential <= 0) continue;
      byCompany[store.companyId] = (byCompany[store.companyId] ?? 0) + demand / snap.potential;
    }
    return { industryShare: snap.potential > 0 ? snap.captured / snap.potential : 0, byCompany };
  },
};
