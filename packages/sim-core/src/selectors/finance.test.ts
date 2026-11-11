import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { money } from '../money';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { Command } from '../types/commands';
import type { GameState } from '../types/state';
import { financeAdvice, storePnl } from './finance';

const content = fixtureContent((d) => {
  for (const district of d.scenario.city.districts) district.pop *= 3;
});
const AI = 'ai-1';
const play = (s: GameState, cmds: Command[], days: number) =>
  runDays(
    cmds.reduce((acc, c) => enqueue(acc, c), s),
    content,
    days,
  );

describe('storePnl (economic-model §19.1: stores as business units)', () => {
  // AI mở thêm cửa hàng ở w (ngày 0) và văn phòng; đóng cửa hàng w ngày 45 → tháng 1 có phí chấm dứt thuê.
  const s0 = play(
    createGame(content),
    [
      { type: 'OpenStore', companyId: AI, payload: { districtId: 'w' } },
      { type: 'LeaseOffice', companyId: AI, payload: { districtId: 'e', size: 'small' } },
    ],
    45,
  );
  const w = must(
    s0.storeIds.find((id) => s0.stores[id]?.districtId === 'w' && s0.stores[id]?.companyId === AI),
  );
  const s = play(s0, [{ type: 'CloseStore', companyId: AI, payload: { storeId: w } }], 45);
  const month1 = must(storePnl(s, AI, 1));

  it('lists every store that operated in the month, including one closed mid-month', () => {
    const rows = month1.stores.map((r) => [r.storeId, r.status]);
    expect(rows).toContainEqual(['store-000001', 'open']);
    expect(rows).toContainEqual([w, 'closed']);
    for (const r of month1.stores) expect(r.contribution).toBe(r.revenue - r.cogs - r.wages - r.rent);
  });

  it('stores + corporate reconcile with the company P&L; revenue, COGS and wages are fully in stores', () => {
    const { company, corporate, storesTotal } = month1;
    expect(storesTotal.revenue + corporate.revenue).toBe(company.revenue);
    expect(corporate.revenue).toBe(0);
    expect(corporate.cogs).toBe(0);
    expect(corporate.wages).toBe(0);
    // thuê: phí chấm dứt 3 tháng của cửa hàng w là chi phí cấp công ty
    expect(corporate.rent).toBe(3 * must(s.stores[w]).rentMonthly);
    // khấu hao: phần văn phòng
    expect(corporate.depreciation).toBe(Math.floor(4_000_000 / content.industry.usefulLifeMonths));
    expect(corporate.lossOnDisposal).toBe(company.lossOnDisposal);
  });

  it('returns null for a month that is not closed yet', () => {
    expect(storePnl(s, AI, 5)).toBeNull();
  });
});

describe('financeAdvice (economic-model §19.1)', () => {
  it('reports leverage, tiers and refinancing options from closed months', () => {
    const s = play(
      createGame(content),
      [
        { type: 'LeaseOffice', companyId: AI, payload: { districtId: 'e', size: 'small' } },
        { type: 'OpenDepartment', companyId: AI, payload: { dept: 'finance' } },
      ],
      60,
    );
    const withLoan = runDays(
      enqueue(s, {
        type: 'TakeLoan',
        companyId: AI,
        payload: { principal: money(2_000_000), termMonths: 24 },
      }),
      content,
      1,
    );
    const a = must(financeAdvice(withLoan, content, AI));
    expect(a.leverage).toBeGreaterThan(0);
    expect(a.debt).toBe(2_000_000);
    expect(a.tiers.map((t) => t.maxLeverage)).toEqual([1, 2, 3]);
    expect(a.tiers[0]?.maxPrincipal).toBe(Math.max(0, Math.round(1 * a.ebitdaAnnual - a.debt)));
    expect(a.refinance).toHaveLength(1);
    expect(a.dscr).toBeCloseTo(a.ebitdaAnnual / a.debtServiceAnnual, 9);
    expect(a.advice).toContain('creditLineAvailable');
    expect(must(financeAdvice(createGame(content), content, AI)).advice).toContain('noHistory');
  });
});

describe('financeAdvice with negative EBITDA', () => {
  it('offers no credit line and no borrowing room', () => {
    // Người chơi mở văn phòng + phòng Tài chính, không có cửa hàng: EBITDA âm.
    const s = play(
      createGame(content),
      [
        { type: 'LeaseOffice', companyId: 'player', payload: { districtId: 'w', size: 'small' } },
        { type: 'OpenDepartment', companyId: 'player', payload: { dept: 'finance' } },
      ],
      31,
    );
    const a = must(financeAdvice(s, content, 'player'));
    expect(a.ebitdaAnnual).toBeLessThan(0);
    expect(a.leverage).toBeNull();
    expect(a.creditLine.eligible).toBe(false);
    expect(a.advice).not.toContain('creditLineAvailable');
    expect(a.tiers.every((t) => t.maxPrincipal === 0)).toBe(true);
  });
});
