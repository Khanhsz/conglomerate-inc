/** Điều phối lệnh (ADR-0001 #6): validate → apply, lệnh bị từ chối chỉ để lại event. */
import { COMMAND_TYPES, type Command, type Validation } from '../types/commands';
import type { SimContext, System } from '../types/context';
import type { GameState } from '../types/state';
import { closeStore } from './closeStore';
import { isRecord, reject } from './common';
import { openStore } from './openStore';
import { setMarketingBudget } from './setMarketingBudget';
import { setPrice } from './setPrice';
import { setQualityTier } from './setQualityTier';
import { setStaff } from './setStaff';
import { setWage } from './setWage';

const KNOWN_TYPES: ReadonlySet<unknown> = new Set(COMMAND_TYPES);

/** Không bao giờ ném, kể cả với dữ liệu không qua kiểu (lệnh đến từ UI/worker). */
export function validateCommand(state: GameState, ctx: SimContext, cmd: Command): Validation {
  if (!isRecord(cmd)) return reject('lệnh phải là object');
  if (!KNOWN_TYPES.has(cmd.type)) return reject(`loại lệnh không hợp lệ: ${String(cmd.type)}`);
  if (!isRecord(cmd.payload)) return reject('payload phải là object');
  switch (cmd.type) {
    case 'OpenStore':
      return openStore.validate(state, ctx, cmd);
    case 'CloseStore':
      return closeStore.validate(state, ctx, cmd);
    case 'SetPrice':
      return setPrice.validate(state, ctx, cmd);
    case 'SetStaff':
      return setStaff.validate(state, ctx, cmd);
    case 'SetWage':
      return setWage.validate(state, ctx, cmd);
    case 'SetMarketingBudget':
      return setMarketingBudget.validate(state, ctx, cmd);
    case 'SetQualityTier':
      return setQualityTier.validate(state, ctx, cmd);
  }
}

/** Chỉ gọi sau khi validate trả ok. */
export function applyCommand(draft: GameState, ctx: SimContext, cmd: Command): void {
  switch (cmd.type) {
    case 'OpenStore':
      return openStore.apply(draft, ctx, cmd);
    case 'CloseStore':
      return closeStore.apply(draft, ctx, cmd);
    case 'SetPrice':
      return setPrice.apply(draft, ctx, cmd);
    case 'SetStaff':
      return setStaff.apply(draft, ctx, cmd);
    case 'SetWage':
      return setWage.apply(draft, ctx, cmd);
    case 'SetMarketingBudget':
      return setMarketingBudget.apply(draft, ctx, cmd);
    case 'SetQualityTier':
      return setQualityTier.apply(draft, ctx, cmd);
  }
}

/** Bước 1 của tick: áp dụng lệnh theo thứ tự nhận; mỗi lệnh validate trên state đã chịu ảnh hưởng của lệnh trước. */
export const applyQueuedCommands: System = (draft, ctx) => {
  const queue = draft.commandQueue;
  draft.commandQueue = [];
  for (const { command } of queue) {
    const verdict = validateCommand(draft, ctx, command);
    if (verdict.ok) {
      applyCommand(draft, ctx, command);
    } else {
      draft.events.push({
        day: ctx.day,
        kind: 'commandRejected',
        companyId: isRecord(command) && typeof command.companyId === 'string' ? command.companyId : '',
        commandType: isRecord(command) ? String(command.type) : typeof command,
        reason: verdict.reason,
      });
    }
  }
};
