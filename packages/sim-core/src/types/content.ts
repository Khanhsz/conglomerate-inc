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
  readonly qualityTiers: { readonly [T in QualityTier]: QualityTierDef };
  readonly brand: BrandParams;
  readonly segments: { readonly [id: SegmentId]: SegmentDef };
  readonly aiPersonalities: { readonly [P in Personality]: AiPersonalityDef };
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
