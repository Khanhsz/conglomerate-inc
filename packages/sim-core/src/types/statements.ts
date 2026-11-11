/** Báo cáo tài chính tháng (economic-model §11). Mọi trường tiền là Money; KPI là float hoặc null. */
import type { Money } from '../money';
import type { CompanyId } from './content';

export interface PnL {
  readonly revenue: Money;
  readonly cogs: Money;
  readonly grossProfit: Money;
  readonly wages: Money;
  readonly rent: Money;
  readonly marketing: Money;
  readonly admin: Money;
  /** Thuê văn phòng (M1.6, economic-model §15.1). */
  readonly officeRent: Money;
  /** Phí mở và chi phí cố định các phòng ban (M1.6, §15.2), gộp 6410–6450. */
  readonly departments: Money;
  /** R&D sản phẩm (M1.6, §17.5). */
  readonly research: Money;
  readonly ebitda: Money;
  readonly depreciation: Money;
  readonly lossOnDisposal: Money;
  readonly ebit: Money;
  readonly interest: Money;
  readonly preTax: Money;
  readonly incomeTax: Money;
  readonly netIncome: Money;
}

export interface BalanceSheet {
  readonly cash: Money;
  readonly ppe: Money;
  /** Dương; được trừ khi tính tổng tài sản. */
  readonly accumulatedDepreciation: Money;
  readonly totalAssets: Money;
  readonly overdraft: Money;
  readonly loans: Money;
  readonly taxPayable: Money;
  readonly totalLiabilities: Money;
  readonly shareCapital: Money;
  /** Σ NetIncome từ đầu (không có tài khoản riêng). */
  readonly retainedEarnings: Money;
  readonly totalEquity: Money;
}

/** Lưu chuyển tiền tệ gián tiếp. */
export interface CashFlow {
  readonly openingCash: Money;
  readonly netIncome: Money;
  readonly depreciation: Money;
  readonly lossOnDisposal: Money;
  readonly changeInTaxPayable: Money;
  readonly cfo: Money;
  /** Phát sinh Nợ PP&E trong kỳ (dương). */
  readonly capex: Money;
  /** = −capex. */
  readonly cfi: Money;
  readonly equityIssued: Money;
  readonly borrowings: Money;
  readonly principalRepaid: Money;
  readonly changeInOverdraft: Money;
  readonly cff: Money;
  readonly netChange: Money;
  readonly closingCash: Money;
}

export interface Kpis {
  readonly grossMargin: number | null;
  readonly ebitdaMargin: number | null;
  readonly avgUtilization: number | null;
  readonly revenuePerStore: Money | null;
  readonly roeAnnualized: number | null;
  readonly netDebtToEbitda: number | null;
}

/** Số liệu vận hành ledger không có; month close lấy từ cửa hàng. */
export interface OperatingStats {
  readonly storeCount: number;
  readonly avgUtilization: number | null;
}

export interface MonthlyStatements {
  readonly companyId: CompanyId;
  readonly month: number;
  readonly fromDay: number;
  readonly toDay: number;
  readonly pnl: PnL;
  readonly balanceSheet: BalanceSheet;
  readonly cashFlow: CashFlow;
  readonly kpis: Kpis;
}
