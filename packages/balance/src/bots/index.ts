/**
 * Bot điều khiển công ty người chơi trong balance runner (spec §6). Mỗi bot là hàm thuần
 * (state, content, rng) → Command[], được gọi ở ngày đầu mỗi tháng (kể cả ngày 0).
 * `none` không làm gì: dùng để đo mục tiêu hiệu chỉnh economic-model §14 trên đúng scenario (#4).
 */
import {
  aiPolicy,
  decideMonthly,
  LOAN_TERMS_MONTHS,
  loanQuote,
  MAX_STAFF_PER_STORE,
  money,
  PRICE_BAND,
  QUALITY_TIERS,
  validateCommand,
  WAGE_BAND,
  type Command,
  type ExpansionRule,
  type GameState,
  type LoadedContent,
  type Money,
  type Rng,
} from '@game/sim-core';

export type Bot = (state: GameState, content: LoadedContent, rng: Rng) => Command[];

export const BOT_NAMES = ['none', 'idle', 'random', 'sensible', 'aggressiveDebt'] as const;
export type BotName = (typeof BOT_NAMES)[number];

/** Ngưỡng mở rộng của bot sensible (spec §6): ROI > 3%/tháng và cash ≥ 2 × capex. */
export const SENSIBLE_EXPANSION: ExpansionRule = { minMonthlyRoi: 0.03, cashMultiple: 2 };
/** aggressiveDebt mở 1 cửa hàng mỗi tháng bất kể ROI và tiền mặt (validate vẫn kiểm sức chi). */
const AGGRESSIVE_EXPANSION: ExpansionRule = { minMonthlyRoi: Number.NEGATIVE_INFINITY, cashMultiple: 0 };

function playerId(state: GameState): string {
  const id = state.companyIds.find((c) => state.companies[c]?.kind === 'player');
  if (!id) throw new Error('scenario has no player company');
  return id;
}

function ownOpenStores(state: GameState, companyId: string): string[] {
  return state.storeIds.filter((id) => {
    const s = state.stores[id];
    return s?.companyId === companyId && s.status === 'open';
  });
}

const pick = <T>(rng: Rng, items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[rng.int(0, items.length - 1)];

/** Một lệnh ngẫu nhiên (có thể không hợp lệ; bot random lọc bằng validate). */
function randomCommand(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  rng: Rng,
): Command | null {
  const stores = ownOpenStores(state, companyId);
  const pref = content.industry.referencePrice * state.macro.priceIndex;
  const wage = state.macro.marketWageMonthly * state.macro.priceIndex;
  const loans = state.loanIds.filter(
    (id) => state.loans[id]?.companyId === companyId && (state.loans[id]?.outstanding ?? 0) > 0,
  );
  const between = (lo: number, hi: number): Money => money(rng.int(Math.ceil(lo), Math.floor(hi)));
  switch (rng.int(0, 8)) {
    case 0: {
      const district = pick(rng, content.scenario.city.districts);
      return district ? { type: 'OpenStore', companyId, payload: { districtId: district.id } } : null;
    }
    case 1: {
      const storeId = pick(rng, stores);
      return storeId ? { type: 'CloseStore', companyId, payload: { storeId } } : null;
    }
    case 2:
      return {
        type: 'SetPrice',
        companyId,
        payload: {
          storeId: pick(rng, ['all', ...stores]) ?? 'all',
          price: between(PRICE_BAND.min * pref, PRICE_BAND.max * pref),
        },
      };
    case 3: {
      const storeId = pick(rng, stores);
      const staff = rng.int(content.industry.minStaffPerStore, MAX_STAFF_PER_STORE);
      return storeId ? { type: 'SetStaff', companyId, payload: { storeId, staff } } : null;
    }
    case 4:
      return {
        type: 'SetWage',
        companyId,
        payload: { storeId: 'all', wageMonthly: between(WAGE_BAND.min * wage, WAGE_BAND.max * wage) },
      };
    case 5:
      return { type: 'SetMarketingBudget', companyId, payload: { monthly: between(0, 10_000_000) } };
    case 6:
      return { type: 'SetQualityTier', companyId, payload: { tier: pick(rng, QUALITY_TIERS) ?? 'standard' } };
    case 7:
      return {
        type: 'TakeLoan',
        companyId,
        payload: { principal: between(100_000, 50_000_000), termMonths: pick(rng, LOAN_TERMS_MONTHS) ?? 12 },
      };
    default: {
      const loanId = pick(rng, loans);
      return loanId ? { type: 'RepayLoan', companyId, payload: { loanId } } : null;
    }
  }
}

/** Khoản vay lớn nhất ngân hàng chấp nhận (loanQuote đơn điệu theo principal), chính xác tới $1. */
function maxLoan(state: GameState, content: LoadedContent, companyId: string): Money | null {
  const ok = (p: number) => loanQuote(state, content, companyId, money(p)).ok;
  if (!ok(100)) return null;
  let lo = 100;
  let hi = 200;
  while (ok(hi) && hi < 1e13) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 100) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return money(lo);
}

export const BOTS: Record<BotName, Bot> = {
  none: () => [],

  /** Mở 1 cửa hàng ở quận c ở ngày 0, sau đó không làm gì. */
  idle: (state) => {
    if (state.clock.day !== 0) return [];
    return [{ type: 'OpenStore', companyId: playerId(state), payload: { districtId: 'c' } }];
  },

  /** Mỗi tháng 1–3 lệnh ngẫu nhiên hợp lệ tại thời điểm phát. */
  random: (state, content, rng) => {
    const companyId = playerId(state);
    const wanted = rng.int(1, 3);
    const out: Command[] = [];
    for (let attempt = 0; attempt < 40 && out.length < wanted; attempt++) {
      const cmd = randomCommand(state, content, companyId, rng);
      if (cmd && validateCommand(state, content, cmd).ok) out.push(cmd);
    }
    return out;
  },

  /** Như AI balanced, nhưng chỉ mở rộng khi ROI > 3%/tháng và cash ≥ 2 × capex. */
  sensible: (state, content, rng) =>
    decideMonthly(state, content, playerId(state), aiPolicy(content, 'balanced', SENSIBLE_EXPANSION), rng),

  /** Vay tối đa có thể (kỳ hạn 60 tháng) và mở 1 cửa hàng mỗi tháng; vận hành như AI balanced. */
  aggressiveDebt: (state, content, rng) => {
    const companyId = playerId(state);
    const out: Command[] = [];
    const principal = maxLoan(state, content, companyId);
    if (principal !== null) out.push({ type: 'TakeLoan', companyId, payload: { principal, termMonths: 60 } });
    out.push(
      ...decideMonthly(state, content, companyId, aiPolicy(content, 'balanced', AGGRESSIVE_EXPANSION), rng),
    );
    return out;
  },
};
