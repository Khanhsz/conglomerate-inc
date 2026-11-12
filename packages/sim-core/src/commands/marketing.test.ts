import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from '../engine';
import { checkInvariants } from '../invariants';
import { ACC } from '../ledger/accounts';
import { periodTotals } from '../ledger/balances';
import { money } from '../money';
import { expectedDemand } from '../systems/demand';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { untyped } from '../test-support/untyped';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';

const content = fixtureContent();
const channel = (ch: string, target: string, monthly: number): Command => ({
  type: 'SetChannelBudget',
  companyId: 'player',
  payload: { channel: ch, target, monthly: money(monthly) },
});
const play = (state: GameState, cmds: Command[], days = 1): GameState =>
  runDays(
    cmds.reduce((s, c) => enqueue(s, c), state),
    content,
    days,
  );
const player = (s: GameState) => must(s.companies['player']);
const reason = (s: GameState, cmd: Command) => {
  const v = validateCommand(s, content, cmd);
  return v.ok ? null : v.reason;
};

const fresh = createGame(content);
/** Có văn phòng và phòng Marketing (ngày 1). */
const ready = play(fresh, [
  { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'w', size: 'small' } },
  { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'marketing' } },
]);

describe('SetChannelBudget (economic-model §18.2)', () => {
  it('needs the Marketing department; SetMarketingBudget (general) stays unlocked', () => {
    expect(reason(fresh, channel('social', 'testville', 100_000))).toMatch(/Marketing/);
    expect(
      reason(fresh, {
        type: 'SetMarketingBudget',
        companyId: 'player',
        payload: { monthly: money(100_000) },
      }),
    ).toBeNull();
    expect(reason(ready, channel('social', 'testville', 100_000))).toBeNull();
  });

  it('rejects general, unknown channels, a target that does not fit the scope and bad amounts', () => {
    expect(reason(ready, channel('general', 'city', 100_000))).toMatch(/SetMarketingBudget/);
    expect(reason(ready, channel('radio', 'city', 100_000))).toMatch(/không tồn tại/);
    expect(reason(ready, channel('social', 'w', 100_000))).toMatch(/toàn thành phố/);
    expect(reason(ready, channel('flyers', 'testville', 100_000))).toMatch(/theo quận/);
    expect(reason(ready, channel('social', 'city', 100_000))).toMatch(/toàn thành phố/);
    expect(reason(ready, channel('flyers', 'nowhere', 100_000))).toMatch(/không tồn tại/);
    expect(reason(ready, channel('flyers', 'w', -1))).toMatch(/không hợp lệ/);
    expect(reason(ready, channel('flyers', 'w', 100_000_001))).toMatch(/không hợp lệ/);
    const fractional = untyped<Command>(
      '{"type":"SetChannelBudget","companyId":"player","payload":{"channel":"flyers","target":"w","monthly":10.5}}',
    );
    expect(reason(ready, fractional)).toMatch(/không hợp lệ/);
    const noTarget = untyped<Command>(
      '{"type":"SetChannelBudget","companyId":"player","payload":{"channel":"flyers","monthly":1000}}',
    );
    expect(reason(ready, noTarget)).toMatch(/không tồn tại/);
  });

  it('upserts in a fixed order (channel id, then district order); 0 removes the line', () => {
    const s = play(ready, [
      channel('social', 'testville', 240_000),
      channel('flyers', 'e', 30_000),
      channel('flyers', 'w', 60_000),
    ]);
    expect(player(s).channelBudgets).toEqual([
      { channel: 'flyers', target: 'w', monthly: 60_000 },
      { channel: 'flyers', target: 'e', monthly: 30_000 },
      { channel: 'social', target: 'testville', monthly: 240_000 },
    ]);
    const changed = play(s, [channel('flyers', 'w', 0), channel('social', 'testville', 120_000)]);
    expect(player(changed).channelBudgets).toEqual([
      { channel: 'flyers', target: 'e', monthly: 30_000 },
      { channel: 'social', target: 'testville', monthly: 120_000 },
    ]);
  });

  it('closing the Marketing department (or releasing the office) drops channel budgets, not general', () => {
    const s = play(ready, [
      channel('social', 'testville', 240_000),
      { type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(90_000) } },
    ]);
    const closed = play(s, [
      { type: 'CloseDepartment', companyId: 'player', payload: { dept: 'marketing' } },
    ]);
    expect(player(closed).channelBudgets).toEqual([]);
    expect(player(closed).marketingBudgetMonthly).toBe(90_000);
    const released = play(s, [{ type: 'ReleaseOffice', companyId: 'player', payload: {} }]);
    expect(player(released).channelBudgets).toEqual([]);
  });

  it('every channel accrues into Marketing (6200) and is paid at month close', () => {
    // Đặt ở ngày 30 (đầu tháng 2) để tháng 2 có đủ 30 ngày chi.
    const start = runDays(ready, content, 29);
    expect(start.clock.day).toBe(30);
    const s = play(
      start,
      [
        { type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(90_000) } },
        channel('social', 'testville', 240_000),
        channel('flyers', 'e', 30_000),
      ],
      30,
    );
    const marketing = periodTotals(s.ledger, 'player', 30, 59)[ACC.Marketing];
    expect(marketing.debit).toBe(90_000 + 240_000 + 30_000);
    expect(must(s.statements['player']?.[1]).pnl.marketing).toBe(360_000);
    expect(checkInvariants(s, content)).toEqual([]);
  });

  it('a district channel raises demand from that district only (through A_{c,e,s})', () => {
    const opened = play(ready, [{ type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } }]);
    const storeId = must(opened.storeIds.find((id) => opened.stores[id]?.companyId === 'player'));
    const plain = runDays(opened, content, 20);
    const boosted = play(opened, [channel('flyers', 'w', 300_000)], 20);
    // Tờ rơi chỉ nâng ô w·students. Các ô khác chỉ nhích theo truyền miệng (toàn thành phố, do cửa hàng đông
    // khách hơn) nên vẫn bằng nhau.
    const [a, b] = [player(plain).awareness, player(boosted).awareness];
    expect(must(b[1])).toBeGreaterThan(must(a[1])); // w·students
    expect(new Set([b[0], b[2], b[3]]).size).toBe(1); // w·office, e·office, e·students
    expect(must(b[1])).toBeGreaterThan(must(b[0]) + 0.05);
    expect(must(expectedDemand(boosted, content).byStore[storeId])).toBeGreaterThan(
      must(expectedDemand(plain, content).byStore[storeId]),
    );
    expect(checkInvariants(boosted, content)).toEqual([]);
  });
});
