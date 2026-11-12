import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, runDays, validateCommand } from '../engine';
import { checkInvariants, hashState } from '../invariants';
import { activeChains, presentRivals } from '../rivals';
import { rivalWorldContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import type { AiCompany, GameEvent, GameState } from '../types/state';
import { cityMargins } from './entry';

const withChains = rivalWorldContent();
/** Chỉ chuỗi địa phương: không ai tự mở rộng sang thành phố khác, nên đếm đối thủ theo thành phố là chắc chắn. */
const content = rivalWorldContent((d) => {
  must(d.scenario.competition).initial.chains = [0, 0];
});
const competition = must(content.scenario.competition);
const start = createGame(content, { seed: 7 });
const rivals = (s: GameState): AiCompany[] =>
  s.companyIds.flatMap((id) => {
    const c = s.companies[id];
    return c && c.kind === 'ai' ? [c] : [];
  });
const entered = (s: GameState) =>
  s.events.filter(
    (e): e is Extract<GameEvent, { kind: 'competitorEntered' }> => e.kind === 'competitorEntered',
  );
const cityIndex = (cityId: string) => content.scenario.cities.findIndex((c) => c.id === cityId);

/** Loại một đối thủ ngay lập tức: phá sản và đóng mọi cửa hàng (không qua sổ; chỉ để dựng tình huống). */
function knockOut(s: GameState, companyId: string): GameState {
  return produce(s, (d) => {
    must(d.companies[companyId]).status = 'bankrupt';
    for (const id of d.storeIds) {
      const store = must(d.stores[id]);
      if (store.companyId === companyId) store.status = 'closed';
    }
  });
}

describe('replacement entry (economic-model §20.3)', () => {
  const victim = must(rivals(start).find((c) => c.profile.reach === 'local'));
  const home = victim.profile.homeCityId;
  const k = cityIndex(home);
  const before = must(presentRivals(start, content)[k]);
  const out = knockOut(start, victim.id);

  it('a city that lost a rival schedules an entrant 1–4 months ahead, at the next month start', () => {
    expect(presentRivals(out, content)[k]).toBe(before - 1);
    const s = runDays(out, content, 31); // qua ngày đầu tháng 2 (ngày 30)
    const due = must(s.market.cities[home]).entryDueDay;
    expect(due).not.toBeNull();
    const [lo, hi] = competition.entryDelayMonths;
    expect(must(due)).toBeGreaterThanOrEqual(30 + 30 * lo);
    expect(must(due)).toBeLessThanOrEqual(30 + 30 * hi);
    expect(entered(s)).toEqual([]);
  });

  it('when the day comes a new rival enters that city as a real company, and the count is restored', () => {
    const scheduled = runDays(out, content, 31);
    const due = must(must(scheduled.market.cities[home]).entryDueDay);
    const s = runDays(scheduled, content, due - scheduled.clock.day + 1);
    const events = entered(s).filter((e) => e.cityId === home);
    expect(events).toHaveLength(1);
    const event = must(events[0]);
    expect(event.day).toBe(due);
    const newcomer = must(s.companies[event.companyId]);
    expect(newcomer.kind === 'ai' && newcomer.profile.homeCityId).toBe(home);
    expect(newcomer.kind === 'ai' && newcomer.foundedDay).toBe(due);
    expect(newcomer.name).toBe(event.name);
    expect(
      s.storeIds.some((id) => s.stores[id]?.companyId === event.companyId && s.stores[id]?.status === 'open'),
    ).toBe(true);
    expect(presentRivals(s, content)[k]).toBe(before);
    // Đủ số rồi thì không hẹn thêm (trừ khi thị trường hấp dẫn, chưa đủ 6 tháng để xét).
    expect(must(s.market.cities[home]).entryDueDay).toBeNull();
    expect(checkInvariants(s, content)).toEqual([]);
  });

  it('a lost multi-city chain is replaced by a chain', () => {
    const begin = createGame(withChains, { seed: 7 });
    const chain = must(rivals(begin).find((c) => c.profile.reach !== 'local'));
    const horizon = 31 + 30 * must(withChains.scenario.competition).entryDelayMonths[1] + 1;
    const s = runDays(knockOut(begin, chain.id), withChains, horizon);
    expect(activeChains(s)).toBe(begin.market.targetChains);
    const replacement = must(entered(s).map((e) => must(s.companies[e.companyId]))[0]);
    expect(replacement.kind === 'ai' && replacement.profile.reach).not.toBe('local');
  });

  it('is deterministic: same seed and same knock-out give the same world', () => {
    const a = runDays(out, content, 200);
    const b = runDays(knockOut(createGame(content, { seed: 7 }), victim.id), content, 200);
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('withdrawal (economic-model §20.2)', () => {
  it('a rival with no store for 3 month closes leaves the market; it stops acting and is replaced', () => {
    const victim = must(rivals(start).find((c) => c.profile.reach === 'local'));
    // Đóng hết cửa hàng và không cho mở lại (không đủ tiền theo bội số tiền mặt).
    const stuck = produce(start, (d) => {
      const c = must(d.companies[victim.id]);
      if (c.kind === 'ai') {
        Object.assign(c, {
          profile: { ...c.profile, expansion: { ...c.profile.expansion, cashMultiple: 1e9 } },
        });
      }
      for (const id of d.storeIds) {
        const store = must(d.stores[id]);
        if (store.companyId === victim.id) store.status = 'closed';
      }
    });
    const twoCloses = runDays(stuck, content, 60);
    const c2 = must(twoCloses.companies[victim.id]);
    expect(c2.status).not.toBe('exited');
    expect(c2.kind === 'ai' && c2.storelessMonths).toBe(2);

    const s = runDays(twoCloses, content, 30);
    const c3 = must(s.companies[victim.id]);
    expect(c3.status).toBe('exited');
    expect(s.events.some((e) => e.kind === 'competitorExited' && e.companyId === victim.id)).toBe(true);
    // Lệnh của công ty đã rút bị từ chối.
    const verdict = validateCommand(s, content, {
      type: 'OpenStore',
      companyId: victim.id,
      payload: { districtId: 'w' },
    });
    expect(verdict.ok).toBe(false);
    // Trạng thái giữ nguyên ở các lần chốt tháng sau, và thành phố có đối thủ mới vào thay.
    const later = runDays(s, content, 30 * (competition.entryDelayMonths[1] + 2));
    expect(must(later.companies[victim.id]).status).toBe('exited');
    expect(entered(later).some((e) => e.cityId === victim.profile.homeCityId)).toBe(true);
    expect(checkInvariants(later, content)).toEqual([]);
  });
});

describe('attractive market entry (economic-model §20.4)', () => {
  it('cityMargins: contribution / revenue of all stores of a city over the last months', () => {
    const s = runDays(start, content, 90);
    const margins = cityMargins(s, content, 3);
    expect(margins).toHaveLength(2);
    for (const m of margins) {
      expect(m).not.toBeNull();
      expect(must(m)).toBeLessThan(1);
    }
    expect(cityMargins(start, content, 3)).toEqual([null, null]);
  });

  it('a market above the margin threshold keeps attracting entrants, but never above maxPerCity', () => {
    const hot = rivalWorldContent((d) => {
      const c = must(d.scenario.competition);
      c.initial.chains = [0, 0];
      c.attractive = { margin: -1, months: 2 }; // luôn hấp dẫn sau 2 tháng
      c.entryDelayMonths = [1, 1];
      c.maxPerCity = 4;
    });
    const s = runDays(createGame(hot, { seed: 7 }), hot, 30 * 14);
    expect(entered(s).length).toBeGreaterThan(0);
    // Mỗi thành phố lên tới trần và dừng ở đó (đối thủ bị loại trong lúc đó sẽ được thay).
    for (const n of presentRivals(s, hot)) expect(n).toBeLessThanOrEqual(4);
    expect(Math.max(...presentRivals(s, hot))).toBe(4);
    expect(checkInvariants(s, hot)).toEqual([]);
  });

  it('no entry while the city is full: with maxPerCity at the starting count nobody is added', () => {
    const full = rivalWorldContent((d) => {
      const c = must(d.scenario.competition);
      c.attractive = { margin: -1, months: 2 };
      c.maxPerCity = 1;
    });
    const s = runDays(createGame(full, { seed: 7 }), full, 300);
    expect(entered(s)).toEqual([]);
  });
});
