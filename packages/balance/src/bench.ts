/**
 * Bench hiệu năng (spec §8): 3 năm, 60 cửa hàng, 4 công ty, mục tiêu < 1.5 s trên Node.
 * Chỉ in kết quả, không fail. Chạy: `pnpm bench`.
 */
import { loadContent } from '@game/content';
import { createGame, DAYS_PER_YEAR, step } from '@game/sim-core';
import { parse, stringify } from 'yaml';
import { readDefaultYaml } from './content';

const TARGET_MS = 1500;
const STORES_PER_COMPANY = 15;

/** m1-default với mỗi công ty 15 cửa hàng ban đầu, đủ tiền, AI không mở thêm (giữ đúng 60 cửa hàng). */
export function benchContent() {
  const yaml = readDefaultYaml();
  const industry = parse(yaml.industry);
  industry.aiRules.expansion.minMonthlyRoi = 1e9;
  const scenario = parse(yaml.scenario);
  const districtIds: string[] = scenario.city.districts.map((d: { id: string }) => d.id);
  const twice = [...districtIds, ...districtIds].slice(0, STORES_PER_COMPANY);
  for (const company of scenario.companies) {
    company.startingCash = 1_000_000_000; // $10M
    company.initialStores = twice;
  }
  return loadContent(stringify(industry), stringify(scenario));
}

function main(): void {
  const content = benchContent();
  const runs: number[] = [];
  let stores = 0;
  for (let i = 0; i < 3; i++) {
    let state = createGame(content, { seed: 42 + i });
    stores = state.storeIds.length;
    const t0 = performance.now();
    for (let d = 0; d < 3 * DAYS_PER_YEAR; d++) state = step(state, content);
    runs.push(performance.now() - t0);
  }
  const best = Math.min(...runs);
  console.log(
    `Bench: 3 năm × ${stores} cửa hàng × 4 công ty — ${runs.map((r) => `${r.toFixed(0)} ms`).join(', ')}`,
  );
  console.log(
    `Tốt nhất ${best.toFixed(0)} ms; mục tiêu < ${TARGET_MS} ms: ${best < TARGET_MS ? 'ĐẠT' : 'CHƯA ĐẠT'}`,
  );
  // CI: `--warn-ms N` in cảnh báo GitHub Actions khi chậm hơn N ms (không làm fail job).
  const warnAt = process.argv.indexOf('--warn-ms');
  const warnMs = warnAt >= 0 ? Number(process.argv[warnAt + 1]) : NaN;
  if (Number.isFinite(warnMs) && best > warnMs) {
    console.log(`::warning::Bench ${best.toFixed(0)} ms vượt ngưỡng cảnh báo ${warnMs} ms`);
  }
}

main();
