/**
 * Bản sao cho một tick (ADR-0002): sao chép đúng những phần state mà system / lệnh có thể ghi trong một ngày,
 * dùng chung phần còn lại. System ghi thẳng lên bản sao; state vào không bị chạm.
 * Thêm trường có thể bị ghi vào state thì phải thêm vào đây (chế độ kiểm tra trong test sẽ báo nếu quên).
 */
import type { Company, GameState, Loan, Store } from './types/state';

function copyCompany(c: Company): Company {
  return {
    ...c,
    tax: { ...c.tax },
    overdraft: { ...c.overdraft },
    office: c.office === null ? null : { ...c.office },
    departments: { ...c.departments },
    officeAccrued: { ...c.officeAccrued, departments: { ...c.officeAccrued.departments } },
    creditLine: { ...c.creditLine },
    hrPolicy: { ...c.hrPolicy },
    awareness: c.awareness.slice(),
    channelBudgets: c.channelBudgets.slice(),
    channelAwareness: c.channelAwareness.map((x) => ({ channel: x.channel, cells: x.cells.slice() })),
  };
}

function copyStore(s: Store): Store {
  return {
    ...s,
    today: { ...s.today },
    mtd: { ...s.mtd },
    recentDays: s.recentDays.slice(),
    history: s.history.slice(),
    overrides: { ...s.overrides },
    amenities: s.amenities.slice(),
  };
}

function mapRecord<T>(
  record: Readonly<Record<string, T>>,
  ids: readonly string[],
  copy: (v: T) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) {
    const v = record[id];
    if (v !== undefined) out[id] = copy(v);
  }
  return out;
}

export function beginTick(state: GameState): GameState {
  const statements: GameState['statements'] = {};
  for (const id of state.companyIds) {
    const list = state.statements[id];
    if (list) statements[id] = list.slice();
  }
  return {
    ...state,
    clock: { ...state.clock },
    macro: { ...state.macro },
    market: {
      targetChains: state.market.targetChains,
      cities: mapRecord(state.market.cities, Object.keys(state.market.cities), (m) => ({ ...m })),
    },
    companies: mapRecord(state.companies, state.companyIds, copyCompany),
    companyIds: state.companyIds.slice(),
    stores: mapRecord(state.stores, state.storeIds, copyStore),
    storeIds: state.storeIds.slice(),
    loans: mapRecord(state.loans, state.loanIds, (l: Loan): Loan => ({ ...l })),
    loanIds: state.loanIds.slice(),
    // Bút toán đã ghi không bao giờ bị sửa; post() thay object số dư của công ty chứ không sửa tại chỗ.
    ledger: {
      ...state.ledger,
      entries: state.ledger.entries.slice(),
      balances: { ...state.ledger.balances },
    },
    statements,
    commandQueue: state.commandQueue.slice(),
    events: state.events.slice(),
    nextIds: { ...state.nextIds },
  };
}
