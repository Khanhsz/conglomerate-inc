/**
 * Kiểu của content đã validate (industry pack + scenario). Định nghĩa ở sim-core;
 * package `content` phải parse ra đúng kiểu này (ADR-0001 #8). Content được deep-freeze.
 * Tên trường khớp YAML; ý nghĩa ở docs/economic-model.md.
 */
import type { Money } from '../money';

export const QUALITY_TIERS = ['basic', 'standard', 'premium'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const PERSONALITIES = ['discount', 'balanced', 'premium'] as const;
export type Personality = (typeof PERSONALITIES)[number];

/** Quy mô văn phòng (economic-model §15.1). */
export const OFFICE_SIZES = ['small', 'medium', 'large'] as const;
export type OfficeSize = (typeof OFFICE_SIZES)[number];

/** Phòng ban; mỗi phòng chiếm 1 slot văn phòng (economic-model §15.2). Thứ tự này là thứ tự duyệt và hiển thị. */
export const DEPARTMENTS = ['hr', 'product', 'finance', 'marketing', 'board'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export interface OfficeSizeDef {
  readonly slots: number;
  /** Capex sửa sang, trước CPI. */
  readonly fitOut: Money;
  /** Thuê văn phòng = district.rentMonthly × rentMultiplier × priceIndex. */
  readonly rentMultiplier: number;
  /** Overhead văn phòng mỗi tháng, trước CPI (ghi vào Admin). */
  readonly overheadMonthly: Money;
}

export interface DepartmentDef {
  /** Phí mở một lần, trước CPI. */
  readonly openingCost: Money;
  /** Chi phí cố định mỗi tháng, trước CPI. */
  readonly fixedMonthly: Money;
}

export type SegmentId = string;
export type DistrictId = string;
export type CompanyId = string;

export interface QualityTierDef {
  readonly quality: number;
  readonly unitCostMultiplier: number;
}

export interface BrandParams {
  readonly alpha: number;
  readonly halfSaturationDaily: Money;
  readonly decayPerDay: number;
  readonly wordOfMouth: number;
  readonly initialAwareness: number;
}

export interface SegmentBetas {
  readonly q: number;
  readonly p: number;
  readonly b: number;
  readonly d: number;
  readonly w: number;
}

export interface SegmentDef {
  readonly visitsPerPersonPerDay: number;
  readonly maxTravelKm: number;
  readonly outsideUtility: number;
  readonly incomeElasticityOfPriceSensitivity: number;
  readonly betas: SegmentBetas;
}

export interface AiPersonalityDef {
  readonly qualityTier: QualityTier;
  readonly markup: number;
  readonly wageRatio: number;
  readonly marketingShareOfRevenue: number;
}

export interface ExpansionRule {
  /** Lãi đóng góp trung bình 3 tháng / tổng capex cửa hàng đang mở, mỗi tháng. */
  readonly minMonthlyRoi: number;
  /** Cash ≥ cashMultiple × capex của cửa hàng mới. */
  readonly cashMultiple: number;
}

/** Luật tháng của AI (economic-model §9). */
export interface AiRules {
  readonly highUtilization: number;
  readonly lowUtilization: number;
  readonly priceAdjust: number;
  readonly maxPriceStep: number;
  readonly targetUtilization: number;
  readonly maxStaffStep: number;
  readonly closeAfterNegativeMonths: number;
  readonly expansion: ExpansionRule;
}

export interface IndustryContent {
  readonly id: string;
  readonly name: { readonly vi: string; readonly en: string };
  readonly referencePrice: Money;
  readonly unitCost: Money;
  readonly dailyDemandNoise: number;
  readonly serviceAdjustRate: number;
  readonly customersPerStaffPerDay: number;
  readonly minStaffPerStore: number;
  readonly moraleWageSensitivity: number;
  readonly moraleAdjustRate: number;
  readonly skillGainPerDay: number;
  readonly newHireSkill: number;
  readonly overheadBaseMonthly: Money;
  readonly overheadExponent: number;
  readonly usefulLifeMonths: number;
  /** Giá trị ban đầu của cửa hàng mở bằng OpenStore. */
  readonly newStore: { readonly staff: number; readonly morale: number; readonly serviceLevel: number };
  /** Số nhân viên của cửa hàng ban đầu của AI. */
  readonly aiInitialStaff: number;
  readonly qualityTiers: { readonly [T in QualityTier]: QualityTierDef };
  readonly brand: BrandParams;
  readonly segments: { readonly [id: SegmentId]: SegmentDef };
  readonly aiRules: AiRules;
  readonly aiPersonalities: { readonly [P in Personality]: AiPersonalityDef };
  /** M1.6 (economic-model §15). */
  readonly office: { readonly sizes: { readonly [S in OfficeSize]: OfficeSizeDef } };
  readonly departments: { readonly [D in Department]: DepartmentDef };
}

export interface MacroParams {
  readonly inflationAnnual: number;
  readonly policyRateAnnual: number;
  readonly incomeIndex: number;
  readonly priceIndex: number;
  readonly corporateTaxRate: number;
  readonly marketWageMonthly: Money;
}

export interface LoanSpreadTier {
  readonly maxLeverage: number;
  readonly spread: number;
}

export interface FinanceParams {
  readonly overdraftFloor: Money;
  readonly overdraftSpread: number;
  /** Tăng dần theo maxLeverage; leverage vượt bậc cuối → từ chối khoản vay. */
  readonly loanSpreads: readonly LoanSpreadTier[];
  readonly earlyRepaymentFee: number;
  /** M1.6 (economic-model §19.1). */
  readonly creditLine: CreditLineParams;
}

export interface CreditLineParams {
  readonly revenueMultiple: number;
  readonly maxLeverage: number;
  readonly spreadDiscount: number;
  readonly commitmentFeeAnnual: number;
}

export interface DistrictDef {
  readonly id: DistrictId;
  readonly x: number;
  readonly y: number;
  readonly pop: number;
  /** Tỷ trọng phân khúc, tổng = 1. Phân khúc vắng mặt = 0. */
  readonly mix: { readonly [segment: SegmentId]: number };
  readonly rentMonthly: Money;
  readonly fitOutCost: Money;
}

export interface CityDef {
  readonly name: string;
  readonly gridW: number;
  readonly gridH: number;
  readonly districtSizeKm: number;
  readonly sameDistrictKm: number;
  readonly districts: readonly DistrictDef[];
}

interface CompanyDefBase {
  readonly id: CompanyId;
  readonly name: string;
  /** Vốn góp ban đầu, trước capex của cửa hàng ban đầu. */
  readonly startingCash: Money;
  readonly initialStores: readonly DistrictId[];
}

export interface PlayerCompanyDef extends CompanyDefBase {
  readonly kind: 'player';
}

export interface AiCompanyDef extends CompanyDefBase {
  readonly kind: 'ai';
  readonly personality: Personality;
}

export type CompanyDef = PlayerCompanyDef | AiCompanyDef;

export interface ScenarioContent {
  readonly id: string;
  readonly industry: string;
  readonly seed: number;
  readonly macro: MacroParams;
  readonly finance: FinanceParams;
  readonly city: CityDef;
  readonly companies: readonly CompanyDef[];
}

export interface LoadedContent {
  readonly industry: IndustryContent;
  readonly scenario: ScenarioContent;
  /** fnv1a64 của content đã chuẩn hóa; lưu trong GameState.contentRef để phát hiện lệch content. */
  readonly contentVersion: string;
}
