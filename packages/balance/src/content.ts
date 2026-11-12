/** Nạp content mặc định (coffee + m1-default) từ đĩa. Chỉ dùng ở Node (balance CLI, test tích hợp). */
import { readFileSync } from 'node:fs';
import { loadContent } from '@game/content';
import type { LoadedContent } from '@game/sim-core';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

export const INDUSTRY_PATH = '../../content/industries/coffee.yaml';
export const SCENARIO_PATH = '../../content/scenarios/m1-default.yaml';

/** Nội dung YAML mặc định (để test có thể sửa trước khi nạp). */
export function readDefaultYaml(): { industry: string; scenario: string } {
  return { industry: read(INDUSTRY_PATH), scenario: read(SCENARIO_PATH) };
}

/** Scenario mà balance runner chạy được: `m1-default` (hiệu chỉnh §14) và `atlas` (M1.8). */
export const SCENARIO_NAMES = ['m1-default', 'atlas'] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

const loaded = new Map<ScenarioName, LoadedContent>();

export function loadScenarioContent(scenario: ScenarioName): LoadedContent {
  let content = loaded.get(scenario);
  if (!content) {
    content = loadContent(read(INDUSTRY_PATH), read(`../../content/scenarios/${scenario}.yaml`));
    loaded.set(scenario, content);
  }
  return content;
}

export function loadDefaultContent(): LoadedContent {
  const { industry, scenario } = readDefaultYaml();
  return loadContent(industry, scenario);
}
