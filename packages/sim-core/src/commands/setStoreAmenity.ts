/** SetStoreAmenity (M1.7, economic-model §21): bật / tắt tiện ích một cửa hàng; bật trả phí lắp đặt ngay. */
import { ACC } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { add, mul, toDisplay } from '../money';
import type { Validation } from '../types/commands';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import {
  companyProblem,
  getStore,
  OK,
  ownedOpenStoreProblem,
  reject,
  spendingPower,
  type CommandOf,
} from './common';

export const setStoreAmenity = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetStoreAmenity'>): Validation {
    const problem =
      companyProblem(state, cmd.companyId, 'notBankrupt') ??
      ownedOpenStoreProblem(state, cmd.companyId, cmd.payload.storeId);
    if (problem) return reject(problem);
    const { amenity, on } = cmd.payload;
    const def = typeof amenity === 'string' ? ctx.content.industry.storeAmenities[amenity] : undefined;
    if (!def) return reject(`tiện ích "${String(amenity)}" không tồn tại`);
    if (typeof on !== 'boolean') return reject('on phải là true hoặc false');
    const store = getStore(state, cmd.payload.storeId);
    const active = store.amenities.includes(amenity);
    if (on && active) return reject(`${def.name} đã bật`);
    if (!on && !active) return reject(`${def.name} chưa bật`);
    if (on) {
      const setup = mul(def.setupCost, state.macro.priceIndex);
      if (spendingPower(state, cmd.companyId) < setup)
        return reject(`không đủ tiền lắp đặt ${def.name} (${toDisplay(setup)})`);
    }
    return OK;
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'SetStoreAmenity'>): void {
    const store = getStore(draft, cmd.payload.storeId);
    const { amenity, on } = cmd.payload;
    if (!on) {
      store.amenities = store.amenities.filter((a) => a !== amenity);
      return;
    }
    const def = ctx.content.industry.storeAmenities[amenity];
    if (!def) throw new Error(`apply SetStoreAmenity: unknown amenity ${amenity}`);
    const setup = mul(def.setupCost, draft.macro.priceIndex);
    pay(draft.ledger, {
      companyId: cmd.companyId,
      day: ctx.day,
      memo: `Lắp đặt ${def.name} ở ${store.id}`,
      refId: store.id,
      debits: [{ account: ACC.StoreAmenities, amount: setup }],
    });
    store.mtd.amenitiesSetup = add(store.mtd.amenitiesSetup, setup);
    store.amenities = [...store.amenities, amenity].sort();
  },
};
