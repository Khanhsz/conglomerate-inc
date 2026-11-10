import { defineConfig } from 'vitest/config';

const pkg = (name: string, root: string) => ({
  test: { name, root, include: ['src/**/*.test.{ts,tsx}'], environment: 'node' as const },
});

export default defineConfig({
  test: {
    projects: [
      pkg('sim-core', 'packages/sim-core'),
      pkg('content', 'packages/content'),
      pkg('balance', 'packages/balance'),
      pkg('web', 'apps/web'),
      { test: { name: 'repo', root: '.', include: ['tests/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
