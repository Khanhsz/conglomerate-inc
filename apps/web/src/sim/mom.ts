/**
 * So sánh tháng gần nhất với tháng trước đó (yêu cầu: thay bảng 12 tháng). Tính ở worker; UI chỉ hiển thị.
 * Quy ước màu ở UI: chênh lệch > 0 xanh, < 0 đỏ, cho mọi dòng.
 */
import type { BalanceSheet, CashFlow, MonthlyStatements, PnL } from '@game/sim-core';

export interface MomRow {
  readonly key: string;
  readonly label: string;
  /** Dòng tổng (in đậm). */
  readonly strong: boolean;
  /** Cent (Money) với dòng tiền; số thường với dòng khác (xem `unit`). */
  readonly current: number;
  readonly previous: number | null;
  readonly delta: number | null;
  /** delta / |previous|; null khi không có tháng trước hoặc tháng trước bằng 0. */
  readonly pct: number | null;
  readonly unit: 'money' | 'count' | 'percent';
}

export interface MomTable {
  readonly month: number;
  readonly previousMonth: number | null;
  readonly rows: readonly MomRow[];
}

type RowDef<T> = readonly [keyof T & string, string, boolean?];

const PNL: readonly RowDef<PnL>[] = [
  ['revenue', 'Doanh thu'],
  ['cogs', 'Giá vốn'],
  ['grossProfit', 'Lãi gộp', true],
  ['wages', 'Lương'],
  ['amenities', 'Tiện ích cửa hàng'],
  ['rent', 'Thuê'],
  ['marketing', 'Marketing'],
  ['admin', 'Quản trị chung'],
  ['officeRent', 'Thuê văn phòng'],
  ['departments', 'Phòng ban'],
  ['research', 'R&D'],
  ['ebitda', 'EBITDA', true],
  ['depreciation', 'Khấu hao'],
  ['lossOnDisposal', 'Lỗ thanh lý'],
  ['ebit', 'EBIT', true],
  ['interest', 'Lãi vay'],
  ['preTax', 'Lợi nhuận trước thuế', true],
  ['incomeTax', 'Thuế TNDN'],
  ['netIncome', 'Lợi nhuận ròng', true],
];

const BALANCE: readonly RowDef<BalanceSheet>[] = [
  ['cash', 'Tiền mặt'],
  ['ppe', 'TSCĐ (nguyên giá)'],
  ['accumulatedDepreciation', 'Khấu hao lũy kế'],
  ['totalAssets', 'Tổng tài sản', true],
  ['overdraft', 'Thấu chi'],
  ['loans', 'Vay'],
  ['taxPayable', 'Thuế phải nộp'],
  ['totalLiabilities', 'Tổng nợ', true],
  ['shareCapital', 'Vốn góp'],
  ['retainedEarnings', 'Lợi nhuận giữ lại'],
  ['totalEquity', 'Vốn chủ', true],
];

const CASHFLOW: readonly RowDef<CashFlow>[] = [
  ['netIncome', 'Lợi nhuận ròng'],
  ['depreciation', '+ Khấu hao'],
  ['lossOnDisposal', '+ Lỗ thanh lý'],
  ['changeInTaxPayable', '± Thuế phải nộp'],
  ['cfo', 'CFO', true],
  ['cfi', 'CFI (capex)', true],
  ['cff', 'CFF (vốn, vay, thấu chi)', true],
  ['netChange', 'Tiền mặt thay đổi', true],
];

/** Một dòng so sánh; `previous` null → không có chênh lệch. */
export function momRow(
  key: string,
  label: string,
  current: number,
  previous: number | null,
  unit: MomRow['unit'] = 'money',
  strong = false,
): MomRow {
  const delta = previous === null ? null : current - previous;
  return {
    key,
    label,
    strong,
    current,
    previous,
    delta,
    pct: delta === null || previous === null || previous === 0 ? null : delta / Math.abs(previous),
    unit,
  };
}

function table<T>(
  statements: readonly MonthlyStatements[],
  pick: (s: MonthlyStatements) => T,
  defs: readonly RowDef<T>[],
): MomTable | null {
  const last = statements[statements.length - 1];
  if (!last) return null;
  const prev = statements[statements.length - 2] ?? null;
  const cur = pick(last);
  const old = prev ? pick(prev) : null;
  return {
    month: last.month,
    previousMonth: prev ? prev.month : null,
    rows: defs.map(([key, label, strong]) =>
      momRow(
        key,
        label,
        Number(cur[key]),
        old === null || old === undefined ? null : Number(old[key]),
        'money',
        strong ?? false,
      ),
    ),
  };
}

export interface FinanceMom {
  readonly pnl: MomTable | null;
  readonly balanceSheet: MomTable | null;
  readonly cashFlow: MomTable | null;
}

export function monthOverMonth(statements: readonly MonthlyStatements[]): FinanceMom {
  const pnl = table(statements, (s) => s.pnl, PNL);
  const margin = statements[statements.length - 1]?.kpis.ebitdaMargin ?? null;
  const marginPrev = statements[statements.length - 2]?.kpis.ebitdaMargin ?? null;
  return {
    pnl:
      pnl && margin !== null
        ? {
            ...pnl,
            rows: [...pnl.rows, momRow('ebitdaMargin', 'Biên EBITDA', margin, marginPrev, 'percent')],
          }
        : pnl,
    balanceSheet: table(statements, (s) => s.balanceSheet, BALANCE),
    cashFlow: table(statements, (s) => s.cashFlow, CASHFLOW),
  };
}

/** Số liệu một tháng của cửa hàng mà bảng so sánh cần (tiền đã làm tròn như khi ghi sổ). */
export interface StoreMonthFigures {
  readonly month: number;
  readonly days: number;
  readonly served: number;
  readonly capacity: number;
  readonly revenue: number;
  readonly cogs: number;
  readonly wagesTotal: number;
  readonly rent: number;
  readonly amenities: number;
  readonly contribution: number;
}

/** Bảng "Kết quả theo tháng" của cửa hàng: tháng gần nhất so với tháng trước. */
export function storeMonthOverMonth(history: readonly StoreMonthFigures[]): MomTable | null {
  const cur = history[history.length - 1];
  if (!cur) return null;
  const prev = history[history.length - 2] ?? null;
  const perDay = (m: StoreMonthFigures) => (m.days > 0 ? m.served / m.days : 0);
  const util = (m: StoreMonthFigures) => (m.capacity > 0 ? m.served / m.capacity : 0);
  const row = (
    key: string,
    label: string,
    f: (m: StoreMonthFigures) => number,
    unit: MomRow['unit'] = 'money',
    strong = false,
  ) => momRow(key, label, f(cur), prev ? f(prev) : null, unit, strong);
  return {
    month: cur.month,
    previousMonth: prev ? prev.month : null,
    rows: [
      row('customersPerDay', 'Khách/ngày', perDay, 'count'),
      row('utilization', 'Utilization', util, 'percent'),
      row('revenue', 'Doanh thu', (m) => m.revenue),
      row('cogs', 'Giá vốn', (m) => m.cogs),
      row('wagesTotal', 'Lương & nhân sự', (m) => m.wagesTotal),
      row('rent', 'Thuê', (m) => m.rent),
      row('amenities', 'Tiện ích', (m) => m.amenities),
      row('contribution', 'Lãi đóng góp', (m) => m.contribution, 'money', true),
    ],
  };
}
