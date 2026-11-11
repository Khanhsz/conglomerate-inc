/** Phòng Nhân sự (economic-model §16): danh sách cửa hàng và tác động của từng mức chính sách. Hàm thuần. */
import { policyMoraleTarget, policyWage } from '../hr';
import { fromFloatCents, mul, pct, sum, ZERO, type Money } from '../money';
import { storeContribution } from '../store';
import { moraleTarget } from '../systems/operations';
import { POLICY_LEVELS, type CompanyId, type LoadedContent, type PolicyLevel } from '../types/content';
import type { GameState, HrPolicy, Store } from '../types/state';

export type StaffStatus = 'ok' | 'lowMorale' | 'overloaded' | 'underused' | 'loss';

export interface HrRosterRow {
  readonly storeId: string;
  readonly districtId: string;
  readonly staff: number;
  readonly wageMonthly: Money;
  readonly wageOverridden: boolean;
  readonly morale: number;
  /** Tinh thần mà cửa hàng đang hướng tới với lương, thưởng và phúc lợi hiện tại. */
  readonly moraleTarget: number;
  readonly skill: number;
  readonly serviceLevel: number;
  readonly revenueLastMonth: Money;
  readonly contributionLastMonth: Money;
  readonly utilizationLastMonth: number | null;
  readonly status: StaffStatus;
}

export interface TrainingOption {
  readonly level: PolicyLevel;
  /** Theo số nhân viên hiện tại, giá hôm nay. */
  readonly monthlyCost: Money;
  readonly skillGainPerDay: number;
  readonly newHireSkill: number;
}

export interface BenefitsOption {
  readonly level: PolicyLevel;
  readonly monthlyCost: Money;
  readonly moraleBonus: number;
}

export interface HrView {
  readonly policy: HrPolicy;
  readonly marketWage: Money;
  readonly standardWage: Money | null;
  readonly roster: readonly HrRosterRow[];
  readonly totals: {
    readonly staff: number;
    readonly avgMorale: number | null;
    readonly avgSkill: number | null;
  };
  readonly training: readonly TrainingOption[];
  readonly benefits: readonly BenefitsOption[];
  /** Thưởng ước tính theo lãi đóng góp dương tháng trước, cho tỷ lệ 0%, 1%, … tới mức tối đa. */
  readonly bonusByPercent: readonly Money[];
  readonly lastMonth: { readonly training: Money; readonly benefits: Money; readonly bonus: Money };
}

/** Ngưỡng hiển thị tình trạng (giống cảnh báo vận hành ở UI; không ảnh hưởng mô phỏng). */
const LOW_MORALE = 0.4;
const OVERLOADED = 0.98;
const UNDERUSED = 0.5;

function status(store: Store, utilization: number | null): StaffStatus {
  if (store.lastMonth.days > 0 && storeContribution(store.lastMonth) < 0) return 'loss';
  if (store.morale < LOW_MORALE) return 'lowMorale';
  if (utilization !== null && utilization >= OVERLOADED) return 'overloaded';
  if (utilization !== null && utilization < UNDERUSED) return 'underused';
  return 'ok';
}

export function hrView(state: GameState, content: LoadedContent, companyId: CompanyId): HrView | null {
  const company = state.companies[companyId];
  if (!company) return null;
  const { industry } = content;
  const params = industry.hrPolicies;
  const policy = company.hrPolicy;
  const priceIndex = state.macro.priceIndex;
  const market = state.macro.marketWageMonthly * priceIndex;
  const stores = state.storeIds
    .map((id) => state.stores[id])
    .filter((s): s is Store => s !== undefined && s.companyId === companyId && s.status === 'open');
  const roster = stores.map((s) => {
    const lm = s.lastMonth;
    const utilization = lm.capacity > 0 ? lm.served / lm.capacity : null;
    const sigmoid = moraleTarget((s.wageMonthly + s.bonusPerHead) / market, industry.moraleWageSensitivity);
    return {
      storeId: s.id,
      districtId: s.districtId,
      staff: s.staff,
      wageMonthly: s.wageMonthly,
      wageOverridden: s.overrides.wage,
      morale: s.morale,
      moraleTarget: policyMoraleTarget(sigmoid, params, policy),
      skill: s.skill,
      serviceLevel: s.serviceLevel,
      revenueLastMonth: lm.revenue,
      contributionLastMonth: storeContribution(lm),
      utilizationLastMonth: utilization,
      status: status(s, utilization),
    };
  });
  const staff = stores.reduce((a, s) => a + s.staff, 0);
  const wageBill = stores.reduce((a, s) => a + s.staff * s.wageMonthly, 0);
  const avg = (f: (s: Store) => number) =>
    staff > 0 ? stores.reduce((a, s) => a + f(s) * s.staff, 0) / staff : null;
  const positive = sum(
    stores.map((s) => {
      const c = storeContribution(s.lastMonth);
      return c > 0 ? c : ZERO;
    }),
  );
  const maxPercent = Math.round(params.bonusRateMax * 100);
  return {
    policy,
    marketWage: fromFloatCents(market),
    standardWage: policyWage(state, policy),
    roster,
    totals: { staff, avgMorale: avg((s) => s.morale), avgSkill: avg((s) => s.skill) },
    training: POLICY_LEVELS.map((level) => ({
      level,
      monthlyCost: mul(params.trainingCostPerStaffMonthly[level], staff * priceIndex),
      skillGainPerDay: industry.skillGainPerDay * params.trainingMult[level],
      newHireSkill: Math.min(1, industry.newHireSkill + params.trainingNewHire[level]),
    })),
    benefits: POLICY_LEVELS.map((level) => ({
      level,
      monthlyCost: fromFloatCents(wageBill * params.benefitsShare[level]),
      moraleBonus: params.benefitsMorale[level],
    })),
    bonusByPercent: Array.from({ length: maxPercent + 1 }, (_, p) => pct(positive, p / 100)),
    lastMonth: {
      training: sum(stores.map((s) => s.lastMonth.training)),
      benefits: sum(stores.map((s) => s.lastMonth.benefits)),
      bonus: sum(stores.map((s) => s.lastMonth.bonus)),
    },
  };
}
