import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays, validateCommand } from '../engine';
import { checkInvariants } from '../invariants';
import { ACC } from '../ledger/accounts';
import { currentBalances } from '../ledger/balances';
import { money, mul } from '../money';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { untyped } from '../test-support/untyped';
import type { Command } from '../types/commands';
import type { Department, OfficeSize } from '../types/content';
import type { GameState } from '../types/state';

const content = fixtureContent();
const lease = (size: OfficeSize = 'small', districtId = 'w'): Command => ({
  type: 'LeaseOffice',
  companyId: 'player',
  payload: { districtId, size },
});
const openDept = (dept: Department): Command => ({
  type: 'OpenDepartment',
  companyId: 'player',
  payload: { dept },
});
const closeDept = (dept: Department): Command => ({
  type: 'CloseDepartment',
  companyId: 'player',
  payload: { dept },
});
const release: Command = { type: 'ReleaseOffice', companyId: 'player', payload: {} };

/** Áp lệnh ở ngày hiện tại rồi chạy n ngày (lệnh vào hàng đợi, áp ở đầu tick). */
const play = (state: GameState, cmds: Command[], days = 1): GameState =>
  runDays(
    cmds.reduce((s, c) => enqueue(s, c), state),
    content,
    days,
  );
const player = (s: GameState) => must(s.companies['player']);
const rejected = (s: GameState) => s.events.filter((e) => e.kind === 'commandRejected');
const reason = (s: GameState, cmd: Command) => {
  const v = validateCommand(s, content, cmd);
  return v.ok ? null : v.reason;
};

describe('LeaseOffice (economic-model §15.1)', () => {
  const s0 = createGame(content);
  const s1 = play(s0, [lease('small', 'w')]);

  it('pays fit-out capex into PP&E and records the lease at district rent × multiplier', () => {
    const office = must(player(s1).office);
    expect(office).toMatchObject({
      districtId: 'w',
      size: 'small',
      openedDay: 0,
      capex: 4_000_000,
      accumDep: 0,
    });
    expect(office.rentMonthly).toBe(300_000); // $5,000 × 0.6
    expect(currentBalances(s1.ledger, 'player')[ACC.PPE]).toBe(4_000_000);
    expect(s1.events.some((e) => e.kind === 'officeLeased' && e.size === 'small')).toBe(true);
  });

  it('rejects a second office, unknown sizes/districts and unaffordable capex', () => {
    expect(reason(s1, lease('medium'))).toMatch(/đã có văn phòng/);
    const huge: Command = untyped(
      '{"type":"LeaseOffice","companyId":"player","payload":{"districtId":"w","size":"huge"}}',
    );
    expect(reason(s0, huge)).toMatch(/không tồn tại/);
    expect(reason(s0, lease('small', 'zz'))).toMatch(/không tồn tại/);
    const poorer = play(s0, [
      lease('large', 'e'),
      { type: 'OpenStore', companyId: 'player', payload: { districtId: 'e' } },
    ]);
    expect(reason(poorer, { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } })).toMatch(
      /không đủ tiền/,
    );
  });
});

describe('OpenDepartment / CloseDepartment (economic-model §15.2)', () => {
  const s0 = createGame(content);

  it('needs an office and a free slot; charges the opening cost to the department account', () => {
    expect(reason(s0, openDept('hr'))).toMatch(/cần thuê văn phòng/);
    const s = play(s0, [lease('small'), openDept('hr'), openDept('finance')]);
    expect(rejected(s)).toEqual([]);
    expect(player(s).departments.hr).toEqual({ openedDay: 0 });
    expect(currentBalances(s.ledger, 'player')[ACC.DeptHr]).toBe(1_000_000);
    expect(currentBalances(s.ledger, 'player')[ACC.DeptFinance]).toBe(1_000_000);
    expect(reason(s, openDept('marketing'))).toMatch(/chỉ có 2 chỗ/);
    expect(reason(s, openDept('hr'))).toMatch(/đã mở/);
    // đóng một phòng thì có lại slot
    const freed = play(s, [closeDept('finance')]);
    expect(player(freed).departments.finance).toBeNull();
    expect(reason(freed, openDept('marketing'))).toBeNull();
    expect(reason(freed, closeDept('finance'))).toMatch(/chưa mở/);
  });
});

describe('month close with an office (economic-model §15, §10)', () => {
  // Thuê văn phòng nhỏ + mở Nhân sự ở ngày 0, chạy hết tháng 0.
  const s = play(createGame(content), [lease('small'), openDept('hr')], 30);
  const pnl = must(s.statements['player']?.[0]).pnl;

  it('posts office rent, office overhead (Admin) and department fixed + opening costs', () => {
    expect(pnl.officeRent).toBe(300_000);
    // overhead và chi phí cố định nhân CPI hằng ngày → gần đúng giá trị danh nghĩa
    expect(pnl.admin).toBeGreaterThanOrEqual(150_000);
    expect(pnl.admin).toBeLessThan(151_000);
    expect(pnl.departments).toBeGreaterThanOrEqual(1_000_000 + 300_000);
    expect(pnl.departments).toBeLessThan(1_000_000 + 302_000);
    expect(pnl.ebitda).toBe(
      pnl.grossProfit - pnl.wages - pnl.rent - pnl.marketing - pnl.admin - pnl.officeRent - pnl.departments,
    );
  });

  it('depreciates the office like a store and resets the accruals', () => {
    expect(pnl.depreciation).toBe(Math.floor(4_000_000 / content.industry.usefulLifeMonths));
    expect(must(player(s).office).accumDep).toBe(pnl.depreciation);
    expect(player(s).officeAccrued).toEqual({
      rent: 0,
      overhead: 0,
      departments: { hr: 0, product: 0, finance: 0, marketing: 0, board: 0 },
    });
  });

  it('keeps every invariant over a year with an office', () => {
    const year = runDays(s, content, 331); // qua ngày 360: hợp đồng gia hạn
    expect(checkInvariants(year, content)).toEqual([]);
    // gia hạn sau 12 tháng: thuê index theo CPI
    expect(must(player(year).office).rentMonthly).toBe(mul(money(300_000), year.macro.priceIndex));
  });
});

describe('ReleaseOffice (economic-model §15.1)', () => {
  const s = play(createGame(content), [lease('medium', 'e'), openDept('hr'), openDept('product')], 45);
  const before = currentBalances(s.ledger, 'player');
  const after = play(s, [release]);
  const b = currentBalances(after.ledger, 'player');
  const office = must(player(s).office);

  it('writes off the book value, pays 3 months of rent and closes every department', () => {
    expect(player(after).office).toBeNull();
    expect(player(after).departments).toEqual({
      hr: null,
      product: null,
      finance: null,
      marketing: null,
      board: null,
    });
    expect(b[ACC.PPE]).toBe(before[ACC.PPE] - office.capex);
    expect(b[ACC.LossOnDisposal] - before[ACC.LossOnDisposal]).toBe(office.capex - office.accumDep);
    expect(b[ACC.OfficeRent] - before[ACC.OfficeRent]).toBe(mul(office.rentMonthly, 3));
    expect(after.events.filter((e) => e.kind === 'departmentClosed')).toHaveLength(2);
    expect(reason(after, release)).toMatch(/chưa có văn phòng/);
  });

  it('accrued office costs up to the release are still booked at month close', () => {
    const closed = runDays(after, content, 15);
    const month1 = must(closed.statements['player']?.[1]).pnl;
    // ngày 30–44 đã cộng dồn (lệnh trả áp ở đầu ngày 45, trước khi cộng dồn) + 3 tháng phí chấm dứt
    expect(month1.officeRent).toBe(Math.round((office.rentMonthly * 15) / 30) + mul(office.rentMonthly, 3));
    expect(checkInvariants(closed, content)).toEqual([]);
  });
});

describe('bankruptcy with an office (economic-model §8, §15.1)', () => {
  it('liquidates the office without a termination fee and closes every department', () => {
    // Văn phòng lớn + 5 phòng + 2 cửa hàng: chi phí cố định vượt xa lãi gộp của thành phố nhỏ → phá sản.
    const depts: Department[] = ['hr', 'product', 'finance', 'marketing', 'board'];
    const cmds: Command[] = [
      lease('large', 'e'),
      ...depts.map(openDept),
      { type: 'OpenStore', companyId: 'player', payload: { districtId: 'w' } },
    ];
    const s = play(createGame(content), cmds, 360);
    expect(player(s).status).toBe('bankrupt');
    expect(player(s).office).toBeNull();
    expect(player(s).departments).toEqual({
      hr: null,
      product: null,
      finance: null,
      marketing: null,
      board: null,
    });
    const b = currentBalances(s.ledger, 'player');
    expect(b[ACC.PPE]).toBe(0);
    expect(b[ACC.AccumulatedDepreciation]).toBe(0);
    const memos = s.ledger.entries.filter((e) => e.companyId === 'player').map((e) => e.memo);
    expect(memos).toContain('Thanh lý văn phòng khi phá sản');
    expect(memos.filter((m) => m.startsWith('Phí chấm dứt thuê văn phòng'))).toEqual([]);
    expect(checkInvariants(s, content)).toEqual([]);
  });
});
