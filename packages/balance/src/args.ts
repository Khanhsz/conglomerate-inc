/** Tham số dòng lệnh của balance runner (spec §6). */
import { BOT_NAMES, type BotName } from './bots/index';

export interface Args {
  readonly seeds: number;
  readonly seedStart: number;
  readonly years: number;
  readonly bots: readonly BotName[];
  readonly out: string | null;
  readonly smoke: boolean;
  readonly checkInvariants: boolean;
  readonly workers: number | null;
}

const isBot = (s: string): s is BotName => BOT_NAMES.some((b) => b === s);

function positiveInt(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error(`${flag} cần một số nguyên dương, nhận "${String(value)}"`);
  return n;
}

export function parseArgs(argv: readonly string[]): Args {
  let seeds = 10;
  let seedStart = 1;
  let years = 3;
  let bots: BotName[] = [...BOT_NAMES];
  let out: string | null = null;
  let smoke = false;
  let checkInvariants = false;
  let workers: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    switch (flag) {
      case '--':
        break;
      case '--seeds':
        seeds = positiveInt(flag, next());
        break;
      case '--seed-start':
        seedStart = positiveInt(flag, next());
        break;
      case '--years':
        years = positiveInt(flag, next());
        break;
      case '--workers':
        workers = positiveInt(flag, next());
        break;
      case '--out':
        out = next() ?? null;
        break;
      case '--check-invariants':
        checkInvariants = true;
        break;
      case '--smoke':
        smoke = true;
        break;
      case '--bots': {
        const value = next() ?? '';
        if (value === 'all') {
          bots = [...BOT_NAMES];
          break;
        }
        bots = [];
        for (const name of value.split(',')) {
          if (!isBot(name))
            throw new Error(`bot không tồn tại: "${name}" (có: ${BOT_NAMES.join(', ')}, all)`);
          bots.push(name);
        }
        break;
      }
      default:
        throw new Error(`tham số không hợp lệ: ${String(flag)}`);
    }
  }
  if (smoke)
    return {
      seeds: 10,
      seedStart,
      years: 2,
      bots: [...BOT_NAMES],
      out,
      smoke,
      checkInvariants: true,
      workers,
    };
  return { seeds, seedStart, years, bots, out, smoke, checkInvariants, workers };
}
