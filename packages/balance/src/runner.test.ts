import { describe, expect, it } from 'vitest';
import { BOT_NAMES } from './bots/index';
import { loadDefaultContent } from './content';
import { runOne } from './runner';

const content = loadDefaultContent();

describe('runOne', () => {
  it.each(BOT_NAMES)(
    '%s: 1 year, one row per company per month, no invariant violations',
    (bot) => {
      const r = runOne(content, 3, bot, 1, { checkInvariants: true });
      expect(r.violations).toEqual([]);
      expect(r.rows).toHaveLength(12 * 4);
      expect(new Set(r.rows.map((x) => x.companyId))).toEqual(
        new Set(['ai-aura', 'ai-bean', 'ai-daily', 'player']),
      );
      for (const x of r.rows) {
        expect(x.bot).toBe(bot);
        expect(Number.isFinite(x.revenue) && Number.isFinite(x.cash) && Number.isFinite(x.marketShare)).toBe(
          true,
        );
        expect(x.industryShare).toBeGreaterThan(0);
        expect(x.industryShare).toBeLessThan(1);
      }
    },
    60_000,
  );

  it('is deterministic per (seed, bot) and differs across seeds', () => {
    const a = runOne(content, 5, 'random', 1, { checkInvariants: false });
    const b = runOne(content, 5, 'random', 1, { checkInvariants: false });
    const c = runOne(content, 6, 'random', 1, { checkInvariants: false });
    expect(a.rows).toEqual(b.rows);
    expect(a.rows).not.toEqual(c.rows);
  }, 60_000);
});
