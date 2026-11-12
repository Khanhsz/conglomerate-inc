import { DAYS_PER_YEAR } from '@game/sim-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INDUSTRY_ID, DEFAULT_SCENARIO_ID } from './index';

describe('content scaffold', () => {
  it('exposes default content ids', () => {
    expect(DEFAULT_INDUSTRY_ID).toBe('coffee');
    expect(DEFAULT_SCENARIO_ID).toBe('m1-default');
  });

  it('resolves the workspace dependency on sim-core', () => {
    expect(DAYS_PER_YEAR).toBe(360);
  });
});
