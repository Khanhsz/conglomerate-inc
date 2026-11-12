import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame } from '../engine';
import { createRngFactory } from '../rng';
import { fixtureContent } from '../test-support/fixture';
import type { SimContext } from '../types/context';
import { dailyRate, macroSystem } from './macro';

describe('macroSystem (economic-model §0–§1)', () => {
  const content = fixtureContent();
  const ctx = (day: number): SimContext => ({ content, day, rng: (s) => createRngFactory(1)(s, day) });

  it('dailyRate compounds to the annual rate over 360 days', () => {
    expect((1 + dailyRate(0.03)) ** 360).toBeCloseTo(1.03, 12);
    expect(dailyRate(0)).toBe(0);
  });

  it('leaves day 0 untouched', () => {
    const s = createGame(content);
    const out = produce(s, (d) => macroSystem(d, ctx(0)));
    expect(out.macro).toEqual(s.macro);
  });

  it('after days 1..360 priceIndex and incomeIndex = 1 + π', () => {
    let s = createGame(content);
    for (let day = 0; day <= 360; day++) s = produce(s, (d) => macroSystem(d, ctx(day)));
    expect(s.macro.priceIndex).toBeCloseTo(1.03, 12);
    expect(s.macro.incomeIndex).toBeCloseTo(1.03, 12);
    expect(s.macro.marketWageMonthly).toBe(220_000); // lương thị trường lưu chưa nhân CPI
  });
});
