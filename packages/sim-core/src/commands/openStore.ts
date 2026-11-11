/** OpenStore (spec §3): capex = fitOutCost × priceIndex, trả qua pay() (có thể dùng thấu chi). */
import { MAX_STORES_PER_DISTRICT, RENT_TERM_DAYS } from '../constants';
import { formatId } from '../ids';
import { emptyLastMonth, emptyMonthToDate } from '../store';
import { ACC } from '../ledger/accounts';
import { pay } from '../ledger/payments';
import { money, mul, toDisplay, ZERO, type Money } from '../money';
import type { Validation } from '../types/commands';
import type { DistrictDef } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';
import { companyProblem, findDistrict, OK, reject, spendingPower, type CommandOf } from './common';

export function storeCapex(state: GameState, district: DistrictDef): Money {
  return mul(district.fitOutCost, state.macro.priceIndex);
}

export const openStore = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'OpenStore'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'active');
    if (problem) return reject(problem);
    const district = findDistrict(ctx.content, cmd.payload.districtId);
    if (!district) return reject(`quận "${String(cmd.payload.districtId)}" không tồn tại`);
    let count = 0;
    for (const id of state.storeIds) {
      const s = state.stores[id];
      if (s && s.companyId === cmd.companyId && s.districtId === district.id && s.status === 'open') count++;
    }
    if (count >= MAX_STORES_PER_DISTRICT) {
      return reject(`đã có ${count} cửa hàng ở quận ${district.id} (tối đa ${MAX_STORES_PER_DISTRICT})`);
    }
    const capex = storeCapex(state, district);
    const available = spendingPower(state, cmd.companyId);
    if (available < capex) {
      return reject(
        `không đủ tiền cho capex ${toDisplay(capex)}: tiền mặt + hạn mức thấu chi còn lại = ${toDisplay(money(available))}`,
      );
    }
    return OK;
  },

  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'OpenStore'>): void {
    const district = findDistrict(ctx.content, cmd.payload.districtId);
    if (!district) throw new Error(`apply OpenStore: unknown district ${String(cmd.payload.districtId)}`);
    const { industry } = ctx.content;
    const id = formatId('store', draft.nextIds.store);
    draft.nextIds.store += 1;
    const capex = storeCapex(draft, district);
    pay(draft.ledger, {
      companyId: cmd.companyId,
      day: ctx.day,
      memo: `Mở cửa hàng ${id} ở quận ${district.id}`,
      refId: id,
      debits: [{ account: ACC.PPE, amount: capex }],
    });
    const priceIndex = draft.macro.priceIndex;
    draft.stores[id] = {
      id,
      companyId: cmd.companyId,
      districtId: district.id,
      openedDay: ctx.day,
      status: 'open',
      price: mul(industry.referencePrice, priceIndex),
      staff: industry.newStore.staff,
      wageMonthly: mul(draft.macro.marketWageMonthly, priceIndex),
      rentMonthly: mul(district.rentMonthly, priceIndex),
      rentResetDay: ctx.day + RENT_TERM_DAYS,
      capex,
      accumDep: ZERO,
      morale: industry.newStore.morale,
      skill: industry.newHireSkill,
      serviceLevel: industry.newStore.serviceLevel,
      today: { demand: 0, served: 0, lost: 0, capacity: 0 },
      mtd: emptyMonthToDate(),
      lastMonth: emptyLastMonth(),
      negContributionMonths: 0,
      recentDays: [],
      history: [],
    };
    draft.storeIds.push(id); // id tăng dần và đệm 0 → mảng vẫn đã sort
    draft.events.push({
      day: ctx.day,
      kind: 'storeOpened',
      companyId: cmd.companyId,
      storeId: id,
      districtId: district.id,
    });
  },
};
