/** Định dạng hiển thị. Tiền luôn qua toDisplay của sim-core; UI không làm toán tiền. */
import { toDisplay, type GameEvent, type Money } from '@game/sim-core';

export const usd = (m: Money): string => toDisplay(m);
export const pct = (x: number | null, digits = 1): string =>
  x === null ? '—' : `${(x * 100).toFixed(digits)}%`;
export const int = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Ký hiệu và màu theo thứ tự công ty (người chơi đứng đầu). */
const STYLES = [
  { glyph: '◆', color: '#2563eb' },
  { glyph: '▲', color: '#9333ea' },
  { glyph: '■', color: '#d97706' },
  { glyph: '●', color: '#059669' },
  { glyph: '★', color: '#dc2626' },
];
export function companyStyle(index: number): { glyph: string; color: string } {
  return STYLES[index % STYLES.length] ?? { glyph: '●', color: '#555' };
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
  }
}
