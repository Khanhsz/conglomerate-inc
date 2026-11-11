/** Worker thread: nạp content một lần, chạy từng job (seed, bot) do luồng chính gửi tới. */
import { parentPort } from 'node:worker_threads';
import type { BotName } from './bots/index';
import { loadDefaultContent } from './content';
import { runOne } from './runner';

export interface Job {
  readonly seed: number;
  readonly bot: BotName;
  readonly years: number;
  readonly checkInvariants: boolean;
}

const content = loadDefaultContent();
parentPort?.on('message', (job: Job) => {
  parentPort?.postMessage(
    runOne(content, job.seed, job.bot, job.years, { checkInvariants: job.checkInvariants }),
  );
});
