import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { money } from '../money';
import { accrueMonthlyTax, type TaxState } from './tax';

const zero: TaxState = { preTaxProfitYTD: money(0), taxBookedYTD: money(0), lossCarryforward: money(0) };

/** Chạy một chuỗi lợi nhuận trước thuế theo tháng (tháng 11, 23… là cuối năm). */
function run(profits: number[], start: TaxState = zero) {
  let tax = start;
  const expenses: number[] = [];
  profits.forEach((p, m) => {
    const r = accrueMonthlyTax(tax, money(p), 0.2, (m + 1) % 12 === 0);
    expenses.push(r.expense);
    tax = r.next;
  });
  return { tax, expenses };
}

describe('accrueMonthlyTax (economic-model §6.2)', () => {
  it('profit then loss within a year: tax is booked, then reversed (expense < 0)', () => {
    // tháng 0: lãi 1,000,000 → thuế YTD 200,000; tháng 1: lỗ 1,500,000 → YTD −500,000 → thuế YTD 0 → hoàn nhập −200,000
    const { expenses, tax } = run([1_000_000, -1_500_000]);
    expect(expenses).toEqual([200_000, -200_000]);
    expect(tax).toEqual({ preTaxProfitYTD: -500_000, taxBookedYTD: 0, lossCarryforward: 0 });
  });

  it('rounds τ × taxable half away from zero', () => {
    expect(run([921_667]).expenses).toEqual([184_333]); // 184,333.4
    expect(run([921_668]).expenses).toEqual([184_334]); // 184,333.6
  });

  it('a loss year is carried forward and offsets next year, then is used up', () => {
    // Năm 1: −500,000 → lossCarryforward = 500,000
    const year1 = [1_000_000, -1_500_000, ...Array<number>(10).fill(0)];
    const after1 = run(year1);
    expect(after1.tax).toEqual({ preTaxProfitYTD: 0, taxBookedYTD: 0, lossCarryforward: 500_000 });
    // Năm 2: tháng 12 lãi 800,000 → chịu thuế 800,000 − 500,000 = 300,000 → 60,000
    const year2 = run([800_000, ...Array<number>(11).fill(0)], after1.tax);
    expect(year2.expenses[0]).toBe(60_000);
    expect(year2.expenses.slice(1).every((e) => e === 0)).toBe(true);
    // Cuối năm 2: lãi cả năm 800,000 ≥ 500,000 → lossCarryforward về 0
    expect(year2.tax).toEqual({ preTaxProfitYTD: 0, taxBookedYTD: 0, lossCarryforward: 0 });
  });

  it('a profitable year reduces but never makes the carryforward negative', () => {
    const start: TaxState = {
      preTaxProfitYTD: money(0),
      taxBookedYTD: money(0),
      lossCarryforward: money(1_000_000),
    };
    const { tax, expenses } = run([300_000, ...Array<number>(11).fill(0)], start);
    expect(expenses[0]).toBe(0); // 300,000 < 1,000,000 lỗ chuyển sang
    expect(tax.lossCarryforward).toBe(700_000);
  });

  it('taxBookedYTD is never negative', () => {
    const { tax } = run([-100, -200, 50]);
    expect(tax.taxBookedYTD).toBe(0);
  });
});

describe('accrueMonthlyTax (property)', () => {
  it('over random profit/loss months: booked tax and carryforward never negative; a year’s expenses sum to its final tax due', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10_000_000, max: 10_000_000 }), { minLength: 12, maxLength: 48 }),
        (profits) => {
          let tax = zero;
          let yearExpense = 0;
          let lcfAtYearStart = 0;
          let ytd = 0;
          profits.forEach((p, m) => {
            const yearEnd = (m + 1) % 12 === 0;
            const r = accrueMonthlyTax(tax, money(p), 0.2, yearEnd);
            yearExpense += r.expense;
            ytd += p;
            expect(r.next.taxBookedYTD).toBeGreaterThanOrEqual(0);
            expect(r.next.lossCarryforward).toBeGreaterThanOrEqual(0);
            if (yearEnd) {
              expect(yearExpense).toBe(Math.round(0.2 * Math.max(0, ytd - lcfAtYearStart)));
              yearExpense = 0;
              ytd = 0;
              lcfAtYearStart = r.next.lossCarryforward;
            }
            tax = r.next;
          });
        },
      ),
      { numRuns: Number(process.env['FC_RUNS'] ?? 100) },
    );
  });
});
