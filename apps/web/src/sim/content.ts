/** Content mặc định (coffee + m1-default), nạp từ YAML gốc qua `?raw` của Vite. */
import { loadContent } from '@game/content';
import type { LoadedContent } from '@game/sim-core';
import industryYaml from '../../../../packages/content/industries/coffee.yaml?raw';
import scenarioYaml from '../../../../packages/content/scenarios/m1-default.yaml?raw';

export function loadGameContent(): LoadedContent {
  return loadContent(industryYaml, scenarioYaml);
}
