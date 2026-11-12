/** Danh sách scenario của bản web (không nhập YAML, dùng được ở mọi phía). */

/** `m1-default`: một thành phố 3×3 (hồi quy, hiệu chỉnh §14). `atlas`: 7 thành phố (M1.8). */
export const SCENARIO_IDS = ['m1-default', 'atlas'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
export const DEFAULT_SCENARIO: ScenarioId = 'm1-default';

export const SCENARIO_LABEL: Readonly<Record<ScenarioId, string>> = {
  'm1-default': 'Riverton 3×3 (một thành phố)',
  atlas: 'Bảy thành phố',
};

export function parseScenarioId(value: string | null | undefined): ScenarioId | null {
  return SCENARIO_IDS.find((id) => id === value) ?? null;
}
