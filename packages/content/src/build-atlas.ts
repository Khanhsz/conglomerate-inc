/** Ghi `scenarios/atlas.yaml` từ bộ sinh (`pnpm content:atlas`). */
import { writeFileSync } from 'node:fs';
import { buildAtlasYaml } from './atlas';

const target = new URL('../scenarios/atlas.yaml', import.meta.url);
writeFileSync(target, buildAtlasYaml());
console.log(`wrote ${target.pathname}`);
