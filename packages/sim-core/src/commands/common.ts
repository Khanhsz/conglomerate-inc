/** Kiểm tra dùng chung cho các lệnh. Mọi hàm `*Problem` trả lý do từ chối hoặc null. */
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import type { Money } from '../money';
import type { Command, Validation } from '../types/commands';
import type { DistrictDef, LoadedContent } from '../types/content';
import type { Company, GameState, Store, StoreId } from '../types/state';
import { districtById } from '../world';

export type CommandOf<T extends Command['type']> = Extract<Command, { type: T }>;

export const OK: Validation = { ok: true };
export const reject = (reason: string): Validation => ({ ok: false, reason });
export const fromProblem = (problem: string | null): Validation => (problem === null ? OK : reject(problem));

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Số tiền / số lượng hợp lệ đến từ dữ liệu không qua kiểu (UI, worker): số nguyên an toàn. */
export function isSafeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

/** 'active': chỉ công ty đang hoạt động bình thường (mở cửa hàng); 'notBankrupt': cả công ty đang distress. */
export function companyProblem(
  state: GameState,
  companyId: unknown,
  mode: 'active' | 'notBankrupt',
): string | null {
  if (typeof companyId !== 'string') return 'companyId phải là chuỗi';
  const company = state.companies[companyId];
  if (!company) return `công ty "${companyId}" không tồn tại`;
  if (company.status === 'bankrupt') return `công ty ${companyId} đã phá sản (bankrupt)`;
  if (mode === 'active' && company.status !== 'active') {
    return `công ty ${companyId} đang ở trạng thái ${company.status}, không được mở cửa hàng`;
  }
  return null;
}

/** Cửa hàng tồn tại, thuộc công ty và đang mở. */
export function ownedOpenStoreProblem(state: GameState, companyId: string, storeId: unknown): string | null {
  if (typeof storeId !== 'string') return 'storeId phải là chuỗi';
  const store = state.stores[storeId];
  if (!store) return `cửa hàng "${storeId}" không tồn tại`;
  if (store.companyId !== companyId)
    return `cửa hàng ${storeId} thuộc công ty ${store.companyId}, không phải ${companyId}`;
  if (store.status !== 'open') return `cửa hàng ${storeId} đã đóng (closed)`;
  return null;
}

/** Cửa hàng cụ thể hoặc 'all' (mọi cửa hàng đang mở của công ty). */
export function storeRefProblem(state: GameState, companyId: string, storeId: unknown): string | null {
  return storeId === 'all' ? null : ownedOpenStoreProblem(state, companyId, storeId);
}

export function targetStores(state: GameState, companyId: string, storeId: StoreId | 'all'): Store[] {
  const ids = storeId === 'all' ? state.storeIds : [storeId];
  const out: Store[] = [];
  for (const id of ids) {
    const store = state.stores[id];
    if (store && store.companyId === companyId && store.status === 'open') out.push(store);
  }
  return out;
}

export function getCompany(state: GameState, companyId: string): Company {
  const company = state.companies[companyId];
  if (!company) throw new Error(`apply on unknown company ${companyId} (validate should have rejected)`);
  return company;
}

export function getStore(state: GameState, storeId: string): Store {
  const store = state.stores[storeId];
  if (!store) throw new Error(`apply on unknown store ${storeId} (validate should have rejected)`);
  return store;
}

export function findDistrict(content: LoadedContent, districtId: unknown): DistrictDef | undefined {
  return typeof districtId === 'string' ? districtById(content, districtId) : undefined;
}

/** Pref hiện tại (cent, số thực) = referencePrice × priceIndex. */
export function refPrice(state: GameState, content: LoadedContent): number {
  return content.industry.referencePrice * state.macro.priceIndex;
}

/** Lương thị trường hiện tại (cent, số thực) = marketWageMonthly × priceIndex. */
export function marketWage(state: GameState): number {
  return state.macro.marketWageMonthly * state.macro.priceIndex;
}

/** Tiền mặt + phần hạn mức thấu chi chưa dùng (economic-model §7.2: lệnh tự nguyện validate theo số này). */
export function spendingPower(state: GameState, companyId: string): number {
  const balances = currentBalances(state.ledger, companyId);
  const limit: Money | undefined = state.companies[companyId]?.overdraft.limit;
  return balances[ACC.Cash] + Math.max(0, (limit ?? 0) - balances[ACC.Overdraft]);
}

export function inBand(
  value: number,
  base: number,
  band: { readonly min: number; readonly max: number },
): boolean {
  return value >= band.min * base && value <= band.max * base;
}
