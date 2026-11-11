/**
 * Phòng Tài chính (economic-model §19.1): P&L theo cửa hàng và tư vấn vay. Hàm thuần, không đổi state.
 * Phần "cấp công ty" = P&L công ty − Σ cửa hàng, nên tổng luôn khớp §11.
 */
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { earlyFee } from '../commands/repayLoan';
import { fromFloatCents, sub, sum, ZERO, type Money } from '../money';
import { creditLineMax, currentLeverage, loanQuote, revenueTrailing3m } from '../systems/loans';
import type { CompanyId, LoadedContent } from '../types/content';
import type { GameState } from '../types/state';
import type { PnL } from '../types/statements';

export interface StorePnlLines {
  readonly revenue: Money;
  readonly cogs: Money;
  readonly wages: Money;
  readonly rent: Money;
  readonly depreciation: Money;
  /** Doanh thu − giá vốn − lương − thuê (như luật AI §9.3). */
  readonly contribution: Money;
  /** Lãi đóng góp − khấu hao. */
  readonly operatingProfit: Money;
}

export interface StorePnlRow extends StorePnlLines {
  readonly storeId: string;
  readonly districtId: string;
  readonly status: 'open' | 'closed';
}

export interface StorePnl {
  readonly month: number;
  readonly stores: readonly StorePnlRow[];
  readonly storesTotal: StorePnlLines;
  /** Mỗi dòng P&L công ty trừ phần của các cửa hàng (phí phá hợp đồng, khấu hao văn phòng, overhead…). */
  readonly corporate: { readonly [K in keyof PnL]: Money };
  readonly company: PnL;
}

function lines(
  l: Pick<StorePnlLines, 'revenue' | 'cogs' | 'wages' | 'rent' | 'depreciation'>,
): StorePnlLines {
  const contribution = sub(l.revenue, sum([l.cogs, l.wages, l.rent]));
  return { ...l, contribution, operatingProfit: sub(contribution, l.depreciation) };
}

/** P&L tháng `month` theo cửa hàng; null nếu tháng chưa chốt. Cửa hàng chỉ có trong 12 tháng gần nhất. */
export function storePnl(state: GameState, companyId: CompanyId, month: number): StorePnl | null {
  const company = (state.statements[companyId] ?? []).find((s) => s.month === month)?.pnl;
  if (!company) return null;
  const stores: StorePnlRow[] = [];
  for (const id of state.storeIds) {
    const store = state.stores[id];
    if (!store || store.companyId !== companyId) continue;
    const m = store.history.find((h) => h.month === month);
    if (!m) continue;
    stores.push({
      storeId: id,
      districtId: store.districtId,
      status: store.status,
      ...lines({
        revenue: m.revenue,
        cogs: m.cogs,
        wages: m.wages,
        rent: m.rent,
        depreciation: m.depreciation,
      }),
    });
  }
  const total = (k: 'revenue' | 'cogs' | 'wages' | 'rent' | 'depreciation') => sum(stores.map((s) => s[k]));
  const storesTotal = lines({
    revenue: total('revenue'),
    cogs: total('cogs'),
    wages: total('wages'),
    rent: total('rent'),
    depreciation: total('depreciation'),
  });
  const storePart: Partial<Record<keyof PnL, Money>> = {
    revenue: storesTotal.revenue,
    cogs: storesTotal.cogs,
    grossProfit: sub(storesTotal.revenue, storesTotal.cogs),
    wages: storesTotal.wages,
    rent: storesTotal.rent,
    depreciation: storesTotal.depreciation,
  };
  const c = (k: keyof PnL): Money => sub(company[k], storePart[k] ?? ZERO);
  const corporate = {
    revenue: c('revenue'),
    cogs: c('cogs'),
    grossProfit: c('grossProfit'),
    wages: c('wages'),
    rent: c('rent'),
    marketing: c('marketing'),
    admin: c('admin'),
    officeRent: c('officeRent'),
    departments: c('departments'),
    research: c('research'),
    ebitda: c('ebitda'),
    depreciation: c('depreciation'),
    lossOnDisposal: c('lossOnDisposal'),
    ebit: c('ebit'),
    interest: c('interest'),
    preTax: c('preTax'),
    incomeTax: c('incomeTax'),
    netIncome: c('netIncome'),
  };
  return { month, stores, storesTotal, corporate, company };
}

export type AdviceCode =
  'noHistory' | 'highLeverage' | 'lowDscr' | 'refinanceCheaper' | 'overdraftInUse' | 'creditLineAvailable';

export interface LoanTier {
  readonly maxLeverage: number;
  readonly annualRate: number;
  /** Vay thêm tối đa mà vẫn ở bậc lãi này (0 nếu đã vượt). */
  readonly maxPrincipal: Money;
}

export interface RefinanceOption {
  readonly loanId: string;
  readonly outstanding: Money;
  readonly annualRate: number;
  readonly fee: Money;
  /** Lãi của khoản mới nếu tái cấp vốn hôm nay; null nếu bị từ chối. */
  readonly newRate: number | null;
}

export interface FinanceAdvice {
  /** EBITDA 12 tháng gần nhất (năm hóa nếu ít hơn 12 tháng). */
  readonly ebitdaAnnual: Money;
  readonly debt: Money;
  readonly leverage: number | null;
  /** Trả góp 12 tháng tới của các khoản đang còn nợ. */
  readonly debtServiceAnnual: Money;
  /** EBITDA năm / trả góp năm; null khi không có nghĩa vụ trả nợ. */
  readonly dscr: number | null;
  /** Lãi 12 tháng / EBITDA 12 tháng. */
  readonly interestBurden: number | null;
  readonly tiers: readonly LoanTier[];
  readonly refinance: readonly RefinanceOption[];
  readonly creditLine: {
    readonly limit: Money;
    readonly max: Money;
    readonly eligible: boolean;
    readonly overdraftRate: number;
    readonly creditLineRate: number;
    readonly commitmentFeeAnnual: number;
  };
  readonly advice: readonly AdviceCode[];
}

/** Ngưỡng khuyến nghị (chỉ để hiển thị, không ảnh hưởng mô phỏng). */
const DSCR_WARNING = 1.5;
const REFINANCE_GAIN = 0.005;

export function financeAdvice(
  state: GameState,
  content: LoadedContent,
  companyId: CompanyId,
): FinanceAdvice | null {
  const company = state.companies[companyId];
  if (!company) return null;
  const { finance } = content.scenario;
  const history = (state.statements[companyId] ?? []).slice(-12);
  const scale = history.length > 0 ? 12 / history.length : 0;
  const ebitdaAnnual = fromFloatCents(history.reduce((a, s) => a + s.pnl.ebitda, 0) * scale);
  const interestAnnual = history.reduce((a, s) => a + s.pnl.interest, 0) * scale;
  const b = currentBalances(state.ledger, companyId);
  const debt = fromFloatCents(b[ACC.Loans] + b[ACC.Overdraft]);
  const leverage = currentLeverage(state, companyId);
  const loans = state.loanIds
    .map((id) => state.loans[id])
    .filter((l) => l !== undefined && l.companyId === companyId && l.outstanding > 0);
  const debtServiceAnnual = fromFloatCents(loans.reduce((a, l) => a + (l?.paymentMonthly ?? 0) * 12, 0));
  const base = Math.max(1, ebitdaAnnual);
  const tiers = finance.loanSpreads.map((t) => ({
    maxLeverage: t.maxLeverage,
    annualRate: state.macro.policyRateAnnual + t.spread,
    maxPrincipal: ebitdaAnnual > 0 ? fromFloatCents(Math.max(0, t.maxLeverage * base - debt)) : ZERO,
  }));
  const refinance = loans.flatMap((l) => {
    if (!l) return [];
    const fee = earlyFee(l, content);
    const quote = loanQuote(state, content, companyId, fee);
    return [
      {
        loanId: l.id,
        outstanding: l.outstanding,
        annualRate: l.annualRate,
        fee,
        newRate: quote.ok ? quote.annualRate : null,
      },
    ];
  });
  const max = creditLineMax(finance, revenueTrailing3m(state, companyId));
  const eligible = leverage !== null && leverage <= finance.creditLine.maxLeverage;
  const overdraftRate = state.macro.policyRateAnnual + finance.overdraftSpread;
  const dscr = debtServiceAnnual > 0 ? ebitdaAnnual / debtServiceAnnual : null;
  const advice: AdviceCode[] = [];
  if (history.length === 0) advice.push('noHistory');
  const maxTier = finance.loanSpreads[finance.loanSpreads.length - 1]?.maxLeverage ?? 0;
  if (leverage !== null && leverage > maxTier * 0.8) advice.push('highLeverage');
  if (dscr !== null && dscr < DSCR_WARNING) advice.push('lowDscr');
  if (refinance.some((r) => r.newRate !== null && r.newRate < r.annualRate - REFINANCE_GAIN))
    advice.push('refinanceCheaper');
  if (b[ACC.Overdraft] > 0) advice.push('overdraftInUse');
  if (eligible && company.creditLine.limit === 0 && company.departments.finance !== null)
    advice.push('creditLineAvailable');
  return {
    ebitdaAnnual,
    debt,
    leverage,
    debtServiceAnnual,
    dscr,
    interestBurden: ebitdaAnnual > 0 ? interestAnnual / ebitdaAnnual : null,
    tiers,
    refinance,
    creditLine: {
      limit: company.creditLine.limit,
      max,
      eligible,
      overdraftRate,
      creditLineRate: overdraftRate - finance.creditLine.spreadDiscount,
      commitmentFeeAnnual: finance.creditLine.commitmentFeeAnnual,
    },
    advice,
  };
}
