import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: repoRoot });

async function ruleIds(code: string, relPath: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: path.join(repoRoot, relPath) });
  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'fatal'));
}

const simFile = 'packages/sim-core/src/__lint_probe__.ts';

describe('lint: determinism rules in sim-core', () => {
  it.each([
    ['Math.random', 'export const x = Math.random();', 'no-restricted-properties'],
    ['Date.now', 'export const x = Date.now();', 'no-restricted-properties'],
    ['performance.now', 'export const x = performance.now();', 'no-restricted-properties'],
    ['new Date()', 'export const x = new Date();', 'no-restricted-syntax'],
    ['Date()', 'export const x = Date();', 'no-restricted-syntax'],
    ['crypto', 'export const x = crypto.getRandomValues(new Uint8Array(1));', 'no-restricted-globals'],
  ])('rejects %s in sim-core', async (_name, code, rule) => {
    expect(await ruleIds(code, simFile)).toContain(rule);
  });

  it('accepts clean code in sim-core', async () => {
    expect(await ruleIds('export const x = Math.floor(1.5);', simFile)).toEqual([]);
  });

  it('rejects type assertions everywhere except the Money brand and validated I/O (#53)', async () => {
    const code = 'export const x = JSON.parse("1") as number;';
    const rule = '@typescript-eslint/consistent-type-assertions';
    expect(await ruleIds(code, simFile)).toContain(rule);
    expect(await ruleIds(code, 'apps/web/src/__lint_probe__.ts')).toContain(rule);
    expect(await ruleIds('export const x = [1, 2] as const;', simFile)).toEqual([]);
  });

  it('does not apply the rules outside sim-core', async () => {
    const ids = await ruleIds('export const x = Math.random();', 'packages/balance/src/__lint_probe__.ts');
    expect(ids).toEqual([]);
  });
});
