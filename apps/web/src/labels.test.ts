import { describe, expect, it } from 'vitest';
import { LEVEL_NAME, segmentName } from './labels';

describe('labels', () => {
  it('names known segments and falls back to the id', () => {
    expect(segmentName('students')).toBe('sinh viên');
    expect(segmentName('tourists')).toBe('tourists');
  });
  it('has a name for every policy level', () => {
    expect(Object.values(LEVEL_NAME).every((n) => n.length > 0)).toBe(true);
    expect(Object.keys(LEVEL_NAME)).toEqual(['0', '1', '2', '3']);
  });
});
