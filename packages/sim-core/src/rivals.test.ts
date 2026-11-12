import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGame, runDays } from './engine';
import { hashState, checkInvariants } from './invariants';
import { ACC } from './ledger/accounts';
import { currentBalances } from './ledger/balances';
import { createRngFactory } from './rng';
import { activeChains, generateRival, presentRivals, profileFromPersonality } from './rivals';
import { decideMonthly } from './systems/ai';
import { fixtureContent, rivalWorldContent } from './test-support/fixture';
import { must } from './test-support/must';
import type { AiCompany, GameState } from './types/state';
import { worldOf } from './world';

const m1 = fixtureContent();
const world = rivalWorldContent();
const gen = world.industry.rivalGenerator;
const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;
const rivals = (s: GameState): AiCompany[] =>
  s.companyIds.flatMap((id) => {
    const c = s.companies[id];
    return c && c.kind === 'ai' && c.profile.source === 'generated' ? [c] : [];
  });

describe('profile of scenario-declared rivals (economic-model §9)', () => {
  it('is exactly the M1 personality table plus aiRules, with the average-ROI rule', () => {
    expect(profileFromPersonality(m1, 'balanced')).toEqual({
      source: 'personality',
      ...m1.industry.aiPersonalities.balanced,
      expansion: { rule: 'averageRoi', ...m1.industry.aiRules.expansion, maxPaybackMonths: 0 },
      closeAfterNegativeMonths: m1.industry.aiRules.closeAfterNegativeMonths,
      reach: 'national',
      homeCityId: 'testville',
    });
    const ai = must(createGame(m1).companies['ai-1']);
    expect(ai.kind === 'ai' && ai.profile.source).toBe('personality');
    expect(ai.kind === 'ai' && ai.personality).toBe('balanced');
  });

  it('a scenario without `competition` generates nobody and has no market targets', () => {
    const s = runDays(createGame(m1), m1, 90);
    expect(s.companyIds).toEqual(['ai-1', 'player']);
    expect(s.market).toEqual({ targetChains: 0, cities: {} });
    expect(s.nextIds.company).toBe(1);
  });
});

describe('generateRival (economic-model §20.1)', () => {
  const draw = (seed: number, kind: 'local' | 'chain') =>
    generateRival(world, createRngFactory(seed)('rival:1', 0), {
      kind,
      homeCityId: 'eastville',
      priceIndex: 1,
      takenNames: new Set(),
      serial: 1,
    });

  it('property: every trait lies in the range of its quality tier and reach', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.constantFrom('local' as const, 'chain' as const),
        (seed, kind) => {
          const r = draw(seed, kind);
          const p = r.profile;
          const tier = gen.tiers[p.qualityTier];
          expect(p.source).toBe('generated');
          expect(within(p.markup, tier.markup)).toBe(true);
          expect(within(p.wageRatio, tier.wageRatio)).toBe(true);
          expect(within(p.marketingShareOfRevenue, tier.marketingShare)).toBe(true);
          expect(p.expansion.rule).toBe('marginalGain');
          expect(within(p.expansion.maxPaybackMonths, gen.expansion.maxPaybackMonths)).toBe(true);
          expect(Number.isInteger(p.expansion.maxPaybackMonths)).toBe(true);
          expect(within(p.expansion.cashMultiple, gen.expansion.cashMultiple)).toBe(true);
          expect(within(p.closeAfterNegativeMonths, gen.patienceMonths)).toBe(true);
          expect(kind === 'local' ? p.reach === 'local' : p.reach !== 'local').toBe(true);
          expect(within(r.startingCash, gen.capital[p.reach])).toBe(true);
          expect(r.startingCash % 100_000).toBe(0); // làm tròn $1,000
          expect(within(r.initialStores, gen.initialStores[p.reach])).toBe(true);
          expect(p.homeCityId).toBe('eastville');
          expect(r.name).toMatch(/^\S+ \S+$/);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('same seed → same rival; different seeds give different rivals', () => {
    expect(draw(11, 'local')).toEqual(draw(11, 'local'));
    const names = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(draw(i, 'chain').profile)));
    expect(names.size).toBe(30);
  });

  it('avoids names already in use; scales capital with the price index', () => {
    const first = draw(5, 'local');
    const again = generateRival(world, createRngFactory(5)('rival:1', 0), {
      kind: 'local',
      homeCityId: 'eastville',
      priceIndex: 2,
      takenNames: new Set([first.name]),
      serial: 9,
    });
    expect(again.name).not.toBe(first.name);
    expect(again.startingCash).toBe(first.startingCash * 2);
  });
});

describe('rivals at game start (economic-model §20.5)', () => {
  const s0 = createGame(world, { seed: 7 });

  it('each city gets 2–3 local chains, plus 1–2 multi-city chains, all from the seed', () => {
    const list = rivals(s0);
    const locals = list.filter((c) => c.profile.reach === 'local');
    for (const city of world.scenario.cities) {
      const n = locals.filter((c) => c.profile.homeCityId === city.id).length;
      expect(n, city.id).toBeGreaterThanOrEqual(2);
      expect(n, city.id).toBeLessThanOrEqual(3);
    }
    expect(list.length - locals.length).toBeGreaterThanOrEqual(1);
    expect(list.length - locals.length).toBeLessThanOrEqual(2);
    expect(s0.market.targetChains).toBe(activeChains(s0));
    expect(list.map((c) => c.id)).toEqual(list.map((_, i) => `ai-00000${i + 1}`));
    expect(new Set(list.map((c) => c.name)).size).toBe(list.length);
    expect(s0.nextIds.company).toBe(list.length + 1);
  });

  it('every rival is a real company: capital through the ledger, stores opened in its home city', () => {
    const w = worldOf(world);
    for (const c of rivals(s0)) {
      const balances = currentBalances(s0.ledger, c.id);
      expect(balances[ACC.ShareCapital]).toBeGreaterThanOrEqual(gen.capital[c.profile.reach][0]);
      const stores = s0.storeIds.map((id) => must(s0.stores[id])).filter((x) => x.companyId === c.id);
      expect(stores.length).toBeGreaterThanOrEqual(1);
      expect(stores.length).toBeLessThanOrEqual(gen.initialStores[c.profile.reach][1]);
      for (const store of stores) {
        const k = w.cityOf[must(w.indexOf.get(store.districtId))];
        expect(must(w.cities[must(k)]).id).toBe(c.profile.homeCityId);
        expect(store.staff).toBe(world.industry.aiInitialStaff);
      }
      // Tiền mặt = vốn − capex các cửa hàng đã mở.
      expect(balances[ACC.Cash]).toBe(balances[ACC.ShareCapital] - balances[ACC.PPE]);
      expect(c.qualityTier).toBe(c.profile.qualityTier);
      expect(c.foundedDay).toBe(0);
    }
    expect(checkInvariants(s0, world)).toEqual([]);
  });

  it('market targets record how many rivals each city starts with', () => {
    const present = presentRivals(s0, world);
    world.scenario.cities.forEach((city, k) => {
      expect(s0.market.cities[city.id]).toEqual({ targetRivals: present[k], entryDueDay: null });
      expect(must(present[k])).toBeGreaterThanOrEqual(2);
    });
  });

  it('is deterministic by seed, and different seeds give different rivals', () => {
    expect(hashState(createGame(world, { seed: 7 }))).toBe(hashState(s0));
    const other = createGame(world, { seed: 8 });
    expect(rivals(other).map((c) => c.name)).not.toEqual(rivals(s0).map((c) => c.name));
    const a = runDays(s0, world, 120);
    const b = runDays(createGame(world, { seed: 7 }), world, 120);
    expect(hashState(a)).toBe(hashState(b));
    expect(checkInvariants(a, world)).toEqual([]);
  });
});

describe('expansion by marginal gain (economic-model §9, rule 4b)', () => {
  const rng = () => createRngFactory(1)('ai:test', 30);
  const firstRival = (s: GameState) => must(rivals(s)[0]);

  it('opens a new store only where it adds profit and pays back in time', () => {
    const s = runDays(createGame(world, { seed: 7 }), world, 29);
    const c = firstRival(s);
    const open = (state: GameState, patch: Partial<AiCompany['profile']['expansion']>) =>
      decideMonthly(
        state,
        world,
        c.id,
        { ...c.profile, expansion: { ...c.profile.expansion, cashMultiple: 0.1, ...patch } },
        rng(),
      ).filter((cmd) => cmd.type === 'OpenStore');
    // Hoàn vốn 0 tháng: không địa điểm nào đạt.
    expect(open(s, { maxPaybackMonths: 0 })).toEqual([]);
    // Cho phép hoàn vốn rất dài: mở ở địa điểm có lãi biên dương cao nhất (thị trường còn trống nhiều).
    const generous = open(s, { maxPaybackMonths: 10_000 });
    expect(generous).toHaveLength(1);
    const districtId = generous[0]?.type === 'OpenStore' ? generous[0].payload.districtId : '';
    // Chuỗi địa phương chỉ mở trong thành phố nhà.
    if (c.profile.reach === 'local') {
      const w = worldOf(world);
      expect(must(w.cities[must(w.cityOf[must(w.indexOf.get(districtId))])]).id).toBe(c.profile.homeCityId);
    }
  });

  it('does not expand into an empty city (no customers → no gain)', () => {
    const empty = rivalWorldContent((d) => {
      for (const district of d.scenario.cities.flatMap((x) => x.districts)) district.pop = 0;
    });
    const s = runDays(createGame(empty, { seed: 7 }), empty, 29);
    for (const c of rivals(s)) {
      const cmds = decideMonthly(
        s,
        empty,
        c.id,
        { ...c.profile, expansion: { ...c.profile.expansion, cashMultiple: 0.1, maxPaybackMonths: 10_000 } },
        rng(),
      );
      expect(cmds.filter((cmd) => cmd.type === 'OpenStore')).toEqual([]);
    }
  });
});
