/**
 * Đối thủ là doanh nghiệp có hồ sơ riêng (economic-model §9, §20.1, ADR-0003).
 * - Công ty khai sẵn bằng `personality`: hồ sơ suy từ bảng kiểu cố định, không dùng rng (giữ nguyên M1).
 * - Công ty sinh ngẫu nhiên: mọi đặc điểm lấy từ dải trong `industry.rivalGenerator` bằng rng của ván.
 * Đối thủ mới được góp vốn qua ledger và mở cửa hàng bằng đúng đường lệnh của người chơi.
 */
import { uniformAwareness } from './awareness';
import { applyCommand, validateCommand } from './commands/registry';
import { formatId } from './ids';
import { ACC } from './ledger/accounts';
import { post } from './ledger/post';
import { money, mul, ZERO, type Money } from './money';
import { defaultHrPolicy, emptyOfficeAccrued, noDepartments } from './office';
import type { Rng } from './rng';
import { rankedDistricts, targetPrice } from './systems/ai';
import type { Command } from './types/commands';
import { QUALITY_TIERS, type LoadedContent, type QualityTier, type Range, type Reach } from './types/content';
import type { SimContext } from './types/context';
import type { AiCompany, GameState, RivalProfile } from './types/state';
import { worldOf } from './world';

export { profileFromPersonality } from './profile';

/** Vốn sinh ra làm tròn tới $1,000. */
const CAPITAL_ROUND = 100_000;
const NAME_ATTEMPTS = 20;

/** Phần chung của mọi công ty mới (người chơi và AI). */
export function blankCompany(content: LoadedContent, id: string, name: string) {
  const { industry, scenario } = content;
  return {
    id,
    name,
    status: 'active' as const,
    distressMonths: 0,
    awareness: uniformAwareness(content, industry.brand.initialAwareness),
    marketingBudgetMonthly: ZERO,
    marketingAccrued: 0,
    channelBudgets: [],
    channelAwareness: [],
    tax: { preTaxProfitYTD: ZERO, taxBookedYTD: ZERO, lossCarryforward: ZERO },
    overdraft: { limit: scenario.finance.overdraftFloor, dailyBalanceSum: ZERO },
    office: null,
    departments: noDepartments(),
    officeAccrued: emptyOfficeAccrued(),
    creditLine: { limit: ZERO, commitmentFeeAccrued: 0 },
    hrPolicy: defaultHrPolicy(),
  };
}

const uniform = (rng: Rng, [lo, hi]: Range): number => lo + rng.float() * (hi - lo);
const uniformInt = (rng: Rng, [lo, hi]: Range): number => rng.int(Math.ceil(lo), Math.floor(hi));

/** Chọn một khóa theo trọng số; khóa duyệt theo thứ tự cho trước (không theo Object.keys). */
function weighted<K extends string>(rng: Rng, keys: readonly K[], weights: { readonly [P in K]: number }): K {
  let total = 0;
  for (const k of keys) total += Math.max(0, weights[k]);
  let roll = rng.float() * total;
  for (const k of keys) {
    roll -= Math.max(0, weights[k]);
    if (roll < 0) return k;
  }
  const last = keys[keys.length - 1];
  if (last === undefined) throw new Error('weighted: no keys');
  return last;
}

export interface GeneratedRival {
  readonly name: string;
  readonly profile: RivalProfile;
  /** Vốn góp (đã nhân CPI). */
  readonly startingCash: Money;
  readonly initialStores: number;
}

/**
 * Sinh một đối thủ (§20.1). Thứ tự rút số cố định: bậc chất lượng, markup, lương, marketing, phạm vi (nếu là
 * chuỗi), hoàn vốn, bội số tiền mặt, độ kiên nhẫn, vốn, số cửa hàng, tên.
 */
export function generateRival(
  content: LoadedContent,
  rng: Rng,
  options: {
    /** `local`, hoặc `chain` để rút phạm vi theo `chainReachWeights`. */
    readonly kind: 'local' | 'chain';
    readonly homeCityId: string;
    readonly priceIndex: number;
    readonly takenNames: ReadonlySet<string>;
    /** Số thứ tự của đối thủ trong ván, dùng khi mọi tên ghép đều đã có. */
    readonly serial: number;
  },
): GeneratedRival {
  const g = content.industry.rivalGenerator;
  const qualityTier: QualityTier = weighted(rng, QUALITY_TIERS, g.tierWeights);
  const tier = g.tiers[qualityTier];
  const markup = uniform(rng, tier.markup);
  const wageRatio = uniform(rng, tier.wageRatio);
  const marketingShareOfRevenue = uniform(rng, tier.marketingShare);
  const reach: Reach =
    options.kind === 'local'
      ? 'local'
      : weighted(rng, ['regional', 'national'] as const, g.chainReachWeights);
  const maxPaybackMonths = uniformInt(rng, g.expansion.maxPaybackMonths);
  const cashMultiple = uniform(rng, g.expansion.cashMultiple);
  const closeAfterNegativeMonths = uniformInt(rng, g.patienceMonths);
  const capital = money(Math.round(uniform(rng, g.capital[reach]) / CAPITAL_ROUND) * CAPITAL_ROUND);
  const initialStores = uniformInt(rng, g.initialStores[reach]);

  let name = '';
  for (let i = 0; i < NAME_ATTEMPTS && (name === '' || options.takenNames.has(name)); i++) {
    const prefix = g.names.prefixes[rng.int(0, g.names.prefixes.length - 1)] ?? 'Rival';
    const suffix = g.names.suffixes[rng.int(0, g.names.suffixes.length - 1)] ?? 'Co.';
    name = `${prefix} ${suffix}`;
  }
  if (options.takenNames.has(name)) name = `${name} ${options.serial}`;

  return {
    name,
    profile: {
      source: 'generated',
      qualityTier,
      markup,
      wageRatio,
      marketingShareOfRevenue,
      expansion: { rule: 'marginalGain', minMonthlyRoi: 0, cashMultiple, maxPaybackMonths },
      closeAfterNegativeMonths,
      reach,
      homeCityId: options.homeCityId,
    },
    startingCash: mul(capital, options.priceIndex),
    initialStores,
  };
}

/** Lệnh dựng một cửa hàng ban đầu của AI (§9 luật 0): mở, đặt giá target, lương theo hồ sơ, staff ban đầu. */
export function initialStoreCommands(
  state: GameState,
  content: LoadedContent,
  companyId: string,
  profile: RivalProfile,
  districtId: string,
): Command[] {
  const storeId = formatId('store', state.nextIds.store);
  const { priceIndex, marketWageMonthly } = state.macro;
  return [
    { type: 'OpenStore', companyId, payload: { districtId } },
    {
      type: 'SetPrice',
      companyId,
      payload: { storeId, price: targetPrice(content, profile.qualityTier, profile.markup, priceIndex) },
    },
    {
      type: 'SetWage',
      companyId,
      payload: { storeId, wageMonthly: mul(marketWageMonthly, profile.wageRatio * priceIndex) },
    },
    { type: 'SetStaff', companyId, payload: { storeId, staff: content.industry.aiInitialStaff } },
  ];
}

/** Số đối thủ có mặt ở từng thành phố (§20.3), theo thứ tự thành phố của scenario. */
export function presentRivals(state: GameState, content: LoadedContent): number[] {
  const world = worldOf(content);
  const sets = world.cities.map(() => new Set<string>());
  const hasStore = new Set<string>();
  for (const id of state.storeIds) {
    const store = state.stores[id];
    if (!store || store.status !== 'open') continue;
    const company = state.companies[store.companyId];
    if (!company || company.kind !== 'ai' || isOut(company)) continue;
    const at = world.indexOf.get(store.districtId);
    const k = at === undefined ? undefined : world.cityOf[at];
    if (k === undefined) continue;
    sets[k]?.add(company.id);
    hasStore.add(company.id);
  }
  // Công ty chưa có cửa hàng nào (đang chờ mở cửa hàng đầu tiên) tính ở thành phố nhà.
  for (const id of state.companyIds) {
    const company = state.companies[id];
    if (!company || company.kind !== 'ai' || isOut(company) || hasStore.has(id)) continue;
    const k = world.cityIndexOf.get(company.profile.homeCityId);
    if (k !== undefined) sets[k]?.add(id);
  }
  return sets.map((s) => s.size);
}

/** Đã bị loại khỏi thị trường: phá sản hoặc rút lui (§20.2). */
export function isOut(company: { readonly status: string }): boolean {
  return company.status === 'bankrupt' || company.status === 'exited';
}

/** Số chuỗi liên thành phố (regional / national, sinh ngẫu nhiên) còn hoạt động. */
export function activeChains(state: GameState): number {
  let n = 0;
  for (const id of state.companyIds) {
    const c = state.companies[id];
    if (c && c.kind === 'ai' && !isOut(c) && c.profile.source === 'generated' && c.profile.reach !== 'local')
      n++;
  }
  return n;
}

/**
 * Tạo một đối thủ mới trong state: sinh hồ sơ, góp vốn qua ledger, mở các cửa hàng ban đầu ở thành phố nhà.
 * Trả id công ty. Ghi event `competitorEntered` khi `announce`.
 */
export function spawnRival(
  draft: GameState,
  ctx: SimContext,
  options: { readonly kind: 'local' | 'chain'; readonly homeCityId: string; readonly announce: boolean },
): string {
  const { content } = ctx;
  const serial = draft.nextIds.company;
  draft.nextIds.company += 1;
  const id = formatId('ai', serial);
  const takenNames = new Set<string>();
  for (const cid of draft.companyIds) {
    const c = draft.companies[cid];
    if (c && !isOut(c)) takenNames.add(c.name);
  }
  const rival = generateRival(content, ctx.rng(`rival:${serial}`), {
    kind: options.kind,
    homeCityId: options.homeCityId,
    priceIndex: draft.macro.priceIndex,
    takenNames,
    serial,
  });
  const company: AiCompany = {
    ...blankCompany(content, id, rival.name),
    kind: 'ai',
    qualityTier: rival.profile.qualityTier,
    profile: rival.profile,
    foundedDay: ctx.day,
    storelessMonths: 0,
  };
  draft.companies[id] = company;
  // companyIds luôn sắp theo id (bất biến của state): chèn đúng vị trí.
  const at = draft.companyIds.findIndex((other) => other > id);
  if (at < 0) draft.companyIds.push(id);
  else draft.companyIds.splice(at, 0, id);
  draft.statements[id] = [];
  if (rival.startingCash > 0) {
    post(draft.ledger, {
      day: ctx.day,
      companyId: id,
      memo: 'Vốn góp ban đầu',
      lines: [
        { account: ACC.Cash, debit: rival.startingCash, credit: ZERO },
        { account: ACC.ShareCapital, debit: ZERO, credit: rival.startingCash },
      ],
    });
  }

  const world = worldOf(content);
  const home = world.cityIndexOf.get(options.homeCityId);
  for (let n = 0; n < rival.initialStores && home !== undefined; n++) {
    // Địa điểm tốt nhất còn mở được ở thành phố nhà; lệnh bị từ chối (hết tiền) thì dừng.
    const district = rankedDistricts(
      draft,
      content,
      id,
      { cities: new Set([home]) },
      ctx.rng(`rival:${serial}:site`),
    )[0];
    if (!district) break;
    const commands = initialStoreCommands(draft, content, id, rival.profile, district.id);
    const first = commands[0];
    if (!first || !validateCommand(draft, ctx, first).ok) break;
    for (const command of commands) {
      if (validateCommand(draft, ctx, command).ok) applyCommand(draft, ctx, command);
    }
  }

  if (options.announce) {
    draft.events.push({
      day: ctx.day,
      kind: 'competitorEntered',
      companyId: id,
      name: rival.name,
      cityId: options.homeCityId,
      reach: rival.profile.reach,
      qualityTier: rival.profile.qualityTier,
    });
  }
  return id;
}

/** Đầu ván (§20.5): chuỗi địa phương cho từng thành phố, rồi các chuỗi liên thành phố; ghi số đối thủ mục tiêu. */
export function seedInitialRivals(draft: GameState, ctx: SimContext): void {
  const competition = ctx.content.scenario.competition;
  if (!competition) return;
  const world = worldOf(ctx.content);
  const rng = ctx.rng('entry:init');
  for (const city of world.cities) {
    const n = uniformInt(rng, competition.initial.localPerCity);
    for (let i = 0; i < n; i++)
      spawnRival(draft, ctx, { kind: 'local', homeCityId: city.id, announce: false });
  }
  const chains = uniformInt(rng, competition.initial.chains);
  for (let i = 0; i < chains; i++) {
    const home = world.cities[rng.int(0, world.cities.length - 1)];
    if (home) spawnRival(draft, ctx, { kind: 'chain', homeCityId: home.id, announce: false });
  }
  const present = presentRivals(draft, ctx.content);
  const cities: GameState['market']['cities'] = {};
  world.cities.forEach((city, k) => {
    cities[city.id] = { targetRivals: present[k] ?? 0, entryDueDay: null };
  });
  draft.market = { targetChains: activeChains(draft), cities };
}
