/** Cảnh báo vận hành (M1.5 A4), tính từ state ở worker. Hàm thuần. */
import { ACC, currentBalances, storeContribution, toDisplay, type GameState } from '@game/sim-core';
import { playerId } from './snapshot';
import { districtLabel } from './places';

export type AlertKind =
  'overloaded' | 'underused' | 'negativeContribution' | 'lowMorale' | 'rivalNearby' | 'cashForecast';
export const ALERT_KINDS: readonly AlertKind[] = [
  'overloaded',
  'underused',
  'negativeContribution',
  'lowMorale',
  'rivalNearby',
  'cashForecast',
];

export interface Alert {
  /** Ổn định giữa các tick (loại + đối tượng) để phát hiện cảnh báo mới. */
  readonly key: string;
  readonly kind: AlertKind;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly storeId?: string;
  readonly message: string;
}

const WEEK = 7;
const OVERLOAD_DAYS = 3;
const UNDERUSED_UTILIZATION = 0.5;
const LOW_MORALE = 0.4;
const RECENT_EVENT_DAYS = 30;

export function computeAlerts(state: GameState): Alert[] {
  const pid = playerId(state);
  const alerts: Alert[] = [];
  /** Quận → cửa hàng của người chơi mở sớm nhất ở đó (đối thủ mở trước hoặc cùng ngày không phải tin mới). */
  const myDistricts = new Map<string, { readonly id: string; readonly openedDay: number }>();
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (!s || s.companyId !== pid || s.status !== 'open') continue;
    const known = myDistricts.get(s.districtId);
    if (!known || s.openedDay < known.openedDay)
      myDistricts.set(s.districtId, { id, openedDay: s.openedDay });
    const district = districtLabel(s.districtId);
    const week = s.recentDays.slice(-WEEK);
    const turnedAway = week.filter((d) => d.served < d.demand * 0.98).length;
    if (turnedAway >= OVERLOAD_DAYS) {
      alerts.push({
        key: `overloaded:${id}`,
        kind: 'overloaded',
        severity: 'warning',
        storeId: id,
        message: `Cửa hàng ${district} quá tải ${turnedAway}/7 ngày qua — đang mất khách. Thêm nhân viên hoặc tăng giá.`,
      });
    }
    if (
      week.length === WEEK &&
      week.every((d) => d.capacity > 0 && d.served / d.capacity < UNDERUSED_UTILIZATION)
    ) {
      alerts.push({
        key: `underused:${id}`,
        kind: 'underused',
        severity: 'info',
        storeId: id,
        message: `Cửa hàng ${district} dùng dưới ${UNDERUSED_UTILIZATION * 100}% công suất cả tuần — có thể bớt nhân viên.`,
      });
    }
    const lm = s.lastMonth;
    if (lm.days > 0 && storeContribution(lm) < 0) {
      alerts.push({
        key: `negativeContribution:${id}`,
        kind: 'negativeContribution',
        severity: 'warning',
        storeId: id,
        message: `Cửa hàng ${district} lỗ đóng góp tháng trước (doanh thu không đủ trả giá vốn, lương, thuê).`,
      });
    }
    if (s.morale < LOW_MORALE) {
      alerts.push({
        key: `lowMorale:${id}`,
        kind: 'lowMorale',
        severity: 'warning',
        storeId: id,
        message: `Tinh thần nhân viên ở ${district} thấp (${Math.round(s.morale * 100)}%) — công suất và phục vụ giảm. Cân nhắc tăng lương.`,
      });
    }
  }

  const since = state.clock.day - RECENT_EVENT_DAYS;
  for (const e of state.events) {
    if (e.day < since) continue;
    if (e.kind !== 'storeOpened' || e.companyId === pid) continue;
    const mine = myDistricts.get(e.districtId);
    if (mine && e.day > mine.openedDay) {
      const name = state.companies[e.companyId]?.name ?? e.companyId;
      alerts.push({
        key: `rivalNearby:${e.storeId}`,
        kind: 'rivalNearby',
        severity: 'warning',
        storeId: mine.id,
        message: `${name} vừa mở cửa hàng ở quận ${districtLabel(e.districtId)}, nơi bạn có cửa hàng (ngày ${e.day}).`,
      });
    }
  }
  const warning = [...state.events]
    .reverse()
    .find((e) => e.kind === 'cashWarning' && e.companyId === pid && e.day >= since);
  if (warning?.kind === 'cashWarning') {
    const cash = currentBalances(state.ledger, pid)[ACC.Cash];
    alerts.push({
      key: `cashForecast:${warning.day}`,
      kind: 'cashForecast',
      severity: 'critical',
      message: `Dự báo tiền ròng 13 tuần tới âm (${toDisplay(warning.cashForecast13w)}). Tiền mặt hiện có ${toDisplay(cash)}.`,
    });
  }
  return alerts;
}

/** Khóa của các cảnh báo có trong `next` mà chưa có trong `prev`. */
export function newAlertKeys(prev: readonly Alert[], next: readonly Alert[]): string[] {
  const before = new Set(prev.map((a) => a.key));
  return next.filter((a) => !before.has(a.key)).map((a) => a.key);
}
