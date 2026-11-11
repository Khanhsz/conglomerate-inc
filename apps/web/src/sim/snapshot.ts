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
  meanAwareness,
} from '@game/sim-core';
import { computeAlerts, type Alert } from './alerts';
import { buildInspection, type InspectionView } from './inspection';
import { sliderLimits, type Limits } from './limits';
import { monthOverMonth, type FinanceMom } from './mom';
import { pendingChanges, type PendingView } from './pending';
import type { Speed } from './protocol';

export interface DistrictView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
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
  readonly marketShare: number;
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
  readonly city: { readonly name: string; readonly gridW: number; readonly gridH: number };
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
  const shares = selectors.marketShares(state, content);

  const openStores = state.storeIds.flatMap((id) => {
    const s = state.stores[id];
    return s && s.status === 'open' ? [s] : [];
  });

  const districts = scenario.city.districts.map((d): DistrictView => {
    const counts: Record<string, number> = {};
    for (const s of openStores)
      if (s.districtId === d.id) counts[s.companyId] = (counts[s.companyId] ?? 0) + 1;
    return {
      id: d.id,
      x: d.x,
      y: d.y,
      pop: d.pop,
      rentMonthly: mul(d.rentMonthly, state.macro.priceIndex),
      capex: storeCapex(state, d),
      stores: Object.keys(counts)
        .sort()
        .map((companyId) => ({ companyId, count: counts[companyId] ?? 0 })),
    };
  });

  const companyOrder = [pid, ...state.companyIds.filter((id) => id !== pid)];
  const companies = companyOrder.flatMap((id): CompanyView[] => {
    const c = state.companies[id];
    if (!c) return [];
    const own = openStores.filter((s) => s.companyId === id);
    const priceSum = own.reduce((a, s) => a + s.price, 0);
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
  const events = state.events
    .filter((e) => e.companyId === pid || PUBLIC_EVENTS.has(e.kind))
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
    city: { name: scenario.city.name, gridW: scenario.city.gridW, gridH: scenario.city.gridH },
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
    outsideShare: 1 - shares.industryShare,
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

function hrSection(state: GameState, content: LoadedContent, pid: string): Snapshot['hr'] {
  const view = hrView(state, content, pid);
  if (!view) throw new Error(`missing player company ${pid}`);
  return { open: state.companies[pid]?.departments.hr !== null, view };
}
