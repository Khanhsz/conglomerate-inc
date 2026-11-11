import { describe, expect, it } from 'vitest';
import { createGame, enqueue, runDays } from '../engine';
import { fixtureContent } from '../test-support/fixture';
import { must } from '../test-support/must';
import { officeView } from './office';

const content = fixtureContent();

describe('officeView (economic-model §15)', () => {
  it('without an office: lists every district × size option, no monthly cost', () => {
    const v = must(officeView(createGame(content), content, 'player'));
    expect(v.office).toBeNull();
    expect(v.monthlyCost).toBe(0);
    expect(v.leaseOptions).toHaveLength(2 * 3);
    expect(v.leaseOptions.find((o) => o.districtId === 'e' && o.size === 'medium')).toEqual({
      districtId: 'e',
      size: 'medium',
      slots: 4,
      capex: 8_000_000,
      rentMonthly: 700_000,
      overheadMonthly: 300_000,
    });
    expect(v.departments.map((d) => d.openedDay)).toEqual([null, null, null, null, null]);
  });

  it('with an office and two departments: slots, monthly cost and release fee', () => {
    const s = runDays(
      [
        {
          type: 'LeaseOffice' as const,
          companyId: 'player',
          payload: { districtId: 'w', size: 'small' as const },
        },
        { type: 'OpenDepartment' as const, companyId: 'player', payload: { dept: 'hr' as const } },
      ].reduce((acc, c) => enqueue(acc, c), createGame(content)),
      content,
      1,
    );
    const v = must(officeView(s, content, 'player'));
    expect(v.office).toMatchObject({
      size: 'small',
      slots: 2,
      slotsUsed: 1,
      rentMonthly: 300_000,
      releaseFee: 900_000,
    });
    const hr = must(v.departments.find((d) => d.dept === 'hr'));
    expect(hr.openedDay).toBe(0);
    expect(v.monthlyCost).toBe(300_000 + must(v.office).overheadMonthly + hr.fixedMonthly);
  });
});
