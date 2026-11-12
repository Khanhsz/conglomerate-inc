/**
 * Nhận biết thương hiệu: adstock có bão hòa + truyền miệng (economic-model §5), theo quận × phân khúc với
 * nhiều kênh (§18) và nhiều thành phố (M1.8). Chạy trước demand.
 * Một thành phố và chỉ kênh `general` thì mọi ô bằng nhau và đúng bằng §5 của M1.
 */
import { GENERAL_CHANNEL, segmentIdsOf } from '../awareness';
import { DAYS_PER_MONTH } from '../constants';
import type { LoadedContent } from '../types/content';
import type { System } from '../types/context';
import type { ChannelAwareness, Company } from '../types/state';
import { worldOf, type World } from '../world';

/** lift = α(1 − exp(−spendDaily / (halfSat × priceIndex))); chi ≤ 0 → 0. */
export function brandLift(
  alpha: number,
  spendDaily: number,
  halfSaturationDaily: number,
  priceIndex: number,
): number {
  if (spendDaily <= 0) return 0;
  return alpha * (1 - Math.exp(-spendDaily / (halfSaturationDaily * priceIndex)));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Lift của một kênh ngoài `general`: phần theo quận (đã gồm α và bão hòa) và trọng số theo phân khúc. */
interface ChannelLift {
  readonly channel: string;
  readonly byDistrict: readonly number[];
  readonly bySegment: readonly number[];
}

/**
 * Lift từng kênh đang có ngân sách (§18.2): kênh `city` dùng cùng một giá trị cho mọi quận của thành phố được
 * chi, kênh `district` chỉ có ở quận được chi. Kênh không còn trong content, mục tiêu không tồn tại hoặc ngân
 * sách 0 thì bỏ qua.
 */
export function channelLifts(company: Company, content: LoadedContent, priceIndex: number): ChannelLift[] {
  if (company.channelBudgets.length === 0) return [];
  const { industry } = content;
  const world = worldOf(content);
  const segmentIds = segmentIdsOf(content);
  const out: ChannelLift[] = [];
  let current: { channel: string; byDistrict: number[]; bySegment: number[] } | null = null;
  for (const b of company.channelBudgets) {
    const def = industry.marketingChannels[b.channel];
    if (!def) continue;
    const lift = brandLift(def.alpha, b.monthly / DAYS_PER_MONTH, def.halfSaturationDaily, priceIndex);
    if (lift <= 0) continue;
    if (!current || current.channel !== b.channel) {
      current = {
        channel: b.channel,
        byDistrict: world.districts.map(() => 0),
        bySegment: segmentIds.map((s) => def.segmentWeight[s] ?? 0),
      };
      out.push(current);
    }
    if (def.scope === 'city') {
      const k = world.cityIndexOf.get(b.target);
      const start = k === undefined ? undefined : world.cityStart[k];
      const size = k === undefined ? undefined : world.citySize[k];
      if (start !== undefined && size !== undefined) current.byDistrict.fill(lift, start, start + size);
    } else {
      const e = world.indexOf.get(b.target);
      if (e !== undefined) current.byDistrict[e] = lift;
    }
  }
  return out;
}

/** Mảng ô của một kênh trong `channelAwareness`; tạo mới (toàn 0) đúng vị trí nếu chưa có. `general` đứng đầu. */
function cellsOf(list: ChannelAwareness[], channel: string, size: number): number[] {
  const found = list.find((x) => x.channel === channel);
  if (found) return found.cells;
  const entry: ChannelAwareness = { channel, cells: Array<number>(size).fill(0) };
  const rank = (c: string) => (c === GENERAL_CHANNEL ? '' : c);
  const at = list.findIndex((x) => rank(x.channel) > rank(channel));
  if (at < 0) list.push(entry);
  else list.splice(at, 0, entry);
  return entry.cells;
}

/**
 * Lift của kênh `general` ở từng thành phố (§5, M1.8): ngân sách chia theo dân số cho các thành phố công ty
 * đang có cửa hàng mở (chưa có cửa hàng nào: mọi thành phố). Một thành phố thì tỷ lệ chia bằng 1.
 */
export function generalLiftByCity(
  world: World,
  hasStore: readonly boolean[] | undefined,
  spendDaily: number,
  alpha: number,
  halfSaturationDaily: number,
  priceIndex: number,
): number[] {
  const anywhere = hasStore?.some((x) => x) ?? false;
  const included = world.cities.map((_, k) => (anywhere ? (hasStore?.[k] ?? false) : true));
  let pop = 0;
  let count = 0;
  included.forEach((inc, k) => {
    if (!inc) return;
    pop += world.cityPop[k] ?? 0;
    count += 1;
  });
  return world.cities.map((_, k) => {
    if (!included[k]) return 0;
    const share = pop > 0 ? (world.cityPop[k] ?? 0) / pop : 1 / count;
    return brandLift(alpha, spendDaily * share, halfSaturationDaily, priceIndex);
  });
}

/**
 * Mỗi ô (e, s) của thành phố k: A ← A + (1 − A)·lift − δ·A, rồi A ← A + γ·Σ served ở k / dân số k, kẹp [0, 1].
 * `lift = 1 − Π_ch (1 − lift_ch)`, bắt đầu từ lift của `general` nên khi không có kênh khác thì đúng bằng §5.
 * `served` là của hôm qua: operations hôm nay chưa chạy nên `store.today` vẫn giữ số của ngày trước.
 *
 * Phần đóng góp của kênh (§18.3): `C_ch ← C_ch·(1 − δ) + (1 − A)·lift·lift_ch / Σ_k lift_k`, nên
 * Σ_ch C_ch + phần tự nhiên (ban đầu + truyền miệng) = A ở mọi thời điểm.
 */
export const brandSystem: System = (draft, ctx) => {
  const { brand } = ctx.content.industry;
  const world = worldOf(ctx.content);
  const S = segmentIdsOf(ctx.content).length;
  const D = world.districts.length;
  const size = D * S;
  const cityCount = world.cities.length;

  // Theo công ty và thành phố: lượt phục vụ hôm qua và có cửa hàng đang mở hay không.
  const servedYesterday: Record<string, number[]> = {};
  const hasStore: Record<string, boolean[]> = {};
  for (const id of draft.storeIds) {
    const store = draft.stores[id];
    if (!store) continue;
    const at = world.indexOf.get(store.districtId);
    const k = at === undefined ? undefined : world.cityOf[at];
    if (k === undefined) continue;
    const served = (servedYesterday[store.companyId] ??= Array<number>(cityCount).fill(0));
    served[k] = (served[k] ?? 0) + store.today.served;
    if (store.status === 'open') {
      (hasStore[store.companyId] ??= Array<boolean>(cityCount).fill(false))[k] = true;
    }
  }

  const keep = 1 - brand.decayPerDay;
  for (const companyId of draft.companyIds) {
    const company = draft.companies[companyId];
    if (!company || company.status === 'bankrupt') continue;
    const spendDaily = company.marketingBudgetMonthly / DAYS_PER_MONTH;
    const generalByCity = generalLiftByCity(
      world,
      hasStore[companyId],
      spendDaily,
      brand.alpha,
      brand.halfSaturationDaily,
      draft.macro.priceIndex,
    );
    const channels = channelLifts(company, ctx.content, draft.macro.priceIndex);
    const served = servedYesterday[companyId];
    const wordOfMouth = world.cityPop.map((pop, k) =>
      pop > 0 ? (brand.wordOfMouth * (served?.[k] ?? 0)) / pop : 0,
    );

    const contributions = company.channelAwareness;
    for (const c of contributions) for (let i = 0; i < size; i++) c.cells[i] = (c.cells[i] ?? 0) * keep;
    const generalCells = generalByCity.some((l) => l > 0)
      ? cellsOf(contributions, GENERAL_CHANNEL, size)
      : null;
    const channelCells = channels.map((ch) => cellsOf(contributions, ch.channel, size));

    const cells = company.awareness;
    for (let e = 0; e < D; e++) {
      const k = world.cityOf[e] ?? 0;
      const general = generalByCity[k] ?? 0;
      const cityHasPeople = (world.cityPop[k] ?? 0) > 0;
      const wom = wordOfMouth[k] ?? 0;
      for (let s = 0; s < S; s++) {
        const i = e * S + s;
        let lift = general;
        let liftSum = general;
        for (const ch of channels) {
          const l = (ch.byDistrict[e] ?? 0) * (ch.bySegment[s] ?? 0);
          if (l > 0) {
            lift = 1 - (1 - lift) * (1 - l);
            liftSum += l;
          }
        }
        const before = cells[i] ?? 0;
        let a = before;
        a = a + (1 - a) * lift - brand.decayPerDay * a;
        if (cityHasPeople) a += wom;
        const next = clamp01(a);
        cells[i] = next;

        if (liftSum > 0) {
          const gained = ((1 - before) * lift) / liftSum;
          if (generalCells && general > 0) generalCells[i] = (generalCells[i] ?? 0) + gained * general;
          channels.forEach((ch, c) => {
            const l = (ch.byDistrict[e] ?? 0) * (ch.bySegment[s] ?? 0);
            const target = channelCells[c];
            if (l > 0 && target) target[i] = (target[i] ?? 0) + gained * l;
          });
        }
        // Kẹp ở 1: co mọi phần đóng góp theo cùng tỷ lệ để tổng không vượt A.
        if (a > 1) for (const c of contributions) c.cells[i] = ((c.cells[i] ?? 0) * next) / a;
      }
    }
  }
};
