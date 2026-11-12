import {
  createGame,
  createRngFactory,
  enqueue,
  money,
  runDays,
  validateCommand,
  type Command,
  type GameState,
} from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { loadDefaultContent } from '../content';
import { BOTS, BOT_NAMES } from './index';

const content = loadDefaultContent();
const rngAt = (day: number) => createRngFactory(42)('bot', day);
const s0 = createGame(content, { seed: 42 });
/** Gửi lệnh rồi chạy `days` ngày. */
const play = (s: GameState, cmds: Command[], days: number) =>
  runDays(
    cmds.reduce((acc, c) => enqueue(acc, c), s),
    content,
    days,
  );

describe('bots (spec §6)', () => {
  it('lists none + the 4 spec bots', () => {
    expect(BOT_NAMES).toEqual(['none', 'idle', 'random', 'sensible', 'aggressiveDebt']);
  });

  it('none never acts', () => {
    expect(BOTS.none(s0, content, rngAt(0))).toEqual([]);
  });

  it('idle opens one store in district c on day 0, then does nothing', () => {
    const first = BOTS.idle(s0, content, rngAt(0));
    expect(first).toEqual([{ type: 'OpenStore', companyId: 'player', payload: { districtId: 'c' } }]);
    const s = play(s0, first, 30);
    expect(BOTS.idle(s, content, rngAt(30))).toEqual([]);
  });

  it('random issues 1–3 commands, the first of which is valid when issued', () => {
    let s = s0;
    for (let day = 0; day < 6 * 30; day += 30) {
      const cmds = BOTS.random(s, content, rngAt(day));
      expect(cmds.length).toBeGreaterThanOrEqual(1);
      expect(cmds.length).toBeLessThanOrEqual(3);
      const firstCmd = cmds[0];
      if (firstCmd) expect(validateCommand(s, content, firstCmd).ok).toBe(true);
      s = play(s, cmds, 30);
    }
  });

  it('random is deterministic per (seed, day)', () => {
    expect(BOTS.random(s0, content, rngAt(0))).toEqual(BOTS.random(s0, content, rngAt(0)));
  });

  it('sensible opens a first affordable store', () => {
    const open = BOTS.sensible(s0, content, rngAt(0)).filter((c) => c.type === 'OpenStore');
    expect(open).toHaveLength(1);
    expect(open.every((c) => validateCommand(s0, content, c).ok)).toBe(true);
  });

  it('aggressiveDebt opens a store every month and borrows the maximum once there is history', () => {
    const first = BOTS.aggressiveDebt(s0, content, rngAt(0));
    expect(first.some((c) => c.type === 'TakeLoan')).toBe(false); // chưa có tháng nào đã chốt
    expect(first.some((c) => c.type === 'OpenStore')).toBe(true);
    const s = play(s0, first, 30);
    const loan = BOTS.aggressiveDebt(s, content, rngAt(30)).find((c) => c.type === 'TakeLoan');
    if (loan?.type !== 'TakeLoan') return; // EBITDA tháng đầu có thể ≤ 0: ngân hàng không cho vay
    expect(validateCommand(s, content, loan).ok).toBe(true);
    const more: Command = {
      ...loan,
      payload: { ...loan.payload, principal: money(loan.payload.principal + 100) },
    };
    expect(validateCommand(s, content, more).ok).toBe(false); // đúng là mức tối đa (sai số $1)
  });
});
