/**
 * Nạp content: YAML → Zod → kiểm tra chéo → deep-freeze (ADR-0001 #8).
 * Nhận chuỗi YAML, không đọc file, để dùng được cả ở Node (balance, test) lẫn trình duyệt.
 */
import { hashValue, type IndustryContent, type LoadedContent, type ScenarioContent } from '@game/sim-core';
import { parseDocument } from 'yaml';
import type { z } from 'zod';
import { deepFreeze } from './freeze';
import { industrySchema, scenarioSchema } from './schema';

export type ContentSource = 'industry' | 'scenario';

export interface ContentIssue {
  readonly source: ContentSource;
  /** Đường dẫn trường trong tài liệu, ví dụ `city.districts[4].mix`; '' là gốc tài liệu. */
  readonly path: string;
  readonly message: string;
}

export class ContentValidationError extends Error {
  override name = 'ContentValidationError';
  constructor(readonly issues: readonly ContentIssue[]) {
    super(
      `Invalid content (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `- ${i.source}: ${i.path || '(root)'}: ${i.message}`).join('\n'),
    );
  }
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else {
      const k = String(key);
      out += IDENTIFIER.test(k) ? (out ? `.${k}` : k) : `[${JSON.stringify(k)}]`;
    }
  }
  return out;
}

function parseYaml(text: string, source: ContentSource, issues: ContentIssue[]): unknown {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    for (const err of doc.errors) {
      issues.push({ source, path: '', message: `YAML: ${err.message.split('\n')[0] ?? err.code}` });
    }
    return undefined;
  }
  return doc.toJS();
}

function validate<S extends z.ZodType>(
  schema: S,
  data: unknown,
  source: ContentSource,
  issues: ContentIssue[],
): z.output<S> | undefined {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    issues.push({ source, path: formatPath(issue.path), message: issue.message });
  }
  return undefined;
}

/** Ràng buộc giữa hai tài liệu. */
function crossCheck(industry: IndustryContent, scenario: ScenarioContent, issues: ContentIssue[]): void {
  if (scenario.industry !== industry.id) {
    issues.push({
      source: 'scenario',
      path: 'industry',
      message: `scenario dành cho ngành "${scenario.industry}" nhưng industry pack là "${industry.id}"`,
    });
  }
  scenario.city.districts.forEach((d, i) => {
    for (const segment of Object.keys(d.mix).sort()) {
      if (!Object.hasOwn(industry.segments, segment)) {
        issues.push({
          source: 'scenario',
          path: formatPath(['city', 'districts', i, 'mix', segment]),
          message: `phân khúc "${segment}" không có trong industry.segments`,
        });
      }
    }
  });
}

export function loadContent(industryYaml: string, scenarioYaml: string): LoadedContent {
  const issues: ContentIssue[] = [];
  const industryRaw = parseYaml(industryYaml, 'industry', issues);
  const scenarioRaw = parseYaml(scenarioYaml, 'scenario', issues);

  // Gán vào kiểu của sim-core: lỗi biên dịch ở đây nghĩa là schema lệch khỏi types/content.ts.
  const industry: IndustryContent | undefined =
    industryRaw === undefined ? undefined : validate(industrySchema, industryRaw, 'industry', issues);
  const scenario: ScenarioContent | undefined =
    scenarioRaw === undefined ? undefined : validate(scenarioSchema, scenarioRaw, 'scenario', issues);

  if (industry && scenario) crossCheck(industry, scenario, issues);
  if (issues.length > 0 || !industry || !scenario) throw new ContentValidationError(issues);

  return deepFreeze({ industry, scenario, contentVersion: hashValue({ industry, scenario }) });
}
