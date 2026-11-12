/**
 * Snapshot gửi cho UI: chỉ phần dữ liệu cần hiển thị, không có sổ cái. Hàm thuần, chạy trong worker.
 * Mọi số tiền vẫn là Money (cent); UI chỉ định dạng bằng toDisplay, không làm toán tiền.
 */
import {
  ACC,
  currentBalances,
  DAYS_PER_MONTH,
  fromFloatCents,
  monthOf,
  MONTHS_PER_YEAR,
  mul,
  financeAdvice,
  hrView,
  officeView,
  storePnl,
  sub,
  selectors,
  storeCapex,
  type CompanyStatus,
  type GameEvent,
  type GameState,
  type LoadedContent,
  type Money,
  type MonthlyStatements,
  type QualityTier,
  type StoreRow,
  type FinanceAdvice,
  type HrView,
  type OfficeView,
  type StorePnl,
  marketingEffect,
  meanAwareness,
  worldOf,
  expectedDemand,
  money,
  type CityDef,
  type Reach,
  type RivalProfile,
  type Zone,
  type MarketingEffect,
} from '@game/sim-core';
import { computeAlerts, type Alert } from './alerts';
import { buildInspection, type InspectionView } from './inspection';
import { sliderLimits, type Limits } from './limits';
import { monthOverMonth, type FinanceMom } from './mom';
import { pendingChanges, type PendingView } from './pending';
import type { Speed } from './protocol';

/** Một thành phố của scenario (ADR-0003); chi tiết địa điểm chỉ có cho thành phố đang xem. */
export interface CitySummary {
  readonly id: string;
  readonly name: string;
  readonly pop: number;
  /** Id mọi địa điểm của thành phố, để UI tra "địa điểm này thuộc thành phố nào". */
  readonly districtIds: readonly string[];
  /** Số cửa hàng đang mở của người chơi và số đối thủ đang có cửa hàng ở đây. */
  readonly ownStores: number;
  readonly rivals: number;
}

export interface DistrictView {
  readonly id: string;
  /** Vị trí trong danh sách địa điểm của cả thế giới (chỉ số ô nhận biết). */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly zone: Zone;
  readonly pop: number;
  /** Thuê và capex nếu mở cửa hàng hôm nay (đã nhân CPI). */
  readonly rentMonthly: Money;
  readonly capex: Money;
  /** Cửa hàng đang mở theo công ty, sort theo companyId. */
  readonly stores: readonly { readonly companyId: string; readonly count: number }[];
}

export interface CompanyView {
  readonly id: string;
  readonly name: string;
  readonly kind: 'player' | 'ai';
  readonly status: CompanyStatus;
  readonly brandAwareness: number;
  readonly storeCount: number;
  readonly avgPrice: Money | null;
  /** Thị phần ở thành phố đang xem (lượt mua kỳ vọng / tổng lượt tiềm năng của thành phố). */
  readonly marketShare: number;
  /** Màu và ký hiệu cố định của công ty: 0 = người chơi, đối thủ đánh số theo thứ tự thành lập. */
  readonly colorIndex: number;
  /** Số cửa hàng đang mở ở thành phố đang xem. */
  readonly storesHere: number;
  /** Hồ sơ công khai của đối thủ (M1.8); null với người chơi. Không gồm markup, tiền mặt, lợi nhuận. */
  readonly dossier: RivalDossier | null;
}

/** Tốc độ mở rộng, suy từ hồ sơ để mô tả bằng lời. */
export type RivalPace = 'cautious' | 'steady' | 'fast';

export interface RivalDossier {
  readonly foundedDay: number;
  readonly qualityTier: QualityTier;
  readonly reach: Reach;
  readonly pace: RivalPace;
  readonly homeCity: string;
  /** Tên các thành phố đang có cửa hàng. */
  readonly cities: readonly string[];
  /** Doanh thu tháng gần nhất làm tròn 2 chữ số có nghĩa; null khi chưa có tháng nào. */
  readonly revenueEstimate: Money | null;
}

export interface FinanceView {
  readonly open: boolean;
  readonly advice: FinanceAdvice;
  /** P&L theo cửa hàng của tháng đã chốt gần nhất. */
  readonly storePnl: StorePnl | null;
  /** 24 tháng gần nhất, cũ → mới. */
  readonly trend: readonly TrendPoint[];
  /** Tháng gần nhất và chênh lệch so với tháng trước đó (null khi chưa đủ 2 tháng). */
  readonly revenueDelta: Money | null;
  readonly netIncomeDelta: Money | null;
}

export interface TrendPoint {
  readonly month: number;
  readonly revenue: Money;
  readonly ebitda: Money;
  readonly netIncome: Money;
  /** Tiền mặt − thấu chi cuối tháng. */
  readonly netCash: Money;
}

export interface LoanView {
  readonly id: string;
  readonly principal: Money;
  readonly outstanding: Money;
  readonly paymentMonthly: Money;
  readonly annualRate: number;
  readonly termMonths: number;
  readonly paymentsMade: number;
}

/** Event distress và bankrupt dùng chung một kiểu trong sim-core; đây là nhánh bankrupt. */
export type BankruptEvent = Extract<GameEvent, { kind: 'distress' | 'bankrupt' }> & {
  readonly kind: 'bankrupt';
};

export interface Snapshot {
  readonly calendar: {
    readonly day: number;
    readonly year: number;
    readonly month: number;
    readonly dayOfMonth: number;
  };
  readonly speed: Speed;
  readonly pendingCommands: number;
  readonly player: {
    readonly id: string;
    readonly name: string;
    readonly status: CompanyStatus;
    readonly cash: Money;
    readonly overdraft: Money;
    readonly overdraftLimit: Money;
    readonly marketingBudgetMonthly: Money;
    readonly qualityTier: QualityTier;
  };
  /** Seed và scenario của ván đang chơi. */
  readonly seed: number;
  readonly scenarioId: string;
  /** Mọi thành phố của scenario, theo thứ tự chuẩn. */
  readonly cities: readonly CitySummary[];
  /** Thành phố đang xem trên bản đồ. */
  readonly city: {
    readonly id: string;
    readonly name: string;
    readonly gridW: number;
    readonly gridH: number;
  };
  /** Luật cho ô nhập (validate thật vẫn ở worker). */
  readonly rules: { readonly minStaffPerStore: number; readonly earlyRepaymentFee: number };
  readonly districts: readonly DistrictView[];
  /** Cửa hàng đang mở của người chơi. */
  readonly stores: readonly StoreRow[];
  /** 12 tháng gần nhất của người chơi, cũ → mới. */
  readonly statements: readonly MonthlyStatements[];
  /** Tháng gần nhất so với tháng trước (P&L, cân đối, lưu chuyển tiền). */
  readonly financeMom: FinanceMom;
  readonly loans: readonly LoanView[];
  /** Người chơi trước, rồi AI theo id. */
  readonly companies: readonly CompanyView[];
  readonly outsideShare: number;
  /** 50 event gần nhất, mới nhất trước. */
  readonly events: readonly GameEvent[];
  readonly gameOver: BankruptEvent | null;
  /** Giới hạn thanh kéo, khớp luật validate hiện tại. */
  readonly limits: Limits;
  readonly alerts: readonly Alert[];
  /** Chi tiết cửa hàng đang xem (chỉ cửa hàng của người chơi). */
  readonly inspection: InspectionView | null;
  /** Văn phòng và phòng ban của người chơi (economic-model §15). */
  readonly office: OfficeView;
  /** Phòng Tài chính (economic-model §19.1); chi tiết chỉ có khi phòng đã mở. */
  readonly finance: FinanceView;
  /** Phòng Nhân sự (economic-model §16); chính sách chỉnh được khi phòng đã mở. */
  readonly hr: { readonly open: boolean; readonly view: HrView };
  /** Phòng Marketing (economic-model §18): nhận biết theo quận × phân khúc và hiệu quả từng kênh. */
  readonly marketing: {
    readonly open: boolean;
    readonly view: MarketingEffect;
    /** Nhận biết trung bình từng địa điểm của thành phố đang xem (theo cơ cấu dân cư), thứ tự như `districts`. */
    readonly byDistrict: readonly number[];
  };
  /** Lệnh của người chơi đã vào hàng đợi, áp dụng ở đầu ngày kế tiếp. */
  readonly pending: PendingView;
}

const STATEMENT_MONTHS = 12;
const TREND_MONTHS = 24;
const EVENT_LIMIT = 50;
const PUBLIC_EVENTS: ReadonlySet<GameEvent['kind']> = new Set([
  'storeOpened',
  'storeClosed',
  'distress',
  'bankrupt',
  'competitorEntered',
  'competitorExited',
]);

export function playerId(state: GameState): string {
  const id = state.companyIds.find((c) => state.companies[c]?.kind === 'player');
  if (!id) throw new Error('scenario has no player company');
  return id;
}

export function buildSnapshot(
  state: GameState,
  content: LoadedContent,
  speed: Speed,
  inspectedStoreId: string | null = null,
  viewedCityId: string | null = null,
): Snapshot {
  const pid = playerId(state);
  const player = state.companies[pid];
  if (!player) throw new Error(`missing player company ${pid}`);
  const { scenario } = content;
  const day = state.clock.day;
  const month = monthOf(day);
  const balances = currentBalances(state.ledger, pid);
  const pending = pendingChanges(state);
  const office = officeView(state, content, pid);
  if (!office) throw new Error(`missing player company ${pid}`);

  const openStores = state.storeIds.flatMap((id) => {
    const s = state.stores[id];
    return s && s.status === 'open' ? [s] : [];
  });

  const world = worldOf(content);
  const city = viewedCity(content, viewedCityId);
  const cities = world.cities.map((c, k): CitySummary => {
    let ownStores = 0;
    const rivals = new Set<string>();
    for (const s of openStores) {
      const at = world.indexOf.get(s.districtId);
      if (at === undefined || world.cityOf[at] !== k) continue;
      if (s.companyId === pid) ownStores += 1;
      else rivals.add(s.companyId);
    }
    return {
      id: c.id,
      name: c.name,
      pop: world.cityPop[k] ?? 0,
      districtIds: c.districts.map((d) => d.id),
      ownStores,
      rivals: rivals.size,
    };
  });
  const districts = city.districts.map((d): DistrictView => {
    const counts: Record<string, number> = {};
    for (const s of openStores)
      if (s.districtId === d.id) counts[s.companyId] = (counts[s.companyId] ?? 0) + 1;
    return {
      id: d.id,
      index: world.indexOf.get(d.id) ?? 0,
      x: d.x,
      y: d.y,
      zone: d.zone,
      pop: d.pop,
      rentMonthly: mul(d.rentMonthly, state.macro.priceIndex),
      capex: storeCapex(state, d),
      stores: Object.keys(counts)
        .sort()
        .map((companyId) => ({ companyId, count: counts[companyId] ?? 0 })),
    };
  });

  const viewedIndex = world.cityIndexOf.get(city.id) ?? 0;
  const shares = cityMarketShares(state, content, viewedIndex);
  // Màu theo thứ tự thành lập (ngày, rồi id): không đổi khi có công ty mới.
  const founded = state.companyIds
    .flatMap((id) => {
      const c = state.companies[id];
      return c && c.kind === 'ai' ? [{ id, day: c.foundedDay }] : [];
    })
    .sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1));
  const colorOf = new Map(founded.map((x, i) => [x.id, i + 1]));
  const companyOrder = [pid, ...state.companyIds.filter((id) => id !== pid)];
  const companies = companyOrder.flatMap((id): CompanyView[] => {
    const c = state.companies[id];
    if (!c) return [];
    const own = openStores.filter((s) => s.companyId === id);
    const priceSum = own.reduce((a, s) => a + s.price, 0);
    const inCities = new Set<number>();
    let storesHere = 0;
    for (const s of own) {
      const at = world.indexOf.get(s.districtId);
      const k = at === undefined ? undefined : world.cityOf[at];
      if (k === undefined) continue;
      inCities.add(k);
      if (k === viewedIndex) storesHere += 1;
    }
    return [
      {
        id,
        name: c.name,
        kind: c.kind,
        status: c.status,
        brandAwareness: meanAwareness(content, c.awareness),
        storeCount: own.length,
        avgPrice: own.length > 0 ? fromFloatCents(priceSum / own.length) : null,
        marketShare: shares.byCompany[id] ?? 0,
        colorIndex: colorOf.get(id) ?? 0,
        storesHere,
        dossier:
          c.kind === 'ai'
            ? {
                foundedDay: c.foundedDay,
                qualityTier: c.profile.qualityTier,
                reach: c.profile.reach,
                pace: paceOf(c.profile),
                homeCity:
                  world.cities.find((x) => x.id === c.profile.homeCityId)?.name ?? c.profile.homeCityId,
                cities: world.cities.filter((_, k) => inCities.has(k)).map((x) => x.name),
                revenueEstimate: roughly(state.statements[id]?.at(-1)?.pnl.revenue ?? null),
              }
            : null,
      },
    ];
  });

  const loans = state.loanIds.flatMap((id): LoanView[] => {
    const l = state.loans[id];
    if (!l || l.companyId !== pid || l.outstanding <= 0) return [];
    const { principal, outstanding, paymentMonthly, annualRate, termMonths, paymentsMade } = l;
    return [{ id, principal, outstanding, paymentMonthly, annualRate, termMonths, paymentsMade }];
  });

  // Người chơi chỉ thấy thông tin công khai của đối thủ: mở/đóng cửa hàng, distress, phá sản.
  // Tin mở / đóng cửa hàng của đối thủ chỉ giữ ở thành phố đang xem hoặc nơi người chơi có cửa hàng (M1.8):
  // với nhiều thành phố, tin ở nơi khác chỉ là nhiễu.
  const relevantCities = new Set<number>([viewedIndex]);
  cities.forEach((c, k) => {
    if (c.ownStores > 0) relevantCities.add(k);
  });
  const cityOfStore = (districtId: string | undefined): number | undefined => {
    const at = districtId === undefined ? undefined : world.indexOf.get(districtId);
    return at === undefined ? undefined : world.cityOf[at];
  };
  const isLocal = (e: GameEvent): boolean => {
    if (e.kind === 'storeOpened') return relevantCities.has(cityOfStore(e.districtId) ?? -1);
    if (e.kind === 'storeClosed')
      return relevantCities.has(cityOfStore(state.stores[e.storeId]?.districtId) ?? -1);
    return true;
  };
  const events = state.events
    .filter((e) => e.companyId === pid || (PUBLIC_EVENTS.has(e.kind) && isLocal(e)))
    .slice(-EVENT_LIMIT)
    .reverse();
  const gameOver =
    [...state.events]
      .reverse()
      .find((e): e is BankruptEvent => e.kind === 'bankrupt' && e.companyId === pid) ?? null;

  return {
    calendar: {
      day,
      year: Math.floor(month / MONTHS_PER_YEAR) + 1,
      month: (month % MONTHS_PER_YEAR) + 1,
      dayOfMonth: (day % DAYS_PER_MONTH) + 1,
    },
    speed,
    pendingCommands: state.commandQueue.length,
    player: {
      id: pid,
      name: player.name,
      status: player.status,
      cash: balances[ACC.Cash],
      overdraft: balances[ACC.Overdraft],
      overdraftLimit: player.overdraft.limit,
      marketingBudgetMonthly: player.marketingBudgetMonthly,
      qualityTier: player.qualityTier,
    },
    seed: state.seed,
    scenarioId: scenario.id,
    cities,
    city: { id: city.id, name: city.name, gridW: city.gridW, gridH: city.gridH },
    rules: {
      minStaffPerStore: content.industry.minStaffPerStore,
      earlyRepaymentFee: scenario.finance.earlyRepaymentFee,
    },
    districts,
    stores: selectors.storeTable(state, pid).filter((r) => r.status === 'open'),
    statements: (state.statements[pid] ?? []).slice(-STATEMENT_MONTHS),
    financeMom: monthOverMonth(state.statements[pid] ?? []),
    loans,
    companies,
    outsideShare: shares.outside,
    events,
    gameOver,
    limits: sliderLimits(state, content),
    alerts: computeAlerts(state),
    inspection:
      inspectedStoreId === null
        ? null
        : buildInspection(state, content, inspectedStoreId, pending.stores[inspectedStoreId]),
    pending,
    office,
    finance: financeView(state, content, pid),
    hr: hrSection(state, content, pid),
    marketing: marketingSection(state, content, pid, city),
  };
}

/** Một bước sim vừa sinh event distress/bankrupt của người chơi → UI nên tạm dừng (spec §7). */
export function shouldPause(prev: GameState, next: GameState): boolean {
  const pid = playerId(next);
  // Event mới = phần cuối của next.events theo eventSeq (events trong state chỉ giữ một cửa sổ, #54).
  const fresh = Math.min(next.events.length, next.eventSeq - prev.eventSeq);
  return next.events
    .slice(next.events.length - fresh)
    .some((e) => (e.kind === 'distress' || e.kind === 'bankrupt') && e.companyId === pid);
}

function financeView(state: GameState, content: LoadedContent, pid: string): FinanceView {
  const advice = financeAdvice(state, content, pid);
  if (!advice) throw new Error(`missing player company ${pid}`);
  const history = state.statements[pid] ?? [];
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return {
    open: state.companies[pid]?.departments.finance !== null,
    advice,
    storePnl: last ? storePnl(state, pid, last.month) : null,
    revenueDelta: last && prev ? sub(last.pnl.revenue, prev.pnl.revenue) : null,
    netIncomeDelta: last && prev ? sub(last.pnl.netIncome, prev.pnl.netIncome) : null,
    trend: history.slice(-TREND_MONTHS).map((m) => ({
      month: m.month,
      revenue: m.pnl.revenue,
      ebitda: m.pnl.ebitda,
      netIncome: m.pnl.netIncome,
      netCash: sub(m.balanceSheet.cash, m.balanceSheet.overdraft),
    })),
  };
}

/** Ngưỡng mô tả tốc độ mở rộng theo số tháng hoàn vốn đối thủ chấp nhận (chỉ để hiển thị). */
const FAST_PAYBACK_MONTHS = 24;
const CAUTIOUS_PAYBACK_MONTHS = 16;

function paceOf(profile: RivalProfile): RivalPace {
  if (profile.expansion.rule !== 'marginalGain') return 'steady';
  if (profile.expansion.maxPaybackMonths >= FAST_PAYBACK_MONTHS) return 'fast';
  return profile.expansion.maxPaybackMonths <= CAUTIOUS_PAYBACK_MONTHS ? 'cautious' : 'steady';
}

/** Làm tròn 2 chữ số có nghĩa: số ước tính công khai, không lộ số chính xác của đối thủ. */
function roughly(amount: Money | null): Money | null {
  if (amount === null || amount <= 0) return amount === null ? null : money(0);
  const scale = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 1);
  return money(Math.round(amount / scale) * scale);
}

/** Thị phần trong một thành phố: lượt mua kỳ vọng của từng công ty / tổng lượt tiềm năng của thành phố. */
function cityMarketShares(
  state: GameState,
  content: LoadedContent,
  cityIndex: number,
): { byCompany: Record<string, number>; outside: number } {
  const demand = expectedDemand(state, content, cityIndex);
  const byCompany: Record<string, number> = {};
  if (demand.potential <= 0) return { byCompany, outside: 1 };
  for (const id of state.storeIds) {
    const store = state.stores[id];
    const d = demand.byStore[id];
    if (!store || d === undefined) continue;
    byCompany[store.companyId] = (byCompany[store.companyId] ?? 0) + d / demand.potential;
  }
  return { byCompany, outside: 1 - demand.captured / demand.potential };
}

/** Thành phố đang xem; id lạ hoặc null thì là thành phố đầu tiên của scenario. */
function viewedCity(content: LoadedContent, cityId: string | null): CityDef {
  const city = content.scenario.cities.find((c) => c.id === cityId) ?? content.scenario.cities[0];
  if (!city) throw new Error('scenario has no city');
  return city;
}

function marketingSection(
  state: GameState,
  content: LoadedContent,
  pid: string,
  city: CityDef,
): Snapshot['marketing'] {
  const view = marketingEffect(state, content, pid);
  const S = view.segmentIds.length;
  const world = worldOf(content);
  const byDistrict = city.districts.map((d) => {
    const e = world.indexOf.get(d.id) ?? 0;
    let weighted = 0;
    let share = 0;
    view.segmentIds.forEach((segmentId, s) => {
      const mix = d.mix[segmentId] ?? 0;
      weighted += mix * (view.awareness[e * S + s] ?? 0);
      share += mix;
    });
    return share > 0 ? weighted / share : 0;
  });
  return { open: state.companies[pid]?.departments.marketing !== null, view, byDistrict };
}

function hrSection(state: GameState, content: LoadedContent, pid: string): Snapshot['hr'] {
  const view = hrView(state, content, pid);
  if (!view) throw new Error(`missing player company ${pid}`);
  return { open: state.companies[pid]?.departments.hr !== null, view };
}
