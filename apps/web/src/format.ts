/** Định dạng hiển thị. Tiền luôn qua toDisplay của sim-core; UI không làm toán tiền. */
import { DEPARTMENT_LABEL, OFFICE_SIZE_LABEL, toDisplay, type GameEvent, type Money } from '@game/sim-core';

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

/** Ký hiệu và màu theo thứ tự công ty (người chơi đứng đầu). */
const GLYPHS = ['◆', '▲', '■', '●', '★'];
const COLOR_TOKENS = 5;
/** Màu lấy từ token CSS `--company-N` (có bản sáng và tối). */
export function companyStyle(index: number): { glyph: string; color: string } {
  return { glyph: GLYPHS[index % GLYPHS.length] ?? '●', color: `var(--company-${index % COLOR_TOKENS})` };
}

/** Một dòng mô tả event bằng tiếng Việt. */
export function eventText(e: GameEvent, names: Readonly<Record<string, string>>, playerId: string): string {
  const who = (id: string) => (id === playerId ? 'Bạn' : (names[id] ?? id));
  switch (e.kind) {
    case 'commandRejected':
      return `✗ ${who(e.companyId)}: lệnh ${e.commandType} bị từ chối — ${e.reason}`;
    case 'storeOpened':
      return `${who(e.companyId)} mở cửa hàng ${e.storeId} ở quận ${e.districtId}`;
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
      return `${who(e.companyId)} thuê văn phòng ${OFFICE_SIZE_LABEL[e.size]} ở quận ${e.districtId}`;
    case 'officeReleased':
      return `${who(e.companyId)} trả văn phòng`;
    case 'departmentOpened':
      return `${who(e.companyId)} mở phòng ${DEPARTMENT_LABEL[e.dept]}`;
    case 'departmentClosed':
      return `${who(e.companyId)} đóng phòng ${DEPARTMENT_LABEL[e.dept]}`;
  }
}
