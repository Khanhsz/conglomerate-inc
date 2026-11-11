/**
 * GameState (spec §2). Dữ liệu thuần, serializable bằng JSON: không class, Map, Set, Date, undefined.
 * Collection: Record<Id, T> + mảng id đã sort để duyệt có thứ tự.
 */
import type { Money } from '../money';
import type { Command } from './commands';
import type { CompanyId, Department, DistrictId, OfficeSize, Personality, QualityTier } from './content';
import type { Ledger } from './ledger';
import type { MonthlyStatements } from './statements';

export type StoreId = string;
export type LoanId = string;

export interface MacroState {
  inflationAnnual: number;
  policyRateAnnual: number;
  /** Tăng cùng CPI ở M1 (economic-model §1). */
  incomeIndex: number;
  priceIndex: number;
  corporateTaxRate: number;
  /** Chưa nhân priceIndex. */
  marketWageMonthly: Money;
}

export type CompanyStatus = 'active' | 'distress' | 'bankrupt';

interface CompanyBase {
  readonly id: CompanyId;
  readonly name: string;
  status: CompanyStatus;
  distressMonths: number;
  qualityTier: QualityTier;
  brandAwareness: number;
  marketingBudgetMonthly: Money;
  /** Cent dạng float, cộng dồn mỗi ngày, ghi sổ và reset khi chốt tháng (economic-model §6). */
  marketingAccrued: number;
  tax: { preTaxProfitYTD: Money; taxBookedYTD: Money; lossCarryforward: Money };
  overdraft: { limit: Money; dailyBalanceSum: Money };
  /** Văn phòng (M1.6, economic-model §15.1); null = chưa thuê. */
  office: Office | null;
  /** Phòng ban đang mở (§15.2); đủ mọi key của DEPARTMENTS, null = chưa mở. */
  departments: { [D in Department]: { readonly openedDay: number } | null };
  /** Cent float cộng dồn trong tháng, ghi sổ và reset khi chốt tháng (§15). */
  officeAccrued: OfficeAccrued;
  /** Hạn mức tín dụng của phòng Tài chính (§19.1); limit 0 = dùng thấu chi §7.2. Phí cam kết là cent float. */
  creditLine: { limit: Money; commitmentFeeAccrued: number };
}

export interface Office {
  readonly districtId: DistrictId;
  readonly size: OfficeSize;
  readonly openedDay: number;
  /** Cố định theo hợp đồng, index CPI khi gia hạn mỗi 12 tháng (như cửa hàng). */
  rentMonthly: Money;
  rentResetDay: number;
  readonly capex: Money;
  accumDep: Money;
}

export interface OfficeAccrued {
  rent: number;
  overhead: number;
  departments: { [D in Department]: number };
}

export interface PlayerCompany extends CompanyBase {
  readonly kind: 'player';
}

export interface AiCompany extends CompanyBase {
  readonly kind: 'ai';
  readonly personality: Personality;
}

export type Company = PlayerCompany | AiCompany;

export interface StoreDayStats {
  /** Cầu thực tế sau nhiễu (economic-model §3.4). */
  demand: number;
  served: number;
  lost: number;
  capacity: number;
}

/** Cộng dồn trong tháng của một cửa hàng. `*Accrued` là cent dạng float, chỉ làm tròn khi ghi sổ. */
export interface StoreMonthToDate {
  demand: number;
  served: number;
  capacity: number;
  /** Số ngày cửa hàng hoạt động trong tháng. */
  days: number;
  revenue: Money;
  cogs: Money;
  wagesAccrued: number;
  rentAccrued: number;
}

/** Kết quả tháng trước của một cửa hàng (tiền đã làm tròn như khi ghi sổ). */
export interface StoreLastMonth {
  /** Tháng (monthOf) của số liệu; −1 khi chưa có tháng nào. */
  readonly month: number;
  readonly demand: number;
  readonly served: number;
  readonly capacity: number;
  readonly days: number;
  readonly revenue: Money;
  readonly cogs: Money;
  readonly wages: Money;
  readonly rent: Money;
  /** Khấu hao của cửa hàng trong tháng (M1.6, cho P&L theo cửa hàng). */
  readonly depreciation: Money;
}

export interface StoreDayRecord {
  readonly day: number;
  readonly demand: number;
  readonly served: number;
  readonly capacity: number;
}

export interface Store {
  readonly id: StoreId;
  readonly companyId: CompanyId;
  readonly districtId: DistrictId;
  readonly openedDay: number;
  status: 'open' | 'closed';
  /** Chỉ có khi status = 'closed'. */
  closedDay?: number;
  price: Money;
  staff: number;
  wageMonthly: Money;
  rentMonthly: Money;
  rentResetDay: number;
  readonly capex: Money;
  accumDep: Money;
  morale: number;
  skill: number;
  serviceLevel: number;
  /** Ghi đè mỗi ngày. */
  today: StoreDayStats;
  /** Cộng dồn trong tháng, reset khi chốt tháng. */
  mtd: StoreMonthToDate;
  /** Kết quả tháng trước, cho AI (economic-model §9) và UI. */
  lastMonth: StoreLastMonth;
  negContributionMonths: number;
  /** 14 ngày gần nhất (mới nhất ở cuối), cho biểu đồ vận hành. */
  recentDays: StoreDayRecord[];
  /** 12 tháng gần nhất (mới nhất ở cuối). */
  history: StoreLastMonth[];
}

/** Khoản vay kỳ hạn (economic-model §7.1). Dùng từ bước 05. */
export interface Loan {
  readonly id: LoanId;
  readonly companyId: CompanyId;
  readonly principal: Money;
  outstanding: Money;
  readonly paymentMonthly: Money;
  readonly annualRate: number;
  readonly termMonths: number;
  readonly takenDay: number;
  paymentsMade: number;
}

/** Lệnh chờ áp dụng ở đầu tick kế tiếp, theo thứ tự nhận (ADR-0001 #6). Không có id: lệnh bị từ chối chỉ để lại event. */
export interface QueuedCommand {
  readonly enqueuedDay: number;
  readonly command: Command;
}

export type GameEvent =
  | {
      readonly day: number;
      readonly kind: 'commandRejected';
      readonly companyId: string;
      readonly commandType: string;
      readonly reason: string;
    }
  | {
      readonly day: number;
      readonly kind: 'storeOpened';
      readonly companyId: CompanyId;
      readonly storeId: StoreId;
      readonly districtId: DistrictId;
    }
  | {
      readonly day: number;
      readonly kind: 'storeClosed';
      readonly companyId: CompanyId;
      readonly storeId: StoreId;
    }
  | {
      readonly day: number;
      readonly kind: 'distress' | 'bankrupt';
      readonly companyId: CompanyId;
      readonly overdraft: Money;
      readonly overdraftLimit: Money;
      /** 3 khoản chi lớn nhất tháng (economic-model §8). */
      readonly topExpenses: readonly ExpenseItem[];
      /** Tiền ròng (cash − overdraft) dự báo sau 3 tháng theo xu hướng 3 tháng gần nhất. */
      readonly cashForecast3m: Money;
    }
  | {
      readonly day: number;
      readonly kind: 'cashWarning';
      readonly companyId: CompanyId;
      readonly cashForecast13w: Money;
    }
  | {
      readonly day: number;
      readonly kind: 'loanTaken';
      readonly companyId: CompanyId;
      readonly loanId: LoanId;
      readonly principal: Money;
      readonly annualRate: number;
      readonly termMonths: number;
      readonly paymentMonthly: Money;
    }
  | {
      readonly day: number;
      readonly kind: 'officeLeased';
      readonly companyId: CompanyId;
      readonly districtId: DistrictId;
      readonly size: OfficeSize;
    }
  | {
      readonly day: number;
      readonly kind: 'officeReleased';
      readonly companyId: CompanyId;
    }
  | {
      readonly day: number;
      readonly kind: 'departmentOpened' | 'departmentClosed';
      readonly companyId: CompanyId;
      readonly dept: Department;
    }
  | {
      readonly day: number;
      readonly kind: 'loanRepaid';
      readonly companyId: CompanyId;
      readonly loanId: LoanId;
      readonly principal: Money;
      readonly fee: Money;
    };

export interface ExpenseItem {
  /** Tên dòng P&L (Wages, Rent, COGS…). */
  readonly label: string;
  readonly amount: Money;
}

export interface GameState {
  readonly schemaVersion: 1;
  readonly contentRef: {
    readonly industryId: string;
    readonly scenarioId: string;
    readonly contentVersion: string;
  };
  readonly seed: number;
  clock: { day: number };
  macro: MacroState;
  readonly city: { readonly districtIds: readonly DistrictId[] };
  companies: Record<CompanyId, Company>;
  companyIds: CompanyId[];
  stores: Record<StoreId, Store>;
  storeIds: StoreId[];
  loans: Record<LoanId, Loan>;
  loanIds: LoanId[];
  ledger: Ledger;
  statements: Record<CompanyId, MonthlyStatements[]>;
  commandQueue: QueuedCommand[];
  events: GameEvent[];
  nextIds: { store: number; loan: number };
}
