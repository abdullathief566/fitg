import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoForeignNumbers, containsBannedWords } from '@fitg/engine';
import { AnthropicProvider, buildContext, costUsd, PERSONA, systemTexts, variantOf } from '../src/mod.ts';
import { createProvider } from '../src/node.ts';
import { buildWeek, stateAt, at } from '../../engine/test/helpers/plan.ts';
import { ROOT } from '../../engine/test/helpers/lib.ts';

describe('buildContext (ai-orchestration.md §2)', () => {
  const week = buildWeek();
  const state = stateAt(week, at('2026-11-02', '10:00'));

  it('standard: first name only, targets included, allowedNumbers from a deep scan with 12-hour hours', () => {
    const c = buildContext({
      profile: week.profile,
      targets: week.targets,
      plan: week.plan,
      userState: state,
      pantry: week.state.pantry,
      purpose: 'coach_chat',
    });
    expect(c.variant).toBe('standard');
    const user = c.contextJson.user as Record<string, unknown>;
    expect(user.firstName).toBe('Abdul');
    expect(JSON.stringify(c.contextJson)).not.toMatch(/birthYear|1998|userId/);
    expect(c.contextJson.targets).toEqual({ kcal: 1850, proteinG: 120, carbsG: 220, fatG: 55 });
    expect(c.allowedNumbers).toEqual(expect.arrayContaining([1850, 120, 18, 30, 6]));
    expect(assertNoForeignNumbers('Gym at 6:30 tonight, 120 g protein.', c.allowedNumbers).ok).toBe(true);
    expect(assertNoForeignNumbers('Eat 1,500 calories.', c.allowedNumbers).ok).toBe(false);
  });

  it('habit_only (edHistory): no targets and no numbers allowed at all', () => {
    const profile = { ...week.profile, safetyFlags: { edHistory: true } };
    const c = buildContext({ profile, targets: week.targets, plan: week.plan, pantry: [], purpose: 'coach_chat' });
    expect(c.variant).toBe('habit_only');
    expect(c.contextJson.targets).toBeUndefined();
    expect(c.allowedNumbers).toEqual([]);
    expect(systemTexts('coach_chat', 'habit_only')).toContain(
      'This user is in habit-only mode. Never mention calories, macros, grams, body weight, or any number about food or the body. Talk about foods, household portions in words (a katori, two rotis), and habits.',
    );
  });

  it('no_deficit for pregnancy / diabetes / GLP-1', () => {
    expect(variantOf({ ...week.profile, safetyFlags: { glp1: true } })).toBe('no_deficit');
    expect(systemTexts('checkin_narrative', 'no_deficit').join('\n')).toContain('must not be in a calorie deficit');
  });

  it('memory is capped at 40 bullets', () => {
    const memory = Array.from({ length: 55 }, (_, i) => ({ kind: 'preference', key: `k${i}`, value: 'v' }));
    const c = buildContext({ profile: week.profile, targets: week.targets, memory, pantry: [], purpose: 'coach_chat' });
    expect(c.contextJson.memory).toHaveLength(40);
  });
});

describe('prompts', () => {
  it('the PERSONA banned list is identical to copy.md §8a (prompt files quote it on purpose)', () => {
    const copy = readFileSync(path.join(ROOT, 'docs/10-design/copy.md'), 'utf8');
    const docList = copy
      .split('\n')
      .find((l) => l.startsWith('cheat ·'))!
      .split(' · ')
      .map((s) => s.trim())
      .filter((s) => !s.startsWith('and the pattern'));
    const personaLine = PERSONA.split('\n').find((l) => l.startsWith('Never use these words or ideas:'))!;
    const personaList = personaLine
      .split('ideas:')[1]!
      .split('—')[0]!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('"lose'));
    expect(personaList).toEqual(docList);
    // The prompt quotes banned words on purpose — which is exactly why the check never runs on prompts.
    expect(containsBannedWords(PERSONA).length).toBeGreaterThan(0);
  });
  it('the persona opens every prose-writing call and the chat; context never goes in the frozen system text', () => {
    for (const t of ['ping_copy', 'rebalance_line', 'coach_chat', 'checkin_narrative'] as const)
      expect(systemTexts(t)[0]).toBe(PERSONA);
    expect(systemTexts('plan_week')).toHaveLength(1);
    expect(systemTexts('plan_week')[0]).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('prices and providers', () => {
  it('cost per call from the price table; batches are 50% off', () => {
    const usage = { inputTokens: 8000, outputTokens: 5500, cacheReadTokens: 5000, cacheWriteTokens: 0 };
    expect(costUsd('claude-opus-5-5', usage)).toBeCloseTo((8000 * 4 + 5500 * 20 + 5000 * 0.2) / 1e6, 6);
    expect(costUsd('claude-opus-5-5', usage, { batch: true })).toBeCloseTo(costUsd('claude-opus-5-5', usage) / 2, 6);
    expect(costUsd('mock', usage)).toBe(0);
  });
  it('AI_PROVIDER=mock by default; anthropic is a stub until Phase 5', async () => {
    const mock = createProvider({ env: {}, fixturesDir: path.join(ROOT, 'fixtures/ai') });
    expect(mock.constructor.name).toBe('MockProvider');
    const real = createProvider({ env: { AI_PROVIDER: 'anthropic' }, fixturesDir: '' });
    expect(real).toBeInstanceOf(AnthropicProvider);
    await expect(
      real.complete({
        type: 'thread_summary',
        tier: 'fast',
        effort: 'low',
        system: [],
        messages: [],
        maxTokens: 10,
        userId: null,
        allowedNumbers: [],
      }),
    ).rejects.toThrow(/Phase 5/);
    expect(process.env.AI_PROVIDER).toBe('mock');
  });
});
