import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { money } from '../money';
import { expectedDemand } from '../systems/demand';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';
import { marketingEffect } from './marketing';

const content = fixtureContent();
const play = (state: GameState, cmds: Command[], days = 1): GameState =>
  runDays(
    cmds.reduce((s, c) => enqueue(s, c), state),
    content,
    days,
  );
const channel = (ch: string, target: string, monthly: number): Command => ({
  type: 'SetChannelBudget',
  companyId: 'player',
  payload: { channel: ch, target, monthly: money(monthly) },
});

const opened = play(createGame(content), [
  { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'w', size: 'small' } },
  { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'marketing' } },
  { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } },
]);
const storeId = must(opened.storeIds.find((id) => opened.stores[id]?.companyId === 'player'));

describe('marketingEffect (economic-model §18.3)', () => {
  it('lists general first, then every content channel; nothing spent → no effect, ROI unknown', () => {
    const view = marketingEffect(opened, content, 'player');
    expect(view.segmentIds).toEqual(['office', 'students']);
    expect(view.districtIds).toEqual(['w', 'e']);
    expect(view.awareness).toEqual(must(opened.companies['player']).awareness);
    expect(view.channels.map((c) => c.channel)).toEqual(['general', 'flyers', 'social']);
    expect(view.channels.map((c) => c.scope)).toEqual(['city', 'district', 'city']);
    for (const c of view.channels) {
      expect(c.monthlySpend).toBe(0);
      expect(c.contribution).toBe(0);
      expect(c.extraCustomersPerDay).toBe(0);
      expect(c.roi).toBeNull();
    }
    // general: mọi phân khúc trọng số 1
    expect(must(view.channels[0]).segmentWeight).toEqual({ office: 1, students: 1 });
  });

  it('extra customers = demand now − demand without the channel contribution; ROI from margin × 30 / spend', () => {
    const s = play(opened, [channel('flyers', 'w', 300_000)], 25);
    const view = marketingEffect(s, content, 'player');
    const flyers = must(view.channels.find((c) => c.channel === 'flyers'));
    expect(flyers.monthlySpend).toBe(300_000);
    expect(flyers.budgets).toEqual([{ target: 'w', monthly: 300_000 }]);
    expect(flyers.contribution).toBeGreaterThan(0);

    // Tính lại độc lập: bỏ phần đóng góp của flyers khỏi nhận biết rồi so cầu kỳ vọng.
    const company = must(s.companies['player']);
    const cells = must(company.channelAwareness.find((c) => c.channel === 'flyers')).cells;
    const without: GameState = {
      ...s,
      companies: {
        ...s.companies,
        player: { ...company, awareness: company.awareness.map((a, i) => a - must(cells[i])) },
      },
    };
    const extra =
      must(expectedDemand(s, content).byStore[storeId]) -
      must(expectedDemand(without, content).byStore[storeId]);
    expect(extra).toBeGreaterThan(0);
    expect(flyers.extraCustomersPerDay).toBeCloseTo(extra, 9);

    const store = must(s.stores[storeId]);
    const unitCost = content.industry.unitCost * 1 * s.macro.priceIndex; // tier standard
    expect(flyers.roi).toBeCloseTo((extra * (store.price - unitCost) * 30) / 300_000, 9);

    // kênh không chi: không có tác động
    const social = must(view.channels.find((c) => c.channel === 'social'));
    expect(social.extraCustomersPerDay).toBe(0);
    expect(social.roi).toBeNull();
  });

  it('a company without stores has awareness but no extra customers', () => {
    const noStore = play(
      createGame(content),
      [{ type: 'SetMarketingBudget', companyId: 'player', payload: { monthly: money(300_000) } }],
      10,
    );
    const general = must(marketingEffect(noStore, content, 'player').channels[0]);
    expect(general.contribution).toBeGreaterThan(0);
    expect(general.extraCustomersPerDay).toBe(0);
    expect(general.roi).toBe(0);
  });
});
