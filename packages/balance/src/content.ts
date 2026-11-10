/** Nạp content mặc định (coffee + m1-default) từ đĩa. Chỉ dùng ở Node (balance CLI, test tích hợp). */
import { readFileSync } from 'node:fs';
import { loadContent } from '@game/content';
import type { LoadedContent } from '@game/sim-core';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

export function loadDefaultContent(): LoadedContent {
  return loadContent(
    read('../../content/industries/coffee.yaml'),
    read('../../content/scenarios/m1-default.yaml'),
  );
}
