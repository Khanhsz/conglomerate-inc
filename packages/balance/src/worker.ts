/** Worker thread: nạp content một lần, chạy từng job (seed, bot) do luồng chính gửi tới. */
import { parentPort } from 'node:worker_threads';
import { setDevChecks } from '@game/sim-core';
import type { BotName } from './bots/index';
import { loadScenarioContent, type ScenarioName } from './content';
import { runOne } from './runner';

export interface Job {
  readonly scenario: ScenarioName;
  readonly seed: number;
  readonly bot: BotName;
  readonly years: number;
  readonly checkInvariants: boolean;
  /** Đóng băng sâu state sau mỗi tick để bắt ghi nhầm (ADR-0002); bật ở smoke. */
  readonly devChecks: boolean;
}

parentPort?.on('message', (job: Job) => {
  setDevChecks(job.devChecks);
  parentPort?.postMessage(
    runOne(loadScenarioContent(job.scenario), job.seed, job.bot, job.years, {
      checkInvariants: job.checkInvariants,
    }),
  );
});
