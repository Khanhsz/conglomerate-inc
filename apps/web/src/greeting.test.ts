import { describe, expect, it } from 'vitest';
import { greeting } from './greeting';

describe('web scaffold', () => {
  it('renders a greeting using sim-core', () => {
    expect(greeting()).toContain('Hello');
    expect(greeting()).toContain('360');
  });
});
