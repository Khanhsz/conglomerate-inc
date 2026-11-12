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

/** Mức chính sách nhân sự 0–3 (economic-model §16); 0 = như M1. */
export const POLICY_LEVELS = [0, 1, 2, 3] as const;
export type PolicyLevel = (typeof POLICY_LEVELS)[number];
/** Một giá trị cho mỗi mức 0–3. */
export type ByLevel<T> = readonly [T, T, T, T];

/** Chính sách nhân sự (economic-model §16). Mức 0 phải là giá trị trung tính (chi phí 0, hệ số 1, cộng 0). */
export interface HrPolicyParams {
  /** Chi phí đào tạo / nhân viên / tháng, trước CPI. */
  readonly trainingCostPerStaffMonthly: ByLevel<Money>;
  readonly trainingMult: ByLevel<number>;
  readonly trainingNewHire: ByLevel<number>;
  /** Phúc lợi = tỷ lệ × lương. */
  readonly benefitsShare: ByLevel<number>;
  readonly benefitsMorale: ByLevel<number>;
  readonly bonusRateMax: number;
}

/** Tiện ích cửa hàng (M1.7, economic-model §21). */
export interface StoreAmenityDef {
  readonly name: string;
  /** Phí lắp đặt mỗi lần bật, trước CPI. */
  readonly setupCost: Money;
  /** Chi phí mỗi tháng khi đang bật, trước CPI. */
  readonly monthlyCost: Money;
  /** Utility cộng thêm (nhân trọng số phân khúc). */
  readonly utility: number;
  readonly segmentWeight: { readonly [segment: SegmentId]: number };
  /** Trọng số trong tiêu chí "Không gian" của đánh giá sao. */
  readonly reviewWeight: number;
}

export type SegmentId = string;
export type DistrictId = string;
export type CompanyId = string;

export interface QualityTierDef {
  readonly quality: number;
  readonly unitCostMultiplier: number;
}

export type ChannelScope = 'city' | 'district';

/** Kênh marketing ngoài `general` (economic-model §18.2). */
export interface MarketingChannelDef {
  readonly name: string;
  /** `city`: một ngân sách cho cả thành phố; `district`: ngân sách riêng từng quận. */
  readonly scope: ChannelScope;
  /** Trọng số theo phân khúc ∈ [0, 1]; phân khúc không khai = 0. */
  readonly segmentWeight: { readonly [segment: SegmentId]: number };
  readonly alpha: number;
  /** Chi mỗi ngày (trước CPI) để đạt 63% hiệu quả tối đa. */
  readonly halfSaturationDaily: Money;
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
  readonly hrPolicies: HrPolicyParams;
  /** Theo id; duyệt bằng key đã sort. */
  readonly storeAmenities: { readonly [id: string]: StoreAmenityDef };
  /** Kênh marketing ngoài `general` (M1.6, §18.2); rỗng = chỉ có `general` như M1. */
  readonly marketingChannels: { readonly [id: string]: MarketingChannelDef };
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

export const ZONES = ['budget', 'central', 'premium'] as const;
/** Khu trong thành phố (M1.8): Bình dân / Trung tâm / Cao cấp. Chỉ là nhãn; kinh tế nằm ở pop, mix, thuê. */
export type Zone = (typeof ZONES)[number];

export interface DistrictDef {
  /** Duy nhất trong cả scenario. */
  readonly id: DistrictId;
  readonly x: number;
  readonly y: number;
  readonly zone: Zone;
  readonly pop: number;
  /** Tỷ trọng phân khúc, tổng = 1. Phân khúc vắng mặt = 0. */
  readonly mix: { readonly [segment: SegmentId]: number };
  readonly rentMonthly: Money;
  readonly fitOutCost: Money;
}

export interface CityDef {
  readonly id: string;
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
  /** Các thành phố (ADR-0003); khách chỉ mua trong thành phố mình sống. Thứ tự này là thứ tự chuẩn của thế giới. */
  readonly cities: readonly CityDef[];
  readonly companies: readonly CompanyDef[];
}

export interface LoadedContent {
  readonly industry: IndustryContent;
  readonly scenario: ScenarioContent;
  /** fnv1a64 của content đã chuẩn hóa; lưu trong GameState.contentRef để phát hiện lệch content. */
  readonly contentVersion: string;
}
