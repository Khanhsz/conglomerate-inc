/**
 * Content nhỏ dựng bằng code cho unit test của sim-core (sim-core không phụ thuộc package content).
 * Thành phố 2×1: quận w (0,0) và e (1,0); 2 phân khúc; người chơi + 1 AI balanced có cửa hàng ở e.
 * Chỉ dùng trong test: bị loại khỏi build chính (tsconfig.json), có trong tsconfig.test.json.
 */
import { freeze, produce, type Draft } from 'immer';
import { hashValue } from '../hash';
import { money } from '../money';
import type { IndustryContent, LoadedContent, ScenarioContent } from '../types/content';

const betas = {
  office: { q: 1.5, p: 1.5, b: 1.5, d: 1.2, w: 1.2 },
  students: { q: 1.0, p: 2.5, b: 1.0, d: 0.9, w: 0.8 },
};

const industry: IndustryContent = {
  id: 'coffee',
  name: { vi: 'Cà phê (fixture)', en: 'Coffee (fixture)' },
  referencePrice: money(350),
  unitCost: money(90),
  dailyDemandNoise: 0.05,
  serviceAdjustRate: 0.2,
  customersPerStaffPerDay: 90,
  minStaffPerStore: 2,
  moraleWageSensitivity: 6,
  moraleAdjustRate: 0.05,
  skillGainPerDay: 0.002,
  newHireSkill: 0.4,
  overheadBaseMonthly: money(300_000),
  overheadExponent: 1.2,
  usefulLifeMonths: 60,
  newStore: { staff: 4, morale: 0.5, serviceLevel: 0.6 },
  aiInitialStaff: 5,
  qualityTiers: {
    basic: { quality: 0.35, unitCostMultiplier: 0.75 },
    standard: { quality: 0.6, unitCostMultiplier: 1 },
    premium: { quality: 0.85, unitCostMultiplier: 1.5 },
  },
  brand: {
    alpha: 0.01,
    halfSaturationDaily: money(10_000),
    decayPerDay: 0.003,
    wordOfMouth: 0.002,
    initialAwareness: 0.05,
  },
  segments: {
    office: {
      visitsPerPersonPerDay: 0.065,
      maxTravelKm: 2.5,
      outsideUtility: 2.0,
      incomeElasticityOfPriceSensitivity: 0,
      betas: betas.office,
    },
    students: {
      visitsPerPersonPerDay: 0.045,
      maxTravelKm: 4,
      outsideUtility: 1.4,
      incomeElasticityOfPriceSensitivity: 0,
      betas: betas.students,
    },
  },
  aiRules: {
    highUtilization: 0.95,
    lowUtilization: 0.6,
    priceAdjust: 0.03,
    maxPriceStep: 0.05,
    targetUtilization: 0.85,
    maxStaffStep: 2,
    closeAfterNegativeMonths: 3,
    expansion: { minMonthlyRoi: 0.02, cashMultiple: 1.5 },
  },
  aiPersonalities: {
    discount: { qualityTier: 'basic', markup: 3.7, wageRatio: 0.95, marketingShareOfRevenue: 0.02 },
    balanced: { qualityTier: 'standard', markup: 3.9, wageRatio: 1.05, marketingShareOfRevenue: 0.04 },
    premium: { qualityTier: 'premium', markup: 4.0, wageRatio: 1.2, marketingShareOfRevenue: 0.06 },
  },
  office: {
    sizes: {
      small: { slots: 2, fitOut: money(4_000_000), rentMultiplier: 0.6, overheadMonthly: money(150_000) },
      medium: { slots: 4, fitOut: money(8_000_000), rentMultiplier: 1, overheadMonthly: money(300_000) },
      large: { slots: 5, fitOut: money(15_000_000), rentMultiplier: 1.6, overheadMonthly: money(600_000) },
    },
  },
  departments: {
    hr: { openingCost: money(1_000_000), fixedMonthly: money(300_000) },
    product: { openingCost: money(2_000_000), fixedMonthly: money(400_000) },
    finance: { openingCost: money(1_000_000), fixedMonthly: money(300_000) },
    marketing: { openingCost: money(1_500_000), fixedMonthly: money(350_000) },
    board: { openingCost: money(2_000_000), fixedMonthly: money(200_000) },
  },
};

const scenario: ScenarioContent = {
  id: 'fixture',
  industry: 'coffee',
  seed: 7,
  macro: {
    inflationAnnual: 0.03,
    policyRateAnnual: 0.04,
    incomeIndex: 1,
    priceIndex: 1,
    corporateTaxRate: 0.2,
    marketWageMonthly: money(220_000),
  },
  finance: {
    overdraftFloor: money(2_000_000),
    overdraftSpread: 0.08,
    loanSpreads: [
      { maxLeverage: 1, spread: 0.02 },
      { maxLeverage: 2, spread: 0.035 },
      { maxLeverage: 3, spread: 0.05 },
    ],
    earlyRepaymentFee: 0.01,
  },
  city: {
    name: 'Testville',
    gridW: 2,
    gridH: 1,
    districtSizeKm: 2,
    sameDistrictKm: 0.5,
    districts: [
      {
        id: 'w',
        x: 0,
        y: 0,
        pop: 10_000,
        mix: { office: 0.5, students: 0.5 },
        rentMonthly: money(500_000),
        fitOutCost: money(10_000_000),
      },
      {
        id: 'e',
        x: 1,
        y: 0,
        pop: 12_000,
        mix: { office: 0.7, students: 0.3 },
        rentMonthly: money(700_000),
        fitOutCost: money(12_000_000),
      },
    ],
  },
  companies: [
    { id: 'player', name: 'Player Co.', kind: 'player', startingCash: money(25_000_000), initialStores: [] },
    {
      id: 'ai-1',
      name: 'AI One',
      kind: 'ai',
      personality: 'balanced',
      startingCash: money(60_000_000),
      initialStores: ['e'],
    },
  ],
};

export interface ContentPair {
  readonly industry: IndustryContent;
  readonly scenario: ScenarioContent;
}

/** Content fixture, có thể chỉnh qua `edit` (draft immer). Kết quả bị deep-freeze như loadContent. */
export function fixtureContent(edit?: (draft: Draft<ContentPair>) => void): LoadedContent {
  const base: ContentPair = { industry, scenario };
  const pair = edit ? produce(base, edit) : base;
  return freeze({ ...pair, contentVersion: hashValue(pair) }, true);
}
