import { DEFAULT_SCENARIO_ID } from '@game/content';
import { DAYS_PER_YEAR } from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { describeRun } from './index';

describe('balance scaffold', () => {
  it('reports that the runner is not implemented yet', () => {
    expect(describeRun([])).toBe('balance: not implemented');
    expect(describeRun(['--smoke'])).toBe('balance:smoke: not implemented');
  });

  it('resolves workspace dependencies', () => {
    expect(DEFAULT_SCENARIO_ID).toBe('m1-default');
    expect(DAYS_PER_YEAR).toBe(360);
  });
});
