/** Engine (spec §4–§5, ADR-0001 #5–#7): createGame, enqueue, step, runDays. */
import { freeze, produce } from 'immer';
import {
  applyCommand,
  applyQueuedCommands,
  validateCommand as validateWithContext,
} from './commands/registry';
import { DAYS_PER_MONTH } from './constants';
import { formatId } from './ids';
import { ACC } from './ledger/accounts';
import { createLedger, post } from './ledger/post';
import { mul, ZERO } from './money';
import { createRngFactory } from './rng';
import { emptyOfficeAccrued, noDepartments } from './office';
import { aiSystem, aiTargetPrice } from './systems/ai';
import { brandSystem } from './systems/brand';
import { demandSystem } from './systems/demand';
import { financeDailySystem } from './systems/finance';
import { macroSystem } from './systems/macro';
import { monthCloseSystem } from './systems/monthClose';
import { officeSystem } from './systems/office';
import { operationsSystem } from './systems/operations';
import type { Command, Validation } from './types/commands';
import type { CompanyDef, LoadedContent } from './types/content';
import type { SimContext } from './types/context';
import type { Company, GameState } from './types/state';

/** Ngữ cảnh cho ngày `state.clock.day`: rng(stream) = generator riêng của (seed, stream, day). */
export function makeContext(state: GameState, content: LoadedContent): SimContext {
  const factory = createRngFactory(state.seed);
  const day = state.clock.day;
  return { content, day, rng: (stream) => factory(stream, day) };
}

function assertContent(state: GameState, content: LoadedContent): void {
  if (state.contentRef.contentVersion !== content.contentVersion) {
    throw new Error(
      `contentVersion mismatch: state was created with ${state.contentRef.contentVersion}, got ${content.contentVersion}`,
    );
  }
}

function newCompany(def: CompanyDef, content: LoadedContent): Company {
  const { industry, scenario } = content;
  const base = {
    id: def.id,
    name: def.name,
    status: 'active' as const,
    distressMonths: 0,
    brandAwareness: industry.brand.initialAwareness,
    marketingBudgetMonthly: ZERO,
    marketingAccrued: 0,
    tax: { preTaxProfitYTD: ZERO, taxBookedYTD: ZERO, lossCarryforward: ZERO },
    overdraft: { limit: scenario.finance.overdraftFloor, dailyBalanceSum: ZERO },
    office: null,
    departments: noDepartments(),
    officeAccrued: emptyOfficeAccrued(),
    creditLine: { limit: ZERO, commitmentFeeAccrued: 0 },
  };
  return def.kind === 'ai'
    ? {
        ...base,
        kind: 'ai',
        personality: def.personality,
        qualityTier: industry.aiPersonalities[def.personality].qualityTier,
      }
    : { ...base, kind: 'player', qualityTier: 'standard' };
}

/** Lệnh dựng cửa hàng ban đầu: OpenStore, rồi với AI là giá target, lương theo personality, aiInitialStaff. */
function initialStoreCommands(
  state: GameState,
  content: LoadedContent,
  def: CompanyDef,
  districtId: string,
): Command[] {
  const commands: Command[] = [{ type: 'OpenStore', companyId: def.id, payload: { districtId } }];
  if (def.kind !== 'ai') return commands;
  const storeId = formatId('store', state.nextIds.store);
  const { priceIndex, marketWageMonthly } = state.macro;
  const personality = content.industry.aiPersonalities[def.personality];
  commands.push(
    {
      type: 'SetPrice',
      companyId: def.id,
      payload: { storeId, price: aiTargetPrice(content, def.personality, priceIndex) },
    },
    {
      type: 'SetWage',
      companyId: def.id,
      payload: { storeId, wageMonthly: mul(marketWageMonthly, personality.wageRatio * priceIndex) },
    },
    { type: 'SetStaff', companyId: def.id, payload: { storeId, staff: content.industry.aiInitialStaff } },
  );
  return commands;
}

/**
 * Tạo game ở đầu ngày 0: công ty (id đã sort), góp vốn qua ledger, cửa hàng ban đầu qua đúng đường lệnh.
 * Ném lỗi nếu scenario khiến một lệnh khởi tạo bị từ chối.
 */
export function createGame(content: LoadedContent, opts: { readonly seed?: number } = {}): GameState {
  const { industry, scenario } = content;
  const base: GameState = {
    schemaVersion: 1,
    contentRef: { industryId: industry.id, scenarioId: scenario.id, contentVersion: content.contentVersion },
    seed: opts.seed ?? scenario.seed,
    clock: { day: 0 },
    macro: { ...scenario.macro },
    city: { districtIds: scenario.city.districts.map((d) => d.id) },
    companies: {},
    companyIds: [],
    stores: {},
    storeIds: [],
    loans: {},
    loanIds: [],
    ledger: createLedger(),
    statements: {},
    commandQueue: [],
    events: [],
    nextIds: { store: 1, loan: 1 },
  };
  const defs = [...scenario.companies].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ctx = makeContext(base, content);

  const state = produce(base, (draft) => {
    for (const def of defs) {
      draft.companies[def.id] = newCompany(def, content);
      draft.companyIds.push(def.id);
      draft.statements[def.id] = [];
      if (def.startingCash > 0) {
        post(draft.ledger, {
          day: 0,
          companyId: def.id,
          memo: 'Vốn góp ban đầu',
          lines: [
            { account: ACC.Cash, debit: def.startingCash, credit: ZERO },
            { account: ACC.ShareCapital, debit: ZERO, credit: def.startingCash },
          ],
        });
      }
    }
    for (const def of defs) {
      for (const districtId of def.initialStores) {
        for (const cmd of initialStoreCommands(draft, content, def, districtId)) {
          const verdict = validateWithContext(draft, ctx, cmd);
          if (!verdict.ok) {
            throw new Error(
              `scenario ${scenario.id}: cửa hàng ban đầu của ${def.id} ở quận ${districtId}: ${cmd.type} bị từ chối: ${verdict.reason}`,
            );
          }
          applyCommand(draft, ctx, cmd);
        }
      }
    }
  });
  return freeze(state, true);
}

/**
 * Xếp lệnh vào hàng đợi; áp dụng ở đầu tick kế tiếp. Lệnh được chuẩn hóa qua JSON để state luôn
 * serializable và không giữ tham chiếu tới object của người gọi.
 */
export function enqueue(state: GameState, cmd: Command): GameState {
  const command: Command = JSON.parse(JSON.stringify(cmd) ?? 'null');
  return produce(state, (draft) => {
    draft.commandQueue.push({ enqueuedDay: state.clock.day, command });
  });
}

/** Một ngày, đúng thứ tự spec §4. */
export function step(state: GameState, content: LoadedContent): GameState {
  assertContent(state, content);
  const ctx = makeContext(state, content);
  return produce(state, (draft) => {
    if (ctx.day % DAYS_PER_MONTH === 0 && ctx.day > 0) aiSystem(draft, ctx);
    applyQueuedCommands(draft, ctx);
    macroSystem(draft, ctx);
    brandSystem(draft, ctx);
    demandSystem(draft, ctx);
    operationsSystem(draft, ctx);
    officeSystem(draft, ctx);
    financeDailySystem(draft, ctx);
    draft.clock.day += 1;
    if (draft.clock.day % DAYS_PER_MONTH === 0) monthCloseSystem(draft, ctx);
  });
}

/** Chạy n ngày; gọi `onMonth` ngay sau mỗi lần chốt tháng. */
export function runDays(
  state: GameState,
  content: LoadedContent,
  days: number,
  onMonth?: (state: GameState) => void,
): GameState {
  let s = state;
  for (let i = 0; i < days; i++) {
    s = step(s, content);
    if (onMonth && s.clock.day % DAYS_PER_MONTH === 0) onMonth(s);
  }
  return s;
}

/** Kiểm tra một lệnh với state hiện tại (không thay đổi gì). */
export function validateCommand(state: GameState, content: LoadedContent, cmd: Command): Validation {
  assertContent(state, content);
  return validateWithContext(state, makeContext(state, content), cmd);
}
