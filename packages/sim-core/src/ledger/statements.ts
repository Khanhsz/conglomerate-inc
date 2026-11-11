/** Báo cáo tài chính tháng tính từ sổ cái (economic-model §11). */
import { firstDayOfMonth, lastDayOfMonth } from '../calendar';
import { add, fromFloatCents, sub, sum, ZERO, type Money } from '../money';
import { DEPARTMENTS, type CompanyId } from '../types/content';
import type { AccountBalances, AccountTotals, Ledger } from '../types/ledger';
import type {
  BalanceSheet,
  CashFlow,
  Kpis,
  MonthlyStatements,
  OperatingStats,
  PnL,
} from '../types/statements';
import { ACC, ACCOUNTS, DEPARTMENT_ACCOUNT, type AccountCode } from './accounts';
import { balancesAt, periodTotals, retainedEarnings } from './balances';

const MONTHS_PER_YEAR_FOR_KPI = 12;

/** Phát sinh ròng theo vế tăng của tài khoản trong kỳ. */
function movement(flow: AccountTotals, code: AccountCode): Money {
  const { debit, credit } = flow[code];
  return ACCOUNTS[code].normal === 'debit' ? sub(debit, credit) : sub(credit, debit);
}

function buildPnl(flow: AccountTotals): PnL {
  const revenue = movement(flow, ACC.Revenue);
  const cogs = movement(flow, ACC.COGS);
  const wages = movement(flow, ACC.Wages);
  const rent = movement(flow, ACC.Rent);
  const marketing = movement(flow, ACC.Marketing);
  const admin = movement(flow, ACC.Admin);
  const officeRent = movement(flow, ACC.OfficeRent);
  const departments = sum(DEPARTMENTS.map((d) => movement(flow, DEPARTMENT_ACCOUNT[d])));
  const research = movement(flow, ACC.ResearchAndDevelopment);
  const amenities = movement(flow, ACC.StoreAmenities);
  const depreciation = movement(flow, ACC.Depreciation);
  const lossOnDisposal = movement(flow, ACC.LossOnDisposal);
  const interest = movement(flow, ACC.InterestExpense);
  const incomeTax = movement(flow, ACC.IncomeTax);
  const grossProfit = sub(revenue, cogs);
  const ebitda = sub(
    grossProfit,
    sum([wages, amenities, rent, marketing, admin, officeRent, departments, research]),
  );
  const ebit = sub(ebitda, add(depreciation, lossOnDisposal));
  const preTax = sub(ebit, interest);
  const netIncome = sub(preTax, incomeTax);
  return {
    revenue,
    cogs,
    grossProfit,
    wages,
    amenities,
    rent,
    marketing,
    admin,
    officeRent,
    departments,
    research,
    ebitda,
    depreciation,
    lossOnDisposal,
    ebit,
    interest,
    preTax,
    incomeTax,
    netIncome,
  };
}

function buildBalanceSheet(b: AccountBalances): BalanceSheet {
  const cash = b[ACC.Cash];
  const ppe = b[ACC.PPE];
  const accumulatedDepreciation = b[ACC.AccumulatedDepreciation];
  const overdraft = b[ACC.Overdraft];
  const loans = b[ACC.Loans];
  const taxPayable = b[ACC.TaxPayable];
  const shareCapital = b[ACC.ShareCapital];
  const re = retainedEarnings(b);
  return {
    cash,
    ppe,
    accumulatedDepreciation,
    totalAssets: sub(add(cash, ppe), accumulatedDepreciation),
    overdraft,
    loans,
    taxPayable,
    totalLiabilities: sum([overdraft, loans, taxPayable]),
    shareCapital,
    retainedEarnings: re,
    totalEquity: add(shareCapital, re),
  };
}

/**
 * Gián tiếp: CFO = NI + khấu hao + lỗ thanh lý + ΔTaxPayable; CFI = −capex (phát sinh Nợ PP&E);
 * CFF = góp vốn + vay − trả gốc + ΔOverdraft. Đẳng thức CFO + CFI + CFF = ΔCash đúng khi khấu hao ghi
 * Nợ Depreciation / Có AccumDep và thanh lý ghi đúng §6.1 — `checkStatements` bắt trường hợp lệch.
 */
function buildCashFlow(
  pnl: PnL,
  flow: AccountTotals,
  open: AccountBalances,
  close: AccountBalances,
): CashFlow {
  const changeInTaxPayable = sub(close[ACC.TaxPayable], open[ACC.TaxPayable]);
  const cfo = sum([pnl.netIncome, pnl.depreciation, pnl.lossOnDisposal, changeInTaxPayable]);
  const capex = flow[ACC.PPE].debit;
  const cfi = sub(ZERO, capex);
  const equityIssued = movement(flow, ACC.ShareCapital);
  const borrowings = flow[ACC.Loans].credit;
  const principalRepaid = flow[ACC.Loans].debit;
  const changeInOverdraft = sub(close[ACC.Overdraft], open[ACC.Overdraft]);
  const cff = add(sub(add(equityIssued, borrowings), principalRepaid), changeInOverdraft);
  return {
    openingCash: open[ACC.Cash],
    netIncome: pnl.netIncome,
    depreciation: pnl.depreciation,
    lossOnDisposal: pnl.lossOnDisposal,
    changeInTaxPayable,
    cfo,
    capex,
    cfi,
    equityIssued,
    borrowings,
    principalRepaid,
    changeInOverdraft,
    cff,
    netChange: sum([cfo, cfi, cff]),
    closingCash: close[ACC.Cash],
  };
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

function buildKpis(pnl: PnL, bs: BalanceSheet, ops: OperatingStats): Kpis {
  const netDebt = bs.loans + bs.overdraft - bs.cash;
  return {
    grossMargin: ratio(pnl.grossProfit, pnl.revenue),
    ebitdaMargin: ratio(pnl.ebitda, pnl.revenue),
    avgUtilization: ops.avgUtilization,
    revenuePerStore: ops.storeCount > 0 ? fromFloatCents(pnl.revenue / ops.storeCount) : null,
    roeAnnualized: ratio(MONTHS_PER_YEAR_FOR_KPI * pnl.netIncome, bs.totalEquity),
    netDebtToEbitda: ratio(netDebt, MONTHS_PER_YEAR_FOR_KPI * pnl.ebitda),
  };
}

export function buildMonthlyStatements(
  ledger: Ledger,
  companyId: CompanyId,
  month: number,
  ops: OperatingStats,
): MonthlyStatements {
  if (!Number.isSafeInteger(ops.storeCount) || ops.storeCount < 0) {
    throw new RangeError(`storeCount must be a non-negative integer, got ${ops.storeCount}`);
  }
  if (ops.avgUtilization !== null && !Number.isFinite(ops.avgUtilization)) {
    throw new RangeError(`avgUtilization must be finite or null, got ${ops.avgUtilization}`);
  }
  const fromDay = firstDayOfMonth(month);
  const toDay = lastDayOfMonth(month);
  const open = balancesAt(ledger, companyId, fromDay - 1);
  const close = balancesAt(ledger, companyId, toDay);
  const flow = periodTotals(ledger, companyId, fromDay, toDay);
  const pnl = buildPnl(flow);
  const balanceSheet = buildBalanceSheet(close);
  return {
    companyId,
    month,
    fromDay,
    toDay,
    pnl,
    balanceSheet,
    cashFlow: buildCashFlow(pnl, flow, open, close),
    kpis: buildKpis(pnl, balanceSheet, ops),
  };
}

/** Kiểm tra nội tại một bộ báo cáo; trả danh sách vi phạm (rỗng = hợp lệ). Dùng trong test và checkInvariants. */
export function checkStatements(s: MonthlyStatements): string[] {
  const problems: string[] = [];
  const where = `statements ${s.companyId} month ${s.month}`;
  const expectEq = (label: string, actual: number, expected: number) => {
    if (actual !== expected) problems.push(`${where}: ${label} = ${actual}, expected ${expected}`);
  };

  for (const [group, record] of [
    ['pnl', s.pnl],
    ['balanceSheet', s.balanceSheet],
    ['cashFlow', s.cashFlow],
  ] as const) {
    for (const [field, value] of Object.entries(record)) {
      if (!Number.isSafeInteger(value))
        problems.push(`${where}: ${group}.${field} is not a safe integer (${value})`);
    }
  }
  for (const [field, value] of Object.entries(s.kpis)) {
    if (value !== null && !Number.isFinite(value))
      problems.push(`${where}: kpis.${field} is not finite (${value})`);
  }

  const p = s.pnl;
  expectEq('pnl.grossProfit', p.grossProfit, p.revenue - p.cogs);
  expectEq(
    'pnl.ebitda',
    p.ebitda,
    p.grossProfit -
      p.wages -
      p.amenities -
      p.rent -
      p.marketing -
      p.admin -
      p.officeRent -
      p.departments -
      p.research,
  );
  expectEq('pnl.ebit', p.ebit, p.ebitda - p.depreciation - p.lossOnDisposal);
  expectEq('pnl.preTax', p.preTax, p.ebit - p.interest);
  expectEq('pnl.netIncome', p.netIncome, p.preTax - p.incomeTax);

  const b = s.balanceSheet;
  expectEq('balanceSheet.totalAssets', b.totalAssets, b.cash + b.ppe - b.accumulatedDepreciation);
  expectEq('balanceSheet.totalLiabilities', b.totalLiabilities, b.overdraft + b.loans + b.taxPayable);
  expectEq('balanceSheet.totalEquity', b.totalEquity, b.shareCapital + b.retainedEarnings);
  expectEq('assets − (liabilities + equity)', b.totalAssets - (b.totalLiabilities + b.totalEquity), 0);
  if (b.cash < 0) problems.push(`${where}: cash is negative (${b.cash})`);

  const c = s.cashFlow;
  expectEq('cashFlow.netIncome', c.netIncome, p.netIncome);
  expectEq('cashFlow.cfo', c.cfo, c.netIncome + c.depreciation + c.lossOnDisposal + c.changeInTaxPayable);
  expectEq('cashFlow.cfi', c.cfi, -c.capex);
  expectEq('cashFlow.cff', c.cff, c.equityIssued + c.borrowings - c.principalRepaid + c.changeInOverdraft);
  expectEq('cashFlow.netChange', c.netChange, c.cfo + c.cfi + c.cff);
  expectEq('CFO + CFI + CFF − ΔCash', c.netChange - (c.closingCash - c.openingCash), 0);
  expectEq('cashFlow.closingCash', c.closingCash, b.cash);
  return problems;
}
