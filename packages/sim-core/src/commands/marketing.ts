/** Lệnh của phòng Marketing (economic-model §18.2, spec M1.6 §3). */
import { channelIdsOf, GENERAL_CHANNEL } from '../awareness';
import { MAX_MARKETING_BUDGET_MONTHLY } from '../constants';
import { money, toDisplay } from '../money';
import { departmentProblem } from '../office';
import type { Validation } from '../types/commands';
import type { LoadedContent } from '../types/content';
import type { SimContext } from '../types/context';
import type { ChannelBudget, GameState } from '../types/state';
import { companyProblem, getCompany, isSafeInt, OK, reject, type CommandOf } from './common';

export const CITY_TARGET = 'city';

/** Vị trí sắp xếp của một dòng ngân sách: kênh theo id tăng dần, rồi `city` hoặc quận theo thứ tự scenario. */
function budgetRank(
  content: LoadedContent,
  b: { channel: string; target: string },
): readonly [number, number] {
  const districts = content.scenario.city.districts;
  return [channelIdsOf(content).indexOf(b.channel), districts.findIndex((d) => d.id === b.target)];
}

export const setChannelBudget = {
  validate(state: GameState, ctx: SimContext, cmd: CommandOf<'SetChannelBudget'>): Validation {
    const problem = companyProblem(state, cmd.companyId, 'notBankrupt');
    if (problem) return reject(problem);
    const dept = departmentProblem(getCompany(state, cmd.companyId), 'marketing');
    if (dept) return reject(dept);
    const channel: unknown = cmd.payload.channel;
    const target: unknown = cmd.payload.target;
    const monthly: unknown = cmd.payload.monthly;
    if (channel === GENERAL_CHANNEL)
      return reject('kênh general dùng ngân sách marketing chung (SetMarketingBudget)');
    const def = typeof channel === 'string' ? ctx.content.industry.marketingChannels[channel] : undefined;
    if (typeof channel !== 'string' || !def || !channelIdsOf(ctx.content).includes(channel))
      return reject(`kênh marketing "${String(channel)}" không tồn tại`);
    if (def.scope === 'city') {
      if (target !== CITY_TARGET)
        return reject(`kênh ${def.name} chạy toàn thành phố: target phải là "city"`);
    } else if (!ctx.content.scenario.city.districts.some((d) => d.id === target)) {
      return reject(`kênh ${def.name} chạy theo quận: quận "${String(target)}" không tồn tại`);
    }
    if (!isSafeInt(monthly) || monthly < 0 || monthly > MAX_MARKETING_BUDGET_MONTHLY) {
      return reject(
        `ngân sách kênh ${String(monthly)} không hợp lệ: phải là số nguyên cent trong [0, ${toDisplay(money(MAX_MARKETING_BUDGET_MONTHLY))}]`,
      );
    }
    return OK;
  },

  /** Đặt, thay hoặc (monthly = 0) bỏ một dòng ngân sách; danh sách luôn giữ thứ tự cố định. */
  apply(draft: GameState, ctx: SimContext, cmd: CommandOf<'SetChannelBudget'>): void {
    const company = getCompany(draft, cmd.companyId);
    const { channel, target } = cmd.payload;
    const monthly = money(cmd.payload.monthly);
    const rest = company.channelBudgets.filter((b) => !(b.channel === channel && b.target === target));
    const next: ChannelBudget[] = monthly > 0 ? [...rest, { channel, target, monthly }] : rest;
    next.sort((a, b) => {
      const [ca, ta] = budgetRank(ctx.content, a);
      const [cb, tb] = budgetRank(ctx.content, b);
      return ca - cb || ta - tb;
    });
    company.channelBudgets = next;
  },
};
