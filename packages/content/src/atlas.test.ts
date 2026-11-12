import { readFileSync } from 'node:fs';
import { ZONES } from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { buildAtlasYaml } from './atlas';
import { loadContent } from './load';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const industryYaml = read('../industries/coffee.yaml');
const atlasYaml = read('../scenarios/atlas.yaml');

describe('scenario atlas (M1.8): 7 cities, 30–35 districts each, 3 zones', () => {
  it('the committed YAML is exactly what the generator produces (run `pnpm content:atlas` after edits)', () => {
    expect(atlasYaml).toBe(buildAtlasYaml());
  });

  const { scenario } = loadContent(industryYaml, atlasYaml);

  it('loads with the coffee pack: seven cities with unique ids', () => {
    expect(scenario.id).toBe('atlas');
    expect(scenario.cities.map((c) => c.id)).toEqual([
      'riverton',
      'port-azure',
      'highmont',
      'campus-vale',
      'ironbridge',
      'silverlake',
      'sunfield',
    ]);
  });

  it('every city has 30–35 districts, all three zones, and fits a phone-sized grid', () => {
    for (const city of scenario.cities) {
      expect(city.districts.length, city.id).toBeGreaterThanOrEqual(30);
      expect(city.districts.length, city.id).toBeLessThanOrEqual(35);
      expect(city.gridW, city.id).toBeLessThanOrEqual(7);
      for (const zone of ZONES) {
        const n = city.districts.filter((d) => d.zone === zone).length;
        expect(n, `${city.id} ${zone}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('zones differ the way the design says: budget cheapest, central most office workers, premium most premium', () => {
    for (const city of scenario.cities) {
      const avg = (zone: string, f: (d: (typeof city.districts)[number]) => number) => {
        const list = city.districts.filter((d) => d.zone === zone);
        return list.reduce((a, d) => a + f(d), 0) / list.length;
      };
      expect(
        avg('budget', (d) => d.rentMonthly),
        city.id,
      ).toBeLessThan(avg('central', (d) => d.rentMonthly));
      expect(
        avg('budget', (d) => d.rentMonthly),
        city.id,
      ).toBeLessThan(avg('premium', (d) => d.rentMonthly));
      expect(
        avg('central', (d) => d.mix['office'] ?? 0),
        city.id,
      ).toBeGreaterThan(avg('budget', (d) => d.mix['office'] ?? 0));
      expect(
        avg('premium', (d) => d.mix['premium'] ?? 0),
        city.id,
      ).toBeGreaterThan(avg('central', (d) => d.mix['premium'] ?? 0));
    }
  });

  it('only the player is declared; rivals come from the generator at game start', () => {
    expect(scenario.companies.map((c) => c.id)).toEqual(['player']);
  });
});
