// AI contract tests (testing.md §2, Phase 1): every fixture runs through the validation order (§4.0) and produces
// exactly its `expect`; no numeric value fields in any AI output or coach-tool schema except *Order / *Index;
// MockProvider selection by scenario (default = first valid fixture by file name).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AI_OUTPUT_SCHEMAS, CALL_TYPES, COACH_TOOL_INPUTS, type CallType } from '@fitg/contracts';
import { dayShape, weekDates, type DayShape, type LocalDate, type RebalanceDiff } from '@fitg/engine';
import {
  MockProvider,
  memoryFixtureSource,
  outcomeLabel,
  planWeekValidation,
  validateOutput,
  type Fixture,
  type NamedFixture,
} from '../src/mod.ts';
import { nodeFixtureSource } from '../src/node.ts';
import { loadLib, ROOT } from '../../engine/test/helpers/lib.ts';
import { T1_PROFILE, t1MealProfile, WEEK_START } from '../../engine/test/helpers/t1.ts';

const FIXTURES = path.join(ROOT, 'fixtures/ai');

function allFixtures(): Array<{ type: CallType; name: string; fixture: Fixture }> {
  const out: Array<{ type: CallType; name: string; fixture: Fixture }> = [];
  for (const type of readdirSync(FIXTURES).sort() as CallType[]) {
    for (const name of readdirSync(path.join(FIXTURES, type))
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      out.push({ type, name, fixture: JSON.parse(readFileSync(path.join(FIXTURES, type, name), 'utf8')) });
    }
  }
  return out;
}

/** T1's menus rebuilt from the seed with allowDrafts: true (ai-orchestration.md §8). */
function t1PlanWeekValidation() {
  const lib = loadLib();
  const gym = new Set(['2026-11-02', '2026-11-04', '2026-11-06']);
  const shapes: Record<LocalDate, DayShape> = {};
  for (const d of weekDates(WEEK_START)) {
    shapes[d] = dayShape({
      isGymDay: gym.has(d),
      mealTimes: T1_PROFILE.mealTimes,
      ...(gym.has(d) ? { gymEnd: '19:30' } : {}),
      weightKg: 75,
      eatingMode: 'cook',
    });
  }
  return planWeekValidation({
    recipes: lib.recipes,
    foods: lib.foods,
    exercises: lib.exercises,
    template: lib.templates.get('full_ab_machine')!,
    profile: t1MealProfile(),
    injuries: [],
    equipment: 'full',
    shapes,
  }).validation;
}

function validationFor(type: CallType, f: Fixture) {
  const input = f.input ?? {};
  const base = { allowedNumbers: f.allowedNumbers ?? [] };
  switch (type) {
    case 'plan_week':
      return { ...base, ...t1PlanWeekValidation() };
    case 'ping_copy':
      return { ...base, pings: input.pings as Array<{ id: string; title: string; body: string }> };
    case 'meal_swap':
      return { ...base, candidates: input.candidates as string[] };
    case 'rebalance_line':
      return { ...base, diff: input.diff as RebalanceDiff[] };
    default:
      return base;
  }
}

describe('fixtures → validation order (§4.0) → exactly their `expect`', () => {
  const fixtures = allFixtures();
  it('there are 36 starter fixtures, ≥ 3 per call type, and ≥ 1 bad one per prose-writing call', () => {
    expect(fixtures).toHaveLength(36);
    for (const type of CALL_TYPES) {
      const mine = fixtures.filter((f) => f.type === type);
      expect(mine.length, type).toBeGreaterThanOrEqual(3);
      expect(
        mine.some((f) => f.fixture.expect.startsWith('reject:')),
        type,
      ).toBe(true);
    }
  });
  for (const { type, name, fixture } of fixtures) {
    it(`${type}/${name} → ${fixture.expect}`, () => {
      const raw = type === 'coach_chat' ? fixture.response : fixture.output;
      const outcome = validateOutput(type, raw, validationFor(type, fixture));
      expect(outcomeLabel(outcome), outcome.detail).toBe(fixture.expect);
    });
  }
});

describe('schema walk: no numeric value fields in any AI output or coach-tool schema (§7 guardrail 1)', () => {
  function numericPaths(schema: unknown, at = ''): string[] {
    if (!schema || typeof schema !== 'object') return [];
    const s = schema as Record<string, unknown>;
    const out: string[] = [];
    const t = s.type;
    if (t === 'number' || t === 'integer' || (Array.isArray(t) && (t.includes('number') || t.includes('integer'))))
      out.push(at || '(root)');
    for (const [k, v] of Object.entries(s)) {
      if (k === 'properties' && v && typeof v === 'object') {
        for (const [prop, sub] of Object.entries(v as Record<string, unknown>))
          out.push(...numericPaths(sub, at ? `${at}.${prop}` : prop));
      } else if (k !== 'properties' && v && typeof v === 'object') {
        out.push(...numericPaths(v, at));
      }
    }
    return out;
  }
  const allowed = (p: string) => /(Order|Index)$/.test(p.split('.').pop() ?? '');

  for (const [name, schema] of [...Object.entries(AI_OUTPUT_SCHEMAS), ...Object.entries(COACH_TOOL_INPUTS)]) {
    it(name, () => {
      const json = z.toJSONSchema(schema as z.ZodType);
      const bad = numericPaths(json).filter((p) => !allowed(p));
      expect(bad).toEqual([]);
    });
  }
  it('the only number a coach tool may carry is exerciseOrder', () => {
    const json = z.toJSONSchema(COACH_TOOL_INPUTS.propose_plan_change);
    expect([...new Set(numericPaths(json))]).toEqual(['commands.exerciseOrder']);
  });
});

describe('MockProvider', () => {
  const source = nodeFixtureSource(FIXTURES);

  it('picks by scenario; with no scenario, the first fixture (by file name) whose expect is valid', async () => {
    const provider = new MockProvider(source);
    const call = {
      tier: 'fast' as const,
      effort: 'low' as const,
      system: [],
      messages: [],
      maxTokens: 4000,
      userId: null,
    };
    const byScenario = await provider.complete({
      ...call,
      type: 'menu_parse',
      allowedNumbers: [2],
      scenario: 'dhaba_menu',
    });
    expect(byScenario.ok).toBe(true);
    expect((byScenario.value as { options: unknown[] }).options).toHaveLength(4);
    const first = await provider.complete({ ...call, type: 'menu_parse', allowedNumbers: [] });
    expect(first.ok).toBe(true);
    expect((first.value as { options: Array<{ text: string }> }).options[0]!.text).toBe('Grilled chicken sandwich');
  });

  it('runs the same validators: a bad fixture comes back invalid with its reason; refusals are refused', async () => {
    const rows: unknown[] = [];
    const provider = new MockProvider(source, (r) => void rows.push(r));
    const call = {
      tier: 'fast' as const,
      effort: 'low' as const,
      system: [],
      messages: [],
      maxTokens: 4000,
      userId: 'u1',
    };
    const bad = await provider.complete({
      ...call,
      type: 'checkin_narrative',
      allowedNumbers: [3, 5, 2.5, 78.4, 78.9],
      scenario: 'lazy',
    });
    expect(bad).toMatchObject({ ok: false, status: 'invalid', reason: 'banned_word', costUsd: 0, model: 'mock' });
    const refused = await provider.complete({
      ...call,
      tier: 'strong',
      type: 'coach_chat',
      allowedNumbers: [],
      scenario: 'refused',
    });
    expect(refused).toMatchObject({ ok: false, status: 'refused', refusalCategory: 'general_harms' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider: 'mock', costUsd: 0, callType: 'checkin_narrative', status: 'invalid' });
  });

  it('works from an in-memory fixture source (the app bundles fixtures as JSON imports)', async () => {
    const named: NamedFixture[] = [
      { name: 'b.json', fixture: { scenario: 'b', expect: 'valid', output: { line: 'Dinner is a bit lighter.' } } },
      { name: 'a.json', fixture: { scenario: 'a', expect: 'reject:too_long', output: { line: 'x'.repeat(200) } } },
    ];
    const provider = new MockProvider(memoryFixtureSource({ rebalance_line: named }));
    const r = await provider.complete({
      type: 'rebalance_line',
      tier: 'fast',
      effort: 'low',
      system: [],
      messages: [],
      maxTokens: 4000,
      userId: null,
      allowedNumbers: [],
    });
    expect(r.value).toEqual({ line: 'Dinner is a bit lighter.' });
  });

  it('no fixture → error, never a throw', async () => {
    const provider = new MockProvider(memoryFixtureSource({}));
    const r = await provider.complete({
      type: 'thread_summary',
      tier: 'fast',
      effort: 'low',
      system: [],
      messages: [],
      maxTokens: 4000,
      userId: null,
      allowedNumbers: [],
    });
    expect(r).toMatchObject({ ok: false, status: 'error' });
  });
});
