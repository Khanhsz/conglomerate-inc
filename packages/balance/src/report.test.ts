import { describe, expect, it } from 'vitest';
import { calibration, median, summarize, toCsv, type Row, type RunResult } from './report';

const row = (over: Partial<Row>): Row => ({
  seed: 1,
  bot: 'none',
  month: 0,
  companyId: 'player',
  stores: 0,
  revenue: 0,
  ebitda: 0,
  netIncome: 0,
  cash: 0,
  debt: 0,
  equity: 0,
  status: 'active',
  avgUtilization: null,
  marketShare: 0,
  industryShare: 0,
  servedPerStoreDay: null,
  ...over,
});

describe('toCsv', () => {
  it('writes the spec §6 columns (plus extras) and escapes values', () => {
    const csv = toCsv([row({ companyId: 'a,"b"', avgUtilization: 0.5 })]);
    const [header, line] = csv.trim().split('\n');
    expect(header).toBe(
      'seed,bot,month,companyId,stores,revenue,ebitda,netIncome,cash,debt,status,avgUtilization,marketShare,equity,industryShare,servedPerStoreDay',
    );
    expect(line).toBe('1,none,0,"a,""b""",0,0,0,0,0,0,active,0.5,0,0,0,');
  });
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

const run = (seed: number, bot: string, rows: Row[]): RunResult => ({
  seed,
  bot,
  rows,
  violations: [],
  ms: 10,
});

describe('summarize', () => {
  it('reports player bankruptcy rate, median final equity and stores per bot', () => {
    const results = [
      run(1, 'random', [row({ bot: 'random', month: 35, status: 'bankrupt', equity: -100, stores: 0 })]),
      run(2, 'random', [row({ seed: 2, bot: 'random', month: 35, equity: 500, stores: 2 })]),
      run(1, 'sensible', [row({ bot: 'sensible', month: 35, equity: 900, stores: 4 })]),
    ];
    const s = summarize(results);
    expect(s.byBot['random']).toEqual({ runs: 2, bankruptRate: 0.5, medianEquity: 200, medianStores: 1 });
    expect(s.byBot['sensible']).toEqual({ runs: 1, bankruptRate: 0, medianEquity: 900, medianStores: 4 });
  });
});

describe('calibration (economic-model §14)', () => {
  it('measures year-1 industry share, served/store/day and the balanced AI EBITDA margin from `none` runs', () => {
    const rows: Row[] = [];
    for (let month = 0; month < 13; month++) {
      rows.push(
        row({
          month,
          companyId: 'ai-daily',
          industryShare: month < 12 ? 0.4 : 0.9,
          servedPerStoreDay: 400,
          revenue: 1000,
          ebitda: 150,
        }),
      );
      rows.push(
        row({ month, companyId: 'ai-bean', industryShare: month < 12 ? 0.4 : 0.9, servedPerStoreDay: 300 }),
      );
    }
    const c = calibration([run(1, 'none', rows)], 'ai-daily');
    expect(c.industryShare).toBeCloseTo(0.4, 12);
    expect(c.servedPerStoreDay).toBeCloseTo(350, 12);
    expect(c.balancedEbitdaMargin).toBeCloseTo(0.15, 12);
  });
});
