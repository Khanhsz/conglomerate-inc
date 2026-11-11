import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('defaults', () => {
    expect(parseArgs([])).toMatchObject({
      seeds: 10,
      years: 3,
      bots: ['none', 'idle', 'random', 'sensible', 'aggressiveDebt'],
      out: null,
      smoke: false,
      checkInvariants: false,
      seedStart: 1,
    });
  });

  it('parses the spec §6 command line (with the `--` pnpm passes through)', () => {
    const a = parseArgs([
      '--',
      '--seeds',
      '100',
      '--years',
      '3',
      '--bots',
      'all',
      '--out',
      'out/balance.csv',
    ]);
    expect(a).toMatchObject({ seeds: 100, years: 3, out: 'out/balance.csv' });
    expect(a.bots).toHaveLength(5);
  });

  it('accepts a bot list and --workers', () => {
    expect(parseArgs(['--bots', 'random,sensible', '--workers', '2'])).toMatchObject({
      bots: ['random', 'sensible'],
      workers: 2,
    });
  });

  it('--smoke means 10 seeds × 2 years × all bots with invariant checks', () => {
    expect(parseArgs(['--smoke'])).toMatchObject({ smoke: true, seeds: 10, years: 2, checkInvariants: true });
  });

  it('rejects unknown bots and flags', () => {
    expect(() => parseArgs(['--bots', 'genius'])).toThrow(/genius/);
    expect(() => parseArgs(['--fast'])).toThrow(/--fast/);
    expect(() => parseArgs(['--seeds', 'x'])).toThrow(/--seeds/);
  });
});
