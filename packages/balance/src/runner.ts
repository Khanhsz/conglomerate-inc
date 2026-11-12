/** Chạy một (seed, bot) headless và ghi số liệu mỗi tháng (spec §6). */
import {
  ACC,
  checkInvariants,
  createGame,
  createRngFactory,
  currentBalances,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  enqueue,
  retainedEarnings,
  selectors,
  step,
  worldOf,
  type GameState,
  type LoadedContent,
} from '@game/sim-core';
import { BOTS, type BotName } from './bots/index';
import type { Row, RunResult } from './report';

function monthRows(state: GameState, content: LoadedContent, seed: number, bot: string): Row[] {
  const month = state.clock.day / DAYS_PER_MONTH - 1;
  const shares = selectors.marketShares(state, content);
  const world = worldOf(content);
  return state.companyIds.map((companyId): Row => {
    const company = state.companies[companyId];
    const statement = (state.statements[companyId] ?? []).find((s) => s.month === month);
    const b = currentBalances(state.ledger, companyId);
    const open = state.storeIds
      .map((id) => state.stores[id])
      .filter((s) => s?.companyId === companyId && s.status === 'open');
    const served = open.flatMap((s) =>
      s && s.lastMonth.days > 0 ? [s.lastMonth.served / s.lastMonth.days] : [],
    );
    const cities = new Set<number>();
    for (const s of open) {
      const at = s ? world.indexOf.get(s.districtId) : undefined;
      const k = at === undefined ? undefined : world.cityOf[at];
      if (k !== undefined) cities.add(k);
    }
    return {
      seed,
      bot,
      month,
      companyId,
      kind: company?.kind ?? 'ai',
      tier: company?.qualityTier ?? '',
      reach: company?.kind === 'ai' ? company.profile.reach : '',
      homeCity: company?.kind === 'ai' ? company.profile.homeCityId : '',
      cities: cities.size,
      stores: open.length,
      revenue: statement?.pnl.revenue ?? 0,
      ebitda: statement?.pnl.ebitda ?? 0,
      netIncome: statement?.pnl.netIncome ?? 0,
      cash: b[ACC.Cash],
      debt: b[ACC.Loans] + b[ACC.Overdraft],
      equity: b[ACC.ShareCapital] + retainedEarnings(b),
      status: state.companies[companyId]?.status ?? 'unknown',
      avgUtilization: statement?.kpis.avgUtilization ?? null,
      marketShare: shares.byCompany[companyId] ?? 0,
      industryShare: shares.industryShare,
      servedPerStoreDay: served.length > 0 ? served.reduce((a, x) => a + x, 0) / served.length : null,
    };
  });
}

export function runOne(
  content: LoadedContent,
  seed: number,
  bot: BotName,
  years: number,
  opts: { readonly checkInvariants: boolean },
): RunResult {
  const t0 = performance.now();
  const decide = BOTS[bot];
  const botRng = createRngFactory(seed);
  const rows: Row[] = [];
  const violations: string[] = [];
  let state = createGame(content, { seed });
  for (let day = 0; day < years * DAYS_PER_YEAR; day++) {
    if (day % DAYS_PER_MONTH === 0) {
      for (const cmd of decide(state, content, botRng('bot', day))) state = enqueue(state, cmd);
    }
    state = step(state, content);
    if (state.clock.day % DAYS_PER_MONTH === 0) {
      rows.push(...monthRows(state, content, seed, bot));
      if (opts.checkInvariants) {
        for (const v of checkInvariants(state, content)) {
          violations.push(`seed ${seed} bot ${bot} ngày ${state.clock.day}: [${v.code}] ${v.message}`);
        }
      }
    }
  }
  return { seed, bot, rows, violations, ms: performance.now() - t0 };
}
