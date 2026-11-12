export const DEFAULT_INDUSTRY_ID = 'coffee';
export const DEFAULT_SCENARIO_ID = 'm1-default';

export { deepFreeze } from './freeze';
export {
  ContentValidationError,
  formatPath,
  loadContent,
  type ContentIssue,
  type ContentSource,
} from './load';
export { industrySchema, scenarioSchema } from './schema';
