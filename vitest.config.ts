import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Chế độ kiểm tra của sim-core cho mọi project (ADR-0002). */
const setupFiles = [
  fileURLToPath(new URL('./packages/sim-core/src/test-support/dev-checks.setup.ts', import.meta.url)),
];

const pkg = (name: string, root: string) => ({
  test: { name, root, include: ['src/**/*.test.{ts,tsx}'], environment: 'node' as const, setupFiles },
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
