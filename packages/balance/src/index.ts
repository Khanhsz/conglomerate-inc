// Bước 06: bots, runner, report.
export const NOT_IMPLEMENTED_MESSAGE = 'not implemented';

export function describeRun(args: readonly string[]): string {
  const mode = args.includes('--smoke') ? 'balance:smoke' : 'balance';
  return `${mode}: ${NOT_IMPLEMENTED_MESSAGE}`;
}
