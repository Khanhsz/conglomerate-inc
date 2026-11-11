/**
 * Zod schema cho industry pack và scenario (ADR-0001 #8). Kiểm tra trong phạm vi một tài liệu;
 * ràng buộc chéo giữa industry và scenario nằm ở load.ts.
 * Output phải gán được vào IndustryContent / ScenarioContent của sim-core (kiểm tra ở load.ts lúc biên dịch).
 */
import { DEPARTMENTS, MAX_STAFF_PER_STORE, money, PERSONALITIES, QUALITY_TIERS } from '@game/sim-core';
import { z } from 'zod';

const MIX_TOLERANCE = 1e-9;

/** Số nguyên cent ≥ 0 → Money. */
const moneyCents = z
  .number()
  .int('phải là số nguyên cent')
  .min(0)
  .transform((n) => money(n));
const positiveMoneyCents = z
  .number()
  .int('phải là số nguyên cent')
  .positive()
  .transform((n) => money(n));

const unit = z.number().min(0).max(1);
const nonNegative = z.number().min(0);
const positive = z.number().positive();
const id = z.string().min(1);

const qualityTierDef = z.strictObject({ quality: unit, unitCostMultiplier: positive });

const officeSizeDef = z.strictObject({
  slots: z.number().int().min(1).max(DEPARTMENTS.length),
  fitOut: moneyCents,
  rentMultiplier: nonNegative,
  overheadMonthly: moneyCents,
});
const departmentDef = z.strictObject({ openingCost: moneyCents, fixedMonthly: moneyCents });
/** 4 giá trị cho mức 0–3: mức 0 trung tính (= `neutral`, giữ nguyên M1) và không giảm theo mức. */
function levelsOk(v: readonly number[], neutral: number): boolean {
  return v[0] === neutral && v.every((x, i) => i === 0 || x >= (v[i - 1] ?? x));
}
const LEVELS_MESSAGE = 'mức 0 phải trung tính (như M1) và giá trị không được giảm theo mức';
const moneyLevels = z
  .tuple([moneyCents, moneyCents, moneyCents, moneyCents])
  .refine((v) => levelsOk(v, 0), LEVELS_MESSAGE);
const numberLevels = (item: z.ZodNumber, neutral: number) =>
  z.tuple([item, item, item, item]).refine((v) => levelsOk(v, neutral), LEVELS_MESSAGE);
const hrPolicies = z.strictObject({
  trainingCostPerStaffMonthly: moneyLevels,
  trainingMult: numberLevels(positive, 1),
  trainingNewHire: numberLevels(unit, 0),
  benefitsShare: numberLevels(unit, 0),
  benefitsMorale: numberLevels(unit, 0),
  bonusRateMax: unit,
});

const segmentDef = z.strictObject({
  visitsPerPersonPerDay: nonNegative,
  maxTravelKm: positive,
  outsideUtility: z.number(),
  incomeElasticityOfPriceSensitivity: nonNegative,
  betas: z.strictObject({ q: nonNegative, p: nonNegative, b: nonNegative, d: nonNegative, w: nonNegative }),
});

const aiPersonalityDef = z.strictObject({
  qualityTier: z.enum(QUALITY_TIERS),
  markup: positive,
  wageRatio: positive,
  marketingShareOfRevenue: unit,
});

export const industrySchema = z
  .strictObject({
    id,
    name: z.strictObject({ vi: z.string(), en: z.string() }),
    referencePrice: positiveMoneyCents,
    unitCost: positiveMoneyCents,
    dailyDemandNoise: nonNegative,
    serviceAdjustRate: unit,
    customersPerStaffPerDay: positive,
    minStaffPerStore: z.number().int().min(1),
    moraleWageSensitivity: positive,
    moraleAdjustRate: unit,
    skillGainPerDay: unit,
    newHireSkill: unit,
    overheadBaseMonthly: moneyCents,
    overheadExponent: positive,
    usefulLifeMonths: z.number().int().min(1),
    newStore: z.strictObject({
      staff: z.number().int().min(1).max(MAX_STAFF_PER_STORE),
      morale: unit,
      serviceLevel: unit,
    }),
    aiInitialStaff: z.number().int().min(1).max(MAX_STAFF_PER_STORE),
    qualityTiers: z.strictObject({
      basic: qualityTierDef,
      standard: qualityTierDef,
      premium: qualityTierDef,
    }),
    brand: z.strictObject({
      alpha: unit,
      halfSaturationDaily: positiveMoneyCents,
      decayPerDay: unit,
      wordOfMouth: nonNegative,
      initialAwareness: unit,
    }),
    segments: z.record(id, segmentDef).refine((s) => Object.keys(s).length > 0, 'cần ít nhất một phân khúc'),
    aiRules: z.strictObject({
      highUtilization: unit,
      lowUtilization: unit,
      priceAdjust: unit,
      maxPriceStep: unit,
      targetUtilization: z.number().gt(0).max(1),
      maxStaffStep: z.number().int().min(1),
      closeAfterNegativeMonths: z.number().int().min(1),
      expansion: z.strictObject({ minMonthlyRoi: z.number(), cashMultiple: nonNegative }),
    }),
    aiPersonalities: z.strictObject({
      discount: aiPersonalityDef,
      balanced: aiPersonalityDef,
      premium: aiPersonalityDef,
    }),
    office: z.strictObject({
      sizes: z.strictObject({ small: officeSizeDef, medium: officeSizeDef, large: officeSizeDef }),
    }),
    departments: z.strictObject({
      hr: departmentDef,
      product: departmentDef,
      finance: departmentDef,
      marketing: departmentDef,
      board: departmentDef,
    }),
    hrPolicies,
  })
  .superRefine((ind, ctx) => {
    const min = ind.minStaffPerStore;
    if (ind.newStore.staff < min) {
      ctx.addIssue({
        code: 'custom',
        path: ['newStore', 'staff'],
        message: `phải ≥ minStaffPerStore (${min})`,
      });
    }
    if (ind.aiInitialStaff < min) {
      ctx.addIssue({ code: 'custom', path: ['aiInitialStaff'], message: `phải ≥ minStaffPerStore (${min})` });
    }
  });

const districtDef = z.strictObject({
  id,
  x: z.number().int(),
  y: z.number().int(),
  pop: z.number().int().min(0),
  mix: z.record(id, unit),
  rentMonthly: moneyCents,
  fitOutCost: moneyCents,
});

const city = z
  .strictObject({
    name: z.string(),
    gridW: z.number().int().min(1),
    gridH: z.number().int().min(1),
    districtSizeKm: positive,
    sameDistrictKm: positive,
    districts: z.array(districtDef).min(1),
  })
  .superRefine((c, ctx) => {
    const ids = new Map<string, number>();
    const coords = new Map<string, string>();
    c.districts.forEach((d, i) => {
      if (d.x < 0 || d.x >= c.gridW) {
        ctx.addIssue({
          code: 'custom',
          path: ['districts', i, 'x'],
          message: `x = ${d.x} nằm ngoài lưới [0, ${c.gridW - 1}]`,
        });
      }
      if (d.y < 0 || d.y >= c.gridH) {
        ctx.addIssue({
          code: 'custom',
          path: ['districts', i, 'y'],
          message: `y = ${d.y} nằm ngoài lưới [0, ${c.gridH - 1}]`,
        });
      }
      const firstIndex = ids.get(d.id);
      if (firstIndex === undefined) ids.set(d.id, i);
      else {
        ctx.addIssue({
          code: 'custom',
          path: ['districts', i, 'id'],
          message: `id quận "${d.id}" trùng với districts[${firstIndex}]`,
        });
      }
      const key = `${d.x},${d.y}`;
      const owner = coords.get(key);
      if (owner === undefined) coords.set(key, d.id);
      else {
        ctx.addIssue({
          code: 'custom',
          path: ['districts', i],
          message: `tọa độ (${d.x}, ${d.y}) trùng với quận ${owner}`,
        });
      }
      const total = Object.values(d.mix).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 1) > MIX_TOLERANCE) {
        ctx.addIssue({
          code: 'custom',
          path: ['districts', i, 'mix'],
          message: `tổng tỷ trọng phân khúc = ${Number(total.toFixed(12))}, phải bằng 1 (±${MIX_TOLERANCE})`,
        });
      }
    });
  });

const companyBase = {
  id,
  name: z.string(),
  startingCash: moneyCents,
  initialStores: z.array(id),
};

const company = z.discriminatedUnion('kind', [
  z.strictObject({ ...companyBase, kind: z.literal('player') }),
  z.strictObject({ ...companyBase, kind: z.literal('ai'), personality: z.enum(PERSONALITIES) }),
]);

export const scenarioSchema = z
  .strictObject({
    id,
    industry: id,
    seed: z.number().int(),
    macro: z.strictObject({
      inflationAnnual: z.number().gt(-1),
      policyRateAnnual: z.number().gt(-1),
      incomeIndex: positive,
      priceIndex: positive,
      corporateTaxRate: z.number().min(0).lt(1),
      marketWageMonthly: positiveMoneyCents,
    }),
    finance: z.strictObject({
      overdraftFloor: moneyCents,
      overdraftSpread: nonNegative,
      loanSpreads: z
        .array(z.strictObject({ maxLeverage: positive, spread: nonNegative }))
        .min(1)
        .superRefine((tiers, ctx) => {
          for (let i = 1; i < tiers.length; i++) {
            const prev = tiers[i - 1];
            const cur = tiers[i];
            if (prev && cur && cur.maxLeverage <= prev.maxLeverage) {
              ctx.addIssue({
                code: 'custom',
                path: [i, 'maxLeverage'],
                message: `maxLeverage phải tăng dần (${cur.maxLeverage} ≤ ${prev.maxLeverage})`,
              });
            }
          }
        }),
      earlyRepaymentFee: unit,
      creditLine: z.strictObject({
        revenueMultiple: nonNegative,
        maxLeverage: positive,
        spreadDiscount: nonNegative,
        commitmentFeeAnnual: unit,
      }),
    }),
    city,
    companies: z.array(company).min(1),
  })
  .superRefine((s, ctx) => {
    const players = s.companies.filter((c) => c.kind === 'player').length;
    if (players !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['companies'],
        message: `cần đúng 1 công ty kind: player, có ${players}`,
      });
    }
    const seen = new Map<string, number>();
    s.companies.forEach((c, i) => {
      const first = seen.get(c.id);
      if (first === undefined) seen.set(c.id, i);
      else {
        ctx.addIssue({
          code: 'custom',
          path: ['companies', i, 'id'],
          message: `id công ty "${c.id}" trùng với companies[${first}]`,
        });
      }
    });
    const districtIds = new Set(s.city.districts.map((d) => d.id));
    s.companies.forEach((c, i) => {
      c.initialStores.forEach((districtId, j) => {
        if (!districtIds.has(districtId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['companies', i, 'initialStores', j],
            message: `quận "${districtId}" không tồn tại trong city.districts`,
          });
        }
      });
    });
  });

export type IndustryParsed = z.output<typeof industrySchema>;
export type ScenarioParsed = z.output<typeof scenarioSchema>;
