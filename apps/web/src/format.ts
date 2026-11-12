/** Định dạng hiển thị. Tiền luôn qua toDisplay của sim-core; UI không làm toán tiền. */
import { DEPARTMENT_LABEL, OFFICE_SIZE_LABEL, toDisplay, type GameEvent, type Money } from '@game/sim-core';
import { REACH_LABEL, TIER_STYLE } from './labels';
import { districtLabel } from './sim/places';

export const usd = (m: Money): string => toDisplay(m);
/** Chênh lệch có dấu: +$1.00 / −$1.00. */
export const signedUsd = (m: Money): string => (m > 0 ? `+${toDisplay(m)}` : toDisplay(m));
export const pct = (x: number | null, digits = 1): string =>
  x === null ? '—' : `${(x * 100).toFixed(digits)}%`;
export const int = (n: number): string => Math.round(n).toLocaleString('en-US');
/** Nhãn trục gọn từ số cent: $950, $12.3k, −$1.2M. Chỉ để hiển thị, không dùng cho tính toán. */
export function compactUsd(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  if (dollars >= 1_000_000) return `${sign}$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `${sign}$${(dollars / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(dollars)}`;
}
/** Nhãn tháng: N1·T1 = năm 1, tháng 1. */
export const monthLabel = (m: number): string => `N${Math.floor(m / 12) + 1}·T${(m % 12) + 1}`;

/** Ký hiệu của đối thủ; người chơi luôn là ◆. */
const RIVAL_GLYPHS = ['▲', '■', '●', '★'];
/** Số màu dành cho đối thủ (token `--company-1` … `--company-7`); `--company-0` là người chơi. */
const RIVAL_COLORS = 7;
/**
 * Màu và ký hiệu cố định theo `colorIndex` của công ty (0 = người chơi; đối thủ đánh số theo thứ tự thành lập).
 * Màu lấy từ token CSS (có bản sáng và tối, đã kiểm bằng validator); ký hiệu đổi theo chu kỳ khác với màu nên
 * 28 đối thủ đầu tiên không trùng cả màu lẫn ký hiệu.
 */
export function companyStyle(colorIndex: number): { glyph: string; color: string } {
  if (colorIndex <= 0) return { glyph: '◆', color: 'var(--company-0)' };
  const n = colorIndex - 1;
  return {
    glyph: RIVAL_GLYPHS[n % RIVAL_GLYPHS.length] ?? '●',
    color: `var(--company-${1 + (n % RIVAL_COLORS)})`,
  };
}

/** Một dòng mô tả event bằng tiếng Việt. */
export function eventText(
  e: GameEvent,
  names: Readonly<Record<string, string>>,
  playerId: string,
  /** Tên hiển thị của một địa điểm; mặc định là mã ngắn. */
  place: (districtId: string) => string = districtLabel,
): string {
  const who = (id: string) => (id === playerId ? 'Bạn' : (names[id] ?? id));
  switch (e.kind) {
    case 'commandRejected':
      return `✗ ${who(e.companyId)}: lệnh ${e.commandType} bị từ chối — ${e.reason}`;
    case 'storeOpened':
      return `${who(e.companyId)} mở cửa hàng ${e.storeId} ở ${place(e.districtId)}`;
    case 'storeClosed':
      return `${who(e.companyId)} đóng cửa hàng ${e.storeId}`;
    case 'distress':
    case 'bankrupt': {
      const head = e.kind === 'bankrupt' ? '☠ PHÁ SẢN' : '⚠ Distress';
      const top = e.topExpenses.map((x) => `${x.label} ${usd(x.amount)}`).join(' · ');
      return `${head} — ${who(e.companyId)}: thấu chi ${usd(e.overdraft)} > hạn mức ${usd(e.overdraftLimit)}. Chi lớn nhất tháng: ${top}. Dự báo tiền ròng 3 tháng: ${usd(e.cashForecast3m)}`;
    }
    case 'cashWarning':
      return `⚠ ${who(e.companyId)}: dự báo tiền ròng 13 tuần âm (${usd(e.cashForecast13w)})`;
    case 'loanTaken':
      return `${who(e.companyId)} vay ${usd(e.principal)} trong ${e.termMonths} tháng, lãi ${pct(e.annualRate, 2)}/năm, trả ${usd(e.paymentMonthly)}/tháng`;
    case 'loanRepaid':
      return `${who(e.companyId)} trả sớm ${e.loanId}: gốc ${usd(e.principal)}, phí ${usd(e.fee)}`;
    case 'officeLeased':
      return `${who(e.companyId)} thuê văn phòng ${OFFICE_SIZE_LABEL[e.size]} ở ${place(e.districtId)}`;
    case 'officeReleased':
      return `${who(e.companyId)} trả văn phòng`;
    case 'departmentOpened':
      return `${who(e.companyId)} mở phòng ${DEPARTMENT_LABEL[e.dept]}`;
    case 'departmentClosed':
      return `${who(e.companyId)} đóng phòng ${DEPARTMENT_LABEL[e.dept]}`;
    case 'competitorEntered':
      return `Đối thủ mới: ${e.name} (${TIER_STYLE[e.qualityTier]}, ${REACH_LABEL[e.reach]}) gia nhập thị trường`;
    case 'competitorExited':
      return `${e.name} rút khỏi thị trường`;
  }
}
