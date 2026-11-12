/** CSV, tóm tắt theo bot và chỉ số hiệu chỉnh economic-model §14 (spec §6). Hàm thuần. */

export interface Row {
  readonly seed: number;
  readonly bot: string;
  readonly month: number;
  readonly companyId: string;
  /** `player` hoặc `ai`; bậc chất lượng; phạm vi và thành phố nhà của đối thủ (M1.8). */
  readonly kind: string;
  readonly tier: string;
  readonly reach: string;
  readonly homeCity: string;
  /** Số thành phố đang có cửa hàng mở. */
  readonly cities: number;
  readonly stores: number;
  /** Tiền: cent. */
  readonly revenue: number;
  readonly ebitda: number;
  readonly netIncome: number;
  readonly cash: number;
  /** Loans + Overdraft. */
  readonly debt: number;
  readonly equity: number;
  readonly status: string;
  readonly avgUtilization: number | null;
  /** Phần của công ty trên tổng lượt tiềm năng (cầu kỳ vọng, quyết định #4). */
  readonly marketShare: number;
  /** 1 − Σ share₀: phần lượt mua rơi vào cửa hàng (economic-model §14). */
  readonly industryShare: number;
  /** Khách phục vụ / cửa hàng / ngày của tháng (trung bình các cửa hàng đang mở của công ty). */
  readonly servedPerStoreDay: number | null;
}

export interface RunResult {
  readonly seed: number;
  readonly bot: string;
  readonly rows: readonly Row[];
  readonly violations: readonly string[];
  readonly ms: number;
}

/** Cột theo spec §6, cộng thêm equity, industryShare, servedPerStoreDay cho hiệu chỉnh. */
const COLUMNS = [
  'seed',
  'bot',
  'month',
  'companyId',
  'stores',
  'revenue',
  'ebitda',
  'netIncome',
  'cash',
  'debt',
  'status',
  'avgUtilization',
  'marketShare',
  'equity',
  'industryShare',
  'servedPerStoreDay',
  'kind',
  'tier',
  'reach',
  'homeCity',
  'cities',
] as const satisfies readonly (keyof Row)[];

function cell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly Row[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface BotSummary {
  readonly runs: number;
  /** Tỷ lệ run mà công ty người chơi phá sản trong khoảng thời gian chạy. */
  readonly bankruptRate: number;
  readonly medianEquity: number | null;
  readonly medianStores: number | null;
}

export interface Summary {
  readonly byBot: Readonly<Record<string, BotSummary>>;
  readonly totalMs: number;
}

/** Dòng cuối cùng của người chơi trong một run. */
function finalPlayerRow(run: RunResult): Row | undefined {
  let last: Row | undefined;
  for (const r of run.rows) if (r.companyId === 'player' && (!last || r.month >= last.month)) last = r;
  return last;
}

export function summarize(results: readonly RunResult[]): Summary {
  const groups: Record<string, RunResult[]> = {};
  for (const r of results) (groups[r.bot] ??= []).push(r);
  const byBot: Record<string, BotSummary> = {};
  for (const [bot, runs] of Object.entries(groups)) {
    const finals = runs.map(finalPlayerRow).filter((r): r is Row => r !== undefined);
    byBot[bot] = {
      runs: runs.length,
      bankruptRate:
        finals.length === 0 ? 0 : finals.filter((r) => r.status === 'bankrupt').length / finals.length,
      medianEquity: median(finals.map((r) => r.equity)),
      medianStores: median(finals.map((r) => r.stores)),
    };
  }
  return { byBot, totalMs: results.reduce((a, r) => a + r.ms, 0) };
}

export interface Calibration {
  readonly runs: number;
  /** Trung bình 12 tháng đầu. */
  readonly industryShare: number | null;
  readonly servedPerStoreDay: number | null;
  /** Σ EBITDA / Σ doanh thu của AI balanced trong 12 tháng đầu. */
  readonly balancedEbitdaMargin: number | null;
}

const mean = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Đo trên các run của bot `none` (đúng scenario, người chơi đứng yên — #4); không có thì dùng mọi run. */
export function calibration(results: readonly RunResult[], balancedCompanyId: string): Calibration {
  const base = results.some((r) => r.bot === 'none') ? results.filter((r) => r.bot === 'none') : results;
  const year1 = base.flatMap((r) => r.rows.filter((x) => x.month < 12));
  const balanced = year1.filter((x) => x.companyId === balancedCompanyId);
  const revenue = balanced.reduce((a, x) => a + x.revenue, 0);
  const ebitda = balanced.reduce((a, x) => a + x.ebitda, 0);
  return {
    runs: base.length,
    industryShare: mean(balanced.map((x) => x.industryShare)),
    servedPerStoreDay: mean(
      year1.flatMap((x) => (x.servedPerStoreDay === null ? [] : [x.servedPerStoreDay])),
    ),
    balancedEbitdaMargin: revenue > 0 ? ebitda / revenue : null,
  };
}

interface Target {
  readonly label: string;
  readonly value: number | null;
  readonly ok: (v: number) => boolean;
  readonly goal: string;
  readonly format: (v: number) => string;
}

const pctFmt = (v: number) => `${(100 * v).toFixed(1)}%`;

/** Bảng tóm tắt dạng text, kèm so sánh với mục tiêu §14. */
export function formatReport(summary: Summary, cal: Calibration, years: number): string {
  const lines: string[] = [];
  lines.push('Bot              runs  phá sản  vốn chủ trung vị (USD)  cửa hàng trung vị');
  for (const [bot, s] of Object.entries(summary.byBot)) {
    const equity = s.medianEquity === null ? '—' : (s.medianEquity / 100).toFixed(0);
    lines.push(
      `${bot.padEnd(16)} ${String(s.runs).padStart(4)}  ${pctFmt(s.bankruptRate).padStart(7)}  ${equity.padStart(22)}  ${String(s.medianStores ?? '—').padStart(17)}`,
    );
  }
  const targets: Target[] = [
    {
      label: 'Thị phần ngành năm 1',
      value: cal.industryShare,
      ok: (v) => v >= 0.3 && v <= 0.5,
      goal: '[30%, 50%]',
      format: pctFmt,
    },
    {
      label: 'Khách/cửa hàng/ngày năm 1',
      value: cal.servedPerStoreDay,
      ok: (v) => v >= 250 && v <= 650,
      goal: '[250, 650]',
      format: (v) => v.toFixed(0),
    },
    {
      label: 'Biên EBITDA AI balanced năm 1',
      value: cal.balancedEbitdaMargin,
      ok: (v) => v >= 0.08 && v <= 0.25,
      goal: '[8%, 25%]',
      format: pctFmt,
    },
    {
      label: `Bot random phá sản (${years} năm)`,
      value: summary.byBot['random']?.bankruptRate ?? null,
      ok: (v) => v >= 0.5,
      goal: '≥ 50%',
      format: pctFmt,
    },
    {
      label: `Bot sensible sống (${years} năm)`,
      value: summary.byBot['sensible'] ? 1 - summary.byBot['sensible'].bankruptRate : null,
      ok: (v) => v >= 0.9,
      goal: '≥ 90%',
      format: pctFmt,
    },
  ];
  lines.push(
    '',
    `Mục tiêu hiệu chỉnh (economic-model §14; 3 dòng đầu đo trên ${cal.runs} run của bot none):`,
  );
  for (const t of targets) {
    const status = t.value === null ? '  —' : t.ok(t.value) ? ' ✓ ' : ' ✗ ';
    const value = t.value === null ? 'không có dữ liệu' : t.format(t.value);
    lines.push(`${status} ${t.label.padEnd(34)} ${value.padStart(10)}   mục tiêu ${t.goal}`);
  }
  lines.push('', `Thời gian mô phỏng (tổng các run): ${(summary.totalMs / 1000).toFixed(1)} s`);
  return lines.join('\n');
}

/** Số liệu vòng đời đối thủ trên atlas (M1.8), theo từng năm, đo trên các run của bot `none`. */
export interface AtlasYear {
  readonly year: number;
  /** Trung vị giữa các run. */
  readonly rivalsActive: number | null;
  readonly rivalsOut: number | null;
  readonly entrants: number | null;
  readonly rivalStores: number | null;
  /** Trung bình thị phần ngành trong năm. */
  readonly industryShare: number | null;
  /** Σ EBITDA / Σ doanh thu của đối thủ trong năm, theo bậc chất lượng. */
  readonly marginByTier: Readonly<Record<string, number | null>>;
  /** Tỷ lệ đối thủ (có doanh thu) có EBITDA âm cả năm. */
  readonly losingShare: number | null;
}

export interface AtlasStats {
  readonly runs: number;
  readonly years: readonly AtlasYear[];
}

const OUT = new Set(['bankrupt', 'exited']);

export function atlasStats(results: readonly RunResult[], years: number): AtlasStats {
  const base = results.some((r) => r.bot === 'none') ? results.filter((r) => r.bot === 'none') : results;
  const out: AtlasYear[] = [];
  for (let year = 1; year <= years; year++) {
    const lastMonth = year * 12 - 1;
    const active: number[] = [];
    const gone: number[] = [];
    const entrants: number[] = [];
    const stores: number[] = [];
    const industry: number[] = [];
    const tierRevenue: Record<string, number> = {};
    const tierEbitda: Record<string, number> = {};
    let withRevenue = 0;
    let losing = 0;
    for (const run of base) {
      const ai = run.rows.filter((r) => r.kind === 'ai');
      const end = ai.filter((r) => r.month === lastMonth);
      active.push(end.filter((r) => !OUT.has(r.status)).length);
      gone.push(end.filter((r) => OUT.has(r.status)).length);
      stores.push(end.reduce((a, r) => a + r.stores, 0));
      const first = new Map<string, number>();
      for (const r of ai)
        if (!first.has(r.companyId) || r.month < (first.get(r.companyId) ?? 0))
          first.set(r.companyId, r.month);
      entrants.push([...first.values()].filter((m) => m > 0 && m <= lastMonth).length);
      const inYear = ai.filter((r) => r.month > lastMonth - 12 && r.month <= lastMonth);
      const share = run.rows.filter(
        (r) => r.kind === 'player' && r.month > lastMonth - 12 && r.month <= lastMonth,
      );
      for (const r of share) industry.push(r.industryShare);
      const byCompany = new Map<string, { revenue: number; ebitda: number }>();
      for (const r of inYear) {
        tierRevenue[r.tier] = (tierRevenue[r.tier] ?? 0) + r.revenue;
        tierEbitda[r.tier] = (tierEbitda[r.tier] ?? 0) + r.ebitda;
        const c = byCompany.get(r.companyId) ?? { revenue: 0, ebitda: 0 };
        byCompany.set(r.companyId, { revenue: c.revenue + r.revenue, ebitda: c.ebitda + r.ebitda });
      }
      for (const c of byCompany.values()) {
        if (c.revenue <= 0) continue;
        withRevenue += 1;
        if (c.ebitda < 0) losing += 1;
      }
    }
    const marginByTier: Record<string, number | null> = {};
    for (const tier of Object.keys(tierRevenue).sort()) {
      const revenue = tierRevenue[tier] ?? 0;
      marginByTier[tier] = revenue > 0 ? (tierEbitda[tier] ?? 0) / revenue : null;
    }
    out.push({
      year,
      rivalsActive: median(active),
      rivalsOut: median(gone),
      entrants: median(entrants),
      rivalStores: median(stores),
      industryShare: mean(industry),
      marginByTier,
      losingShare: withRevenue > 0 ? losing / withRevenue : null,
    });
  }
  return { runs: base.length, years: out };
}

/** Báo cáo cho atlas: bảng bot như thường lệ, rồi vòng đời đối thủ theo năm. */
export function formatAtlasReport(summary: Summary, stats: AtlasStats): string {
  const lines: string[] = [];
  lines.push('Bot              runs  phá sản  vốn chủ trung vị (USD)  cửa hàng trung vị');
  for (const [bot, s] of Object.entries(summary.byBot)) {
    const equity = s.medianEquity === null ? '—' : (s.medianEquity / 100).toFixed(0);
    lines.push(
      `${bot.padEnd(16)} ${String(s.runs).padStart(4)}  ${pctFmt(s.bankruptRate).padStart(7)}  ${equity.padStart(22)}  ${String(s.medianStores ?? '—').padStart(17)}`,
    );
  }
  const num = (v: number | null, f: (x: number) => string = (x) => String(x)) => (v === null ? '—' : f(v));
  lines.push('', `Đối thủ trên atlas (trung vị của ${stats.runs} run bot none):`);
  lines.push('Năm  hoạt động  bị loại  gia nhập  cửa hàng  thị phần ngành  thua lỗ  biên EBITDA theo bậc');
  for (const y of stats.years) {
    const margins = Object.entries(y.marginByTier)
      .map(([tier, m]) => `${tier} ${num(m, pctFmt)}`)
      .join(' · ');
    lines.push(
      `${String(y.year).padStart(3)}  ${num(y.rivalsActive).padStart(9)}  ${num(y.rivalsOut).padStart(7)}  ${num(y.entrants).padStart(8)}  ${num(y.rivalStores).padStart(8)}  ${num(y.industryShare, pctFmt).padStart(14)}  ${num(y.losingShare, pctFmt).padStart(7)}  ${margins}`,
    );
  }
  lines.push('', `Thời gian mô phỏng (tổng các run): ${(summary.totalMs / 1000).toFixed(1)} s`);
  return lines.join('\n');
}
