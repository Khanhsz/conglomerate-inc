/** Content của game (coffee + scenario), nạp từ YAML gốc qua `?raw` của Vite. */
import { loadContent } from '@game/content';
import type { LoadedContent } from '@game/sim-core';
import industryYaml from '../../../../packages/content/industries/coffee.yaml?raw';
import atlasYaml from '../../../../packages/content/scenarios/atlas.yaml?raw';
import m1Yaml from '../../../../packages/content/scenarios/m1-default.yaml?raw';
import { DEFAULT_SCENARIO, type ScenarioId } from './scenarios';

const YAML: Readonly<Record<ScenarioId, string>> = { 'm1-default': m1Yaml, atlas: atlasYaml };
const loaded = new Map<ScenarioId, LoadedContent>();

/** Content của một scenario; nạp và validate một lần cho mỗi scenario. */
export function loadGameContent(scenario: ScenarioId = DEFAULT_SCENARIO): LoadedContent {
  let content = loaded.get(scenario);
  if (!content) {
    content = loadContent(industryYaml, YAML[scenario]);
    loaded.set(scenario, content);
  }
  return content;
}
