/**
 * GameState (spec §2). Dữ liệu thuần, serializable bằng JSON: không class, Map, Set, Date, undefined.
 * Collection: Record<Id, T> + mảng id đã sort để duyệt có thứ tự.
 */
import type { Money } from '../money';
import type { Command } from './commands';
import type { CompanyId, DistrictId, Personality, QualityTier } from './content';
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
  /** Cộng dồn trong tháng, reset khi chốt tháng. `*Accrued` là cent dạng float. */
  mtd: {
    demand: number;
    served: number;
    capacity: number;
    revenue: Money;
    cogs: Money;
    wagesAccrued: number;
    rentAccrued: number;
  };
  /** Kết quả tháng trước, cho AI (economic-model §9) và UI. */
  lastMonth: { revenue: Money; cogs: Money; wages: Money; rent: Money };
  negContributionMonths: number;
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
    };

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
