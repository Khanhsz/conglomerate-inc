/**
 * Câu của dải cố vấn cho từng màn hình (M1.7 U2): chọn việc đáng chú ý nhất từ cảnh báo / tư vấn đã tính ở worker.
 * Chỉ chọn và ghép chữ; tiền đã là Money trong snapshot (UI không làm toán tiền).
 */
import type { Snapshot } from '../sim/snapshot';
import type { HqTab } from '../store';
import { pct, usd } from '../format';
import type { Tone } from './Parts';

export interface Advice {
  readonly tone: Tone;
  readonly text: string;
}

export function hqAdvice(snap: Snapshot, tab: HqTab): Advice {
  switch (tab) {
    case 'office': {
      const o = snap.office.office;
      if (!o)
        return {
          tone: 'info',
          text: 'Chưa có văn phòng. Thuê văn phòng để mở các phòng ban điều hành cả chuỗi.',
        };
      const free = o.slots - o.slotsUsed;
      return free > 0
        ? {
            tone: 'info',
            text: `Còn ${free} chỗ cho phòng ban. Chi phí cố định hiện tại ${usd(snap.office.monthlyCost)}/tháng.`,
          }
        : {
            tone: 'warn',
            text: `Văn phòng đã dùng hết ${o.slots} chỗ. Muốn thêm phòng thì chuyển sang văn phòng lớn hơn.`,
          };
    }
    case 'finance': {
      const a = snap.finance.advice;
      if (a.advice.includes('highLeverage'))
        return {
          tone: 'bad',
          text: `Nợ đã gần mức ngân hàng chấp nhận (nợ / EBITDA ${a.leverage?.toFixed(2) ?? '—'}).`,
        };
      if (a.advice.includes('lowDscr'))
        return { tone: 'warn', text: `EBITDA chỉ gấp ${a.dscr?.toFixed(2) ?? '—'} lần nghĩa vụ trả nợ năm.` };
      if (a.advice.includes('overdraftInUse'))
        return {
          tone: 'warn',
          text: `Đang dùng thấu chi ${usd(snap.player.overdraft)}, lãi ${pct(a.creditLine.overdraftRate, 1)}/năm.`,
        };
      if (!snap.finance.open)
        return {
          tone: 'info',
          text: 'Mở phòng Tài chính để xem lãi lỗ theo cửa hàng, tư vấn vay và hạn mức tín dụng.',
        };
      if (a.advice.includes('refinanceCheaper'))
        return { tone: 'info', text: 'Có khoản vay tái cấp vốn được với lãi thấp hơn.' };
      if (a.advice.includes('creditLineAvailable'))
        return { tone: 'info', text: 'Đủ điều kiện mở hạn mức tín dụng rẻ hơn thấu chi.' };
      return { tone: 'good', text: 'Tài chính ổn: không dùng thấu chi, nợ trong ngưỡng an toàn.' };
    }
    case 'hr': {
      const v = snap.hr.view;
      const count = (k: string) => v.roster.filter((r) => r.status === k).length;
      const low = count('lowMorale');
      const over = count('overloaded');
      const loss = count('loss');
      const parts = [
        low > 0 ? `${low} cửa hàng tinh thần thấp` : '',
        over > 0 ? `${over} cửa hàng quá tải` : '',
        loss > 0 ? `${loss} cửa hàng lỗ đóng góp` : '',
      ].filter((p) => p !== '');
      if (parts.length > 0) return { tone: 'warn', text: `${parts.join(', ')}.` };
      if (v.roster.length === 0)
        return { tone: 'info', text: 'Chưa có nhân viên nào: mở cửa hàng đầu tiên trên bản đồ.' };
      return {
        tone: 'good',
        text: `${v.totals.staff} nhân viên, tinh thần trung bình ${v.totals.avgMorale === null ? '—' : pct(v.totals.avgMorale, 0)}.`,
      };
    }
    case 'product':
      return {
        tone: 'info',
        text: `Chất lượng hiện tại: ${snap.player.qualityTier}. Menu và nhà cung cấp mở khi có phòng Sản phẩm.`,
      };
    case 'marketing': {
      const me = snap.companies.find((c) => c.kind === 'player');
      return {
        tone: 'info',
        text: `Nhận biết thương hiệu ${pct(me?.brandAwareness ?? 0, 0)}, thị phần ${pct(me?.marketShare ?? 0, 1)} lượt mua của thành phố.${
          snap.marketing.open ? '' : ' Mở phòng Marketing để chi theo quận và xem hiệu quả từng kênh.'
        }`,
      };
    }
    case 'board':
      return { tone: 'info', text: 'Ban điều hành sẽ cho tuyển C-level tự điều hành từng phòng.' };
  }
}

export function storeAdvice(snap: Snapshot, storeId: string): Advice {
  const alert = snap.alerts.find((a) => a.storeId === storeId);
  if (alert) return { tone: alert.severity === 'critical' ? 'bad' : 'warn', text: alert.message };
  if (snap.pending.stores[storeId])
    return { tone: 'info', text: 'Thay đổi vừa đặt sẽ áp dụng từ đầu ngày mai.' };
  const row = snap.stores.find((r) => r.id === storeId);
  if (!row) return { tone: 'info', text: 'Cửa hàng này đã đóng.' };
  return {
    tone: 'good',
    text: `Hoạt động ổn: utilization ${pct(row.utilizationToday, 0)}, lãi đóng góp tháng trước ${usd(row.lastMonthContribution)}.`,
  };
}
