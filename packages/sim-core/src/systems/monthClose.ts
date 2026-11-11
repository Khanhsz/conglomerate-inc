/**
 * Chốt tháng (economic-model §6–§8, §10). Chạy sau khi clock đã sang ngày đầu tháng mới; mọi bút toán ghi
 * `day = ctx.day` (ngày cuối tháng vừa xong). Thứ tự cho mỗi công ty chưa phá sản:
 *   1. chi phí vận hành (M1), khấu hao (M2), trả góp (M3), lãi thấu chi (M4)
 *   2. thuế tháng (M5); cuối quý quyết toán thuế (M6); cuối năm chuyển lỗ
 *   3. lập và lưu MonthlyStatements; tính lại hạn mức thấu chi
 *   4. distress / bankrupt (thanh lý M7) hoặc cảnh báo sớm
 * rồi chuyển mtd của cửa hàng sang lastMonth.
 */
import { freeze } from 'immer';
import {
  DISTRESS_MONTHS_TO_BANKRUPTCY,
  FORECAST_DISTRESS_MONTHS,
  FORECAST_WARNING_MONTHS,
} from '../constants';
import { monthOf } from '../calendar';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { pay } from '../ledger/payments';
import { post } from '../ledger/post';
import { buildMonthlyStatements } from '../ledger/statements';
import { add, fromFloatCents, money, type Money, mul, sub, sum, ZERO } from '../money';
import type { CompanyId } from '../types/content';
import type { SimContext, System } from '../types/context';
import type { JournalLine, Ledger } from '../types/ledger';
import type { GameState, Store } from '../types/state';
import { emptyMonthToDate } from '../store';
import { cashTrend, forecastNetCash, topExpenses } from './forecast';
import { installment } from './loans';
import { dailyRate } from './macro';
import { accrueMonthlyTax } from './tax';

/** Khấu hao tháng thứ `monthNumber` (1 = tháng mở): floor(capex/life); tháng thứ `life` lấy phần còn lại; xong thì 0. */
export function depreciationForMonth(
  capex: Money,
  accumDep: Money,
  monthNumber: number,
  life: number,
): Money {
  const remaining = sub(capex, accumDep);
  if (remaining <= 0) return ZERO;
  if (monthNumber >= life) return remaining;
  const base = money(Math.floor(capex / life));
  return base < remaining ? base : remaining;
}

/** Quyết toán TaxPayable cuối quý: dư dương thì nộp (qua pay), dư âm thì nhận hoàn thuế. */
export function settleQuarterTax(ledger: Ledger, companyId: CompanyId, day: number): void {
  const balance = currentBalances(ledger, companyId)[ACC.TaxPayable];
  const memo = 'Chốt quý: quyết toán thuế TNDN';
  if (balance > 0) {
    pay(ledger, { companyId, day, memo, debits: [{ account: ACC.TaxPayable, amount: balance }] });
  } else if (balance < 0) {
    // Hoàn thuế trả thấu chi trước (như bước tự trả §7.2), phần dư mới vào Cash: nếu không, distress
    // xét ngay sau đó sẽ thấy thấu chi gộp dù tiền ròng đã đủ.
    const refund = sub(ZERO, balance);
    const overdraft = currentBalances(ledger, companyId)[ACC.Overdraft];
    const toOverdraft = refund < overdraft ? refund : overdraft;
    const toCash = sub(refund, toOverdraft);
    const lines: JournalLine[] = [];
    if (toOverdraft > 0) lines.push({ account: ACC.Overdraft, debit: toOverdraft, credit: ZERO });
    if (toCash > 0) lines.push({ account: ACC.Cash, debit: toCash, credit: ZERO });
    lines.push({ account: ACC.TaxPayable, debit: ZERO, credit: refund });
    post(ledger, { day, companyId, memo, lines });
  }
}

/** Thanh lý cửa hàng khi phá sản (§6.1 nhưng không có phí chấm dứt thuê, #15d). */
function liquidate(draft: GameState, store: Store, day: number): void {
  const lines: JournalLine[] = [];
  if (store.accumDep > 0)
    lines.push({ account: ACC.AccumulatedDepreciation, debit: store.accumDep, credit: ZERO });
  const loss = sub(store.capex, store.accumDep);
  if (loss > 0) lines.push({ account: ACC.LossOnDisposal, debit: loss, credit: ZERO });
  if (store.capex > 0) {
    lines.push({ account: ACC.PPE, debit: ZERO, credit: store.capex });
    post(draft.ledger, {
      day,
      companyId: store.companyId,
      memo: `Thanh lý khi phá sản ${store.id}`,
      refId: store.id,
      lines,
    });
  }
  store.accumDep = ZERO;
  store.status = 'closed';
  store.closedDay = day;
  draft.events.push({ day, kind: 'storeClosed', companyId: store.companyId, storeId: store.id });
}

/** Trả về các cửa hàng cần thanh lý (khi công ty vừa phá sản); việc thanh lý làm sau khi mọi công ty đã chốt. */
function closeCompany(draft: GameState, ctx: SimContext, companyId: CompanyId): Store[] {
  const company = draft.companies[companyId];
  if (!company || company.status === 'bankrupt') return [];
  const { industry, scenario } = ctx.content;
  const day = ctx.day;
  const month = monthOf(day);
  const memo = (what: string) => `Chốt tháng ${month}: ${what}`;
  const ledger = draft.ledger;

  const stores: Store[] = [];
  for (const id of draft.storeIds) {
    const s = draft.stores[id];
    if (s && s.companyId === companyId) stores.push(s);
  }
  const openStores = stores.filter((s) => s.status === 'open');

  // M1: chi phí vận hành cộng dồn trong tháng (gồm cả cửa hàng đóng giữa tháng) + quản trị chung.
  const wages = sum(stores.map((s) => fromFloatCents(s.mtd.wagesAccrued)));
  const rent = sum(stores.map((s) => fromFloatCents(s.mtd.rentAccrued)));
  const marketing = fromFloatCents(company.marketingAccrued);
  const admin =
    openStores.length > 0
      ? mul(
          industry.overheadBaseMonthly,
          draft.macro.priceIndex * openStores.length ** industry.overheadExponent,
        )
      : ZERO;
  pay(ledger, {
    companyId,
    day,
    memo: memo('chi phí vận hành'),
    debits: [
      { account: ACC.Wages, amount: wages },
      { account: ACC.Rent, amount: rent },
      { account: ACC.Marketing, amount: marketing },
      { account: ACC.Admin, amount: admin },
    ],
  });

  // M2: khấu hao từng cửa hàng đang mở.
  let depreciation = ZERO;
  for (const s of openStores) {
    const d = depreciationForMonth(
      s.capex,
      s.accumDep,
      month - monthOf(s.openedDay) + 1,
      industry.usefulLifeMonths,
    );
    s.accumDep = add(s.accumDep, d);
    depreciation = add(depreciation, d);
  }
  if (depreciation > 0) {
    post(ledger, {
      day,
      companyId,
      memo: memo('khấu hao'),
      lines: [
        { account: ACC.Depreciation, debit: depreciation, credit: ZERO },
        { account: ACC.AccumulatedDepreciation, debit: ZERO, credit: depreciation },
      ],
    });
  }

  // M3: trả góp, bắt đầu từ tháng kế tiếp tháng vay.
  for (const loanId of draft.loanIds) {
    const loan = draft.loans[loanId];
    if (!loan || loan.companyId !== companyId || loan.outstanding <= 0 || month <= monthOf(loan.takenDay))
      continue;
    const { interest, principal } = installment(loan);
    pay(ledger, {
      companyId,
      day,
      memo: memo(`trả góp ${loanId}`),
      refId: loanId,
      debits: [
        { account: ACC.InterestExpense, amount: interest },
        { account: ACC.Loans, amount: principal },
      ],
    });
    loan.outstanding = sub(loan.outstanding, principal);
    loan.paymentsMade += 1;
  }

  // M4: lãi thấu chi trên tổng số dư cuối ngày.
  const overdraftRate = dailyRate(draft.macro.policyRateAnnual + scenario.finance.overdraftSpread);
  pay(ledger, {
    companyId,
    day,
    memo: memo('lãi thấu chi'),
    debits: [
      {
        account: ACC.InterestExpense,
        amount: mul(company.overdraft.dailyBalanceSum, overdraftRate),
      },
    ],
  });
  company.overdraft.dailyBalanceSum = ZERO;

  // M5–M6: thuế (lợi nhuận trước thuế không phụ thuộc bút toán thuế nên đọc trước khi ghi thuế).
  const ops = {
    storeCount: openStores.length,
    avgUtilization: utilization(stores),
  };
  const preTax = buildMonthlyStatements(ledger, companyId, month, ops).pnl.preTax;
  const { expense, next } = accrueMonthlyTax(
    company.tax,
    preTax,
    draft.macro.corporateTaxRate,
    (month + 1) % 12 === 0,
  );
  company.tax = next;
  if (expense !== 0) {
    const amount = expense > 0 ? expense : sub(ZERO, expense);
    const [dr, cr] = expense > 0 ? [ACC.IncomeTax, ACC.TaxPayable] : [ACC.TaxPayable, ACC.IncomeTax];
    post(ledger, {
      day,
      companyId,
      memo: memo(expense > 0 ? 'thuế TNDN' : 'hoàn nhập thuế TNDN'),
      lines: [
        { account: dr, debit: amount, credit: ZERO },
        { account: cr, debit: ZERO, credit: amount },
      ],
    });
  }
  if ((month + 1) % 3 === 0) settleQuarterTax(ledger, companyId, day);

  // 3: báo cáo tháng; hạn mức thấu chi = max(sàn, doanh thu 3 tháng gần nhất).
  const statements = buildMonthlyStatements(ledger, companyId, month, ops);
  const history = draft.statements[companyId] ?? [];
  history.push(freeze(statements, true));
  draft.statements[companyId] = history;
  const revenue3m = sum(history.slice(-3).map((s) => s.pnl.revenue));
  company.overdraft.limit =
    revenue3m > scenario.finance.overdraftFloor ? revenue3m : scenario.finance.overdraftFloor;

  // 4: distress / bankrupt hoặc cảnh báo sớm.
  const balances = currentBalances(ledger, companyId);
  const overdraft = balances[ACC.Overdraft];
  const netCash = balances[ACC.Cash] - overdraft;
  const trend = cashTrend(history);
  const toLiquidate: Store[] = [];
  if (overdraft > company.overdraft.limit) {
    company.distressMonths += 1;
    const bankrupt = company.distressMonths >= DISTRESS_MONTHS_TO_BANKRUPTCY;
    company.status = bankrupt ? 'bankrupt' : 'distress';
    draft.events.push({
      day,
      kind: bankrupt ? 'bankrupt' : 'distress',
      companyId,
      overdraft,
      overdraftLimit: company.overdraft.limit,
      topExpenses: topExpenses(statements.pnl),
      cashForecast3m: forecastNetCash(netCash, trend, FORECAST_DISTRESS_MONTHS),
    });
    if (bankrupt) toLiquidate.push(...openStores);
  } else {
    company.status = 'active';
    company.distressMonths = 0;
    const forecast = forecastNetCash(netCash, trend, FORECAST_WARNING_MONTHS);
    if (forecast < 0) draft.events.push({ day, kind: 'cashWarning', companyId, cashForecast13w: forecast });
  }

  // Chuyển mtd sang lastMonth và reset cộng dồn.
  for (const s of stores) {
    const lastMonth = {
      demand: s.mtd.demand,
      served: s.mtd.served,
      capacity: s.mtd.capacity,
      days: s.mtd.days,
      revenue: s.mtd.revenue,
      cogs: s.mtd.cogs,
      wages: fromFloatCents(s.mtd.wagesAccrued),
      rent: fromFloatCents(s.mtd.rentAccrued),
    };
    if (s.status === 'open') {
      const contribution = lastMonth.revenue - lastMonth.cogs - lastMonth.wages - lastMonth.rent;
      s.negContributionMonths = contribution < 0 ? s.negContributionMonths + 1 : 0;
    }
    s.lastMonth = lastMonth;
    s.mtd = emptyMonthToDate();
  }
  company.marketingAccrued = 0;
  return toLiquidate;
}

/** Σ served / Σ capacity của tháng; null nếu không có công suất. */
function utilization(stores: readonly Store[]): number | null {
  let served = 0;
  let capacity = 0;
  for (const s of stores) {
    served += s.mtd.served;
    capacity += s.mtd.capacity;
  }
  return capacity > 0 ? served / capacity : null;
}

export const monthCloseSystem: System = (draft, ctx) => {
  const toLiquidate: Store[] = [];
  for (const companyId of draft.companyIds) toLiquidate.push(...closeCompany(draft, ctx, companyId));
  // Thanh lý ghi vào ngày đầu tháng mới, sau khi mọi công ty đã chốt tháng này (sổ ghi theo thứ tự ngày).
  for (const store of toLiquidate) liquidate(draft, store, draft.clock.day);
};
