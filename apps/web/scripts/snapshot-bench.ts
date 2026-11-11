/**
 * Đo chi phí buildSnapshot (M1.7 tối ưu): mục tiêu ≤ 1 ms khi đang mở màn hình cửa hàng.
 * Chạy: `pnpm exec tsx apps/web/scripts/snapshot-bench.ts` (content đọc từ đĩa, không cần Vite).
 */
import { readFileSync } from 'node:fs';
import { loadContent } from '@game/content';
import { createGame, enqueue, runDays } from '@game/sim-core';
import { buildSnapshot } from '../src/sim/snapshot';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const content = loadContent(
  read('../../../packages/content/industries/coffee.yaml'),
  read('../../../packages/content/scenarios/m1-default.yaml'),
);
let state = enqueue(createGame(content), {
  type: 'OpenStore',
  companyId: 'player',
  payload: { districtId: 'c' },
});
state = runDays(state, content, 200);

function time(label: string, inspected: string | null, n = 200): void {
  buildSnapshot(state, content, 0, inspected);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) buildSnapshot(state, content, 0, inspected);
  console.log(`${label}: ${((performance.now() - t0) / n).toFixed(3)} ms`);
}

time('buildSnapshot (bản đồ)', null);
time('buildSnapshot (màn hình cửa hàng)', 'store-000010');
