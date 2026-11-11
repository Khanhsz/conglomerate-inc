/**
 * Balance runner (spec §6):
 *   pnpm balance -- --seeds 100 --years 3 --bots all --out out/balance.csv
 *   pnpm balance:smoke   (10 seed × 2 năm × mọi bot, kiểm bất biến mỗi tháng; exit 1 nếu vi phạm)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { parseArgs } from './args';
import { BOT_NAMES } from './bots/index';
import { setDevChecks } from '@game/sim-core';
import { loadDefaultContent } from './content';
import { calibration, formatReport, summarize, toCsv, type RunResult } from './report';
import { runOne } from './runner';
import type { Job } from './worker';

/** Gửi một job cho worker và chờ kết quả; gỡ cả hai listener khi xong để không rò listener. */
function runJob(worker: Worker, job: Job): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (result: RunResult) => {
      worker.off('error', onError);
      resolve(result);
    };
    const onError = (error: Error) => {
      worker.off('message', onMessage);
      reject(error);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(job);
  });
}

async function runAll(jobs: readonly Job[], workers: number): Promise<RunResult[]> {
  if (workers <= 1) {
    setDevChecks(jobs.some((j) => j.devChecks));
    const content = loadDefaultContent();
    return jobs.map((j) => runOne(content, j.seed, j.bot, j.years, { checkInvariants: j.checkInvariants }));
  }
  const results: RunResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, async () => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url));
      try {
        while (next < jobs.length) {
          const job = jobs[next++];
          if (!job) break;
          results.push(await runJob(worker, job));
          if (process.stderr.isTTY) process.stderr.write(`\r${results.length}/${jobs.length} run`);
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  if (process.stderr.isTTY) process.stderr.write('\n');
  return results;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const jobs: Job[] = [];
  for (const bot of args.bots) {
    for (let i = 0; i < args.seeds; i++)
      jobs.push({
        seed: args.seedStart + i,
        bot,
        years: args.years,
        checkInvariants: args.checkInvariants,
        devChecks: args.smoke,
      });
  }
  const workers = args.workers ?? Math.max(1, Math.min(availableParallelism(), jobs.length));
  const started = performance.now();
  const unordered = await runAll(jobs, workers);
  const rank: Record<string, number> = Object.fromEntries(BOT_NAMES.map((b, i) => [b, i]));
  const order = (bot: string) => rank[bot] ?? BOT_NAMES.length;
  const results = [...unordered].sort((a, b) => order(a.bot) - order(b.bot) || a.seed - b.seed);

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, toCsv(results.flatMap((r) => r.rows)));
  }
  const content = loadDefaultContent();
  const balanced =
    content.scenario.companies.find((c) => c.kind === 'ai' && c.personality === 'balanced')?.id ?? '';
  console.log(formatReport(summarize(results), calibration(results, balanced), args.years));
  console.log(`Thời gian thực: ${((performance.now() - started) / 1000).toFixed(1)} s với ${workers} worker`);
  if (args.out) console.log(`CSV: ${args.out}`);

  const violations = results.flatMap((r) => r.violations);
  if (violations.length > 0) {
    console.error(`\n${violations.length} vi phạm bất biến:`);
    for (const v of violations.slice(0, 20)) console.error(`  ${v}`);
    return 1;
  }
  if (args.checkInvariants) console.log('Bất biến: không có vi phạm.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
