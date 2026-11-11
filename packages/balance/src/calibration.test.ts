import { describe, expect, it } from 'vitest';
import { loadDefaultContent } from './content';
import { calibration, type RunResult } from './report';
import { runOne } from './runner';

// Spec §8: kiểm mục tiêu economic-model §14 trên sim thật. Chậm (~10 s) nên chỉ chạy khi CALIBRATE=1.
// Đầy đủ (100 seed × 3 năm × mọi bot): `pnpm balance -- --seeds 100 --years 3 --bots all`.
describe.skipIf(!process.env['CALIBRATE'])('calibration targets (economic-model §14)', () => {
  it('year-1 industry share, served/store/day and balanced AI EBITDA margin are in range (10 seeds, bot none)', () => {
    const content = loadDefaultContent();
    const runs: RunResult[] = [];
    for (let seed = 1; seed <= 10; seed++)
      runs.push(runOne(content, seed, 'none', 1, { checkInvariants: false }));
    const c = calibration(runs, 'ai-daily');
    expect(c.industryShare).toBeGreaterThanOrEqual(0.3);
    expect(c.industryShare).toBeLessThanOrEqual(0.5);
    expect(c.servedPerStoreDay).toBeGreaterThanOrEqual(250);
    expect(c.servedPerStoreDay).toBeLessThanOrEqual(650);
    expect(c.balancedEbitdaMargin).toBeGreaterThanOrEqual(0.08);
    expect(c.balancedEbitdaMargin).toBeLessThanOrEqual(0.25);
  }, 120_000);
});
