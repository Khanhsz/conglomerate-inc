import { defineConfig } from '@playwright/test';

/** Smoke test UI (spec §7). Chạy: `pnpm e2e` (build rồi preview bản build). */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
