import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { ContentValidationError, loadContent, type ContentIssue } from './load';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const industryYaml = read('../industries/coffee.yaml');
const scenarioYaml = read('../scenarios/m1-default.yaml');

/** Sửa một bản sao YAML qua object JS rồi stringify lại. */
function edit(yamlText: string, mutate: (doc: Record<string, unknown>) => void): string {
  const doc: Record<string, unknown> = parse(yamlText);
  mutate(doc);
  return stringify(doc);
}

/** Đi theo đường dẫn trong object YAML đã parse (chỉ dùng trong test). */
function at(doc: unknown, ...path: (string | number)[]): Record<string, unknown> {
  let cur: unknown = doc;
  for (const key of path) {
    if (!isRecord(cur)) throw new Error(`no object before ${String(key)} in ${path.join('.')}`);
    cur = Reflect.get(cur, key);
  }
  if (!isRecord(cur)) throw new Error(`no object at ${path.join('.')}`);
  return cur;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function issuesOf(industry: string, scenario: string): readonly ContentIssue[] {
  try {
    loadContent(industry, scenario);
  } catch (e) {
    if (e instanceof ContentValidationError) return e.issues;
    throw e;
  }
  throw new Error('expected loadContent to throw ContentValidationError');
}

describe('loadContent — default content', () => {
  const content = loadContent(industryYaml, scenarioYaml);

  it('parses coffee.yaml and m1-default.yaml', () => {
    expect(content.industry.id).toBe('coffee');
    expect(content.industry.referencePrice).toBe(350);
    expect(Object.keys(content.industry.segments).sort()).toEqual(['office', 'other', 'premium', 'students']);
    expect(content.industry.aiPersonalities.balanced.qualityTier).toBe('standard');
    expect(content.scenario.id).toBe('m1-default');
    expect(content.scenario.city.districts).toHaveLength(9);
    expect(content.scenario.companies.map((c) => c.id)).toEqual(['player', 'ai-bean', 'ai-daily', 'ai-aura']);
  });

  it('every district mix sums to 1 (±1e-9)', () => {
    for (const d of content.scenario.city.districts) {
      const total = Object.values(d.mix).reduce((a, b) => a + b, 0);
      expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('player has no personality; AI companies have one', () => {
    const [player, ...ai] = content.scenario.companies;
    expect(player?.kind).toBe('player');
    expect(player && 'personality' in player).toBe(false);
    for (const c of ai) expect(c.kind === 'ai' && c.personality).toBeTruthy();
  });

  it('is deep-frozen', () => {
    expect(Object.isFrozen(content)).toBe(true);
    expect(Object.isFrozen(content.industry.segments['office']?.betas)).toBe(true);
    expect(Object.isFrozen(content.scenario.city.districts[0]?.mix)).toBe(true);
    // Reflect.set trả false (không ném) khi object bị đóng băng.
    expect(Reflect.set(content.industry, 'unitCost', 1)).toBe(false);
    expect(Reflect.set(content.scenario.city.districts, 0, null)).toBe(false);
    expect(content.industry.unitCost).toBe(90);
  });

  it('has a stable contentVersion that changes with the content', () => {
    expect(content.contentVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(loadContent(industryYaml, scenarioYaml).contentVersion).toBe(content.contentVersion);
    const cheaper = edit(industryYaml, (d) => {
      d['unitCost'] = 91;
    });
    expect(loadContent(cheaper, scenarioYaml).contentVersion).not.toBe(content.contentVersion);
  });

  it('contentVersion ignores YAML formatting and comments', () => {
    const reformatted = stringify(parse(industryYaml));
    expect(loadContent(reformatted, scenarioYaml).contentVersion).toBe(content.contentVersion);
  });
});

describe('loadContent — validation errors point to the field', () => {
  const expectIssue = (
    issues: readonly ContentIssue[],
    source: ContentIssue['source'],
    path: string,
    text?: RegExp,
  ) => {
    const hit = issues.find((i) => i.source === source && i.path === path);
    expect(hit, `no issue at ${source}:${path}; got ${JSON.stringify(issues)}`).toBeDefined();
    if (text) expect(hit?.message).toMatch(text);
  };

  it('missing required field', () => {
    const bad = edit(industryYaml, (d) => {
      delete d['unitCost'];
    });
    expectIssue(issuesOf(bad, scenarioYaml), 'industry', 'unitCost');
  });

  it('missing nested field', () => {
    const bad = edit(industryYaml, (d) => {
      delete at(d, 'segments', 'office', 'betas')['p'];
    });
    expectIssue(issuesOf(bad, scenarioYaml), 'industry', 'segments.office.betas.p');
  });

  it('unknown key (typo) is rejected', () => {
    const bad = edit(industryYaml, (d) => {
      d['refrencePrice'] = 350;
    });
    expectIssue(issuesOf(bad, scenarioYaml), 'industry', '', /refrencePrice/);
  });

  it('money fields must be integer cents', () => {
    const bad = edit(industryYaml, (d) => {
      d['referencePrice'] = 3.5;
    });
    expectIssue(issuesOf(bad, scenarioYaml), 'industry', 'referencePrice');
  });

  it('district mix must sum to 1', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'city', 'districts', 4, 'mix')['office'] = 0.6;
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'city.districts[4].mix', /0\.95/);
  });

  it('district coordinates must lie inside the grid', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'city', 'districts', 0)['x'] = 3;
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'city.districts[0].x');
  });

  it('district coordinates must be unique', () => {
    const bad = edit(scenarioYaml, (d) => {
      const d1 = at(d, 'city', 'districts', 1);
      d1['x'] = 0;
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'city.districts[1]', /\(0, 0\)/);
  });

  it('district ids must be unique', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'city', 'districts', 1)['id'] = 'nw';
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'city.districts[1].id', /nw/);
  });

  it('company ids must be unique', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'companies', 2)['id'] = 'ai-bean';
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'companies[2].id', /ai-bean/);
  });

  it('exactly one player company', () => {
    const bad = edit(scenarioYaml, (d) => {
      const c = at(d, 'companies', 1);
      c['kind'] = 'player';
      delete c['personality'];
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'companies');
  });

  it('AI company needs a personality', () => {
    const bad = edit(scenarioYaml, (d) => {
      delete at(d, 'companies', 1)['personality'];
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'companies[1].personality');
  });

  it('loan spread tiers must be strictly increasing', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'finance', 'loanSpreads', 1)['maxLeverage'] = 1;
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'finance.loanSpreads[1].maxLeverage');
  });

  it('every segment in a mix must exist in the industry', () => {
    const bad = edit(scenarioYaml, (d) => {
      const mix = at(d, 'city', 'districts', 0, 'mix');
      mix['tourists'] = mix['other'];
      delete mix['other'];
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'city.districts[0].mix.tourists', /tourists/);
  });

  it('initial stores must reference existing districts', () => {
    const bad = edit(scenarioYaml, (d) => {
      at(d, 'companies', 1, 'initialStores')[0] = 'downtown';
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'companies[1].initialStores[0]', /downtown/);
  });

  it('scenario.industry must match industry.id', () => {
    const bad = edit(scenarioYaml, (d) => {
      d['industry'] = 'tea';
    });
    expectIssue(issuesOf(industryYaml, bad), 'scenario', 'industry', /tea/);
  });

  it('YAML syntax errors are reported with the document name', () => {
    expectIssue(issuesOf(industryYaml, 'city: [unclosed'), 'scenario', '', /YAML/);
  });

  it('reports several problems at once and lists them in the message', () => {
    const badIndustry = edit(industryYaml, (d) => {
      delete d['unitCost'];
    });
    const badScenario = edit(scenarioYaml, (d) => {
      at(d, 'city', 'districts', 0)['y'] = -1;
    });
    let message = '';
    try {
      loadContent(badIndustry, badScenario);
    } catch (e) {
      if (!(e instanceof ContentValidationError)) throw e;
      expect(e.issues.length).toBeGreaterThanOrEqual(2);
      message = e.message;
    }
    expect(message).toContain('industry: unitCost');
    expect(message).toContain('scenario: city.districts[0].y');
  });
});
