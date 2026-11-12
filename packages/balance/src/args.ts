/** Tham số dòng lệnh của balance runner (spec §6). */
import { BOT_NAMES, type BotName } from './bots/index';
import { SCENARIO_NAMES, type ScenarioName } from './content';

export interface Args {
  readonly seeds: number;
  readonly seedStart: number;
  readonly years: number;
  readonly bots: readonly BotName[];
  readonly out: string | null;
  readonly smoke: boolean;
  readonly checkInvariants: boolean;
  readonly workers: number | null;
  readonly scenario: ScenarioName;
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
  let scenario: ScenarioName = 'm1-default';
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
      case '--scenario': {
        const value = next();
        const found = SCENARIO_NAMES.find((s) => s === value);
        if (!found)
          throw new Error(`scenario không tồn tại: "${String(value)}" (có: ${SCENARIO_NAMES.join(', ')})`);
        scenario = found;
        break;
      }
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
      // Atlas nặng hơn nhiều (225 địa điểm, ~20 công ty): smoke chạy ít seed hơn.
      seeds: scenario === 'atlas' ? 2 : 10,
      seedStart,
      years: 2,
      bots: [...BOT_NAMES],
      out,
      smoke,
      checkInvariants: true,
      workers,
      scenario,
    };
  return { seeds, seedStart, years, bots, out, smoke, checkInvariants, workers, scenario };
}
