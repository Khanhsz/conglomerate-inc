/**
 * Gia nhập thị trường (economic-model §20.3–20.4): chạy ngày đầu mỗi tháng, trước luật AI.
 * Mỗi thành phố giữ một hẹn gia nhập; tới hẹn thì sinh một đối thủ mới ở đó. Hẹn được đặt khi thành phố thiếu
 * đối thủ so với lúc đầu ván, hoặc khi thị trường ở đó đang hấp dẫn. Scenario không khai `competition` thì bỏ qua.
 */
import { monthOf } from '../calendar';
import { DAYS_PER_MONTH } from '../constants';
import { activeChains, presentRivals, spawnRival } from '../rivals';
import { storeContribution } from '../store';
import type { LoadedContent } from '../types/content';
import type { System } from '../types/context';
import type { GameState } from '../types/state';
import { worldOf } from '../world';

/**
 * Biên lãi đóng góp của từng thành phố: Σ lãi đóng góp / Σ doanh thu của mọi cửa hàng (mọi công ty) trong
 * `months` tháng đã chốt gần nhất; null khi chưa có doanh thu.
 */
export function cityMargins(state: GameState, content: LoadedContent, months: number): (number | null)[] {
  const world = worldOf(content);
  const from = monthOf(state.clock.day) - months;
  const revenue = world.cities.map(() => 0);
  const contribution = world.cities.map(() => 0);
  for (const id of state.storeIds) {
    const store = state.stores[id];
    if (!store) continue;
    const at = world.indexOf.get(store.districtId);
    const k = at === undefined ? undefined : world.cityOf[at];
    if (k === undefined) continue;
    for (const m of store.history) {
      if (m.month < from) continue;
      revenue[k] = (revenue[k] ?? 0) + m.revenue;
      contribution[k] = (contribution[k] ?? 0) + storeContribution(m);
    }
  }
  return revenue.map((r, k) => (r > 0 ? (contribution[k] ?? 0) / r : null));
}

export const entrySystem: System = (draft, ctx) => {
  const competition = ctx.content.scenario.competition;
  if (!competition) return;
  const world = worldOf(ctx.content);
  const present = presentRivals(draft, ctx.content);
  const enoughHistory = monthOf(ctx.day) >= competition.attractive.months;
  const margins = enoughHistory ? cityMargins(draft, ctx.content, competition.attractive.months) : [];

  world.cities.forEach((city, k) => {
    const market = draft.market.cities[city.id];
    if (!market) return;
    let count = present[k] ?? 0;

    if (market.entryDueDay !== null && ctx.day >= market.entryDueDay) {
      market.entryDueDay = null;
      if (count < competition.maxPerCity) {
        // Chuỗi liên thành phố đã mất thì đối thủ mới là chuỗi; ngược lại là chuỗi địa phương.
        const kind = activeChains(draft) < draft.market.targetChains ? 'chain' : 'local';
        spawnRival(draft, ctx, { kind, homeCityId: city.id, announce: true });
        count += 1;
      }
    }

    const margin = margins[k];
    const attractive = margin !== null && margin !== undefined && margin > competition.attractive.margin;
    if (
      market.entryDueDay === null &&
      count < competition.maxPerCity &&
      (count < market.targetRivals || attractive)
    ) {
      const [lo, hi] = competition.entryDelayMonths;
      market.entryDueDay = ctx.day + DAYS_PER_MONTH * ctx.rng(`entry:${city.id}`).int(lo, hi);
    }
  });
};
