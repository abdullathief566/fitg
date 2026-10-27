import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BodyGoalPatchSchema,
  CoachCommandSchema,
  CoachPrefsPatchSchema,
  PLAN_COMMAND_KINDS,
  PlanCommandSchema,
  ProfilePrefsPatchSchema,
  StoredPlanCommandSchema,
  weekdayOfDayName,
} from '../src/mod.ts';
import { readJson } from './helpers.ts';

const base = { id: 'cmd-1', basePlanVersion: 1 };

const VALID: Record<(typeof PLAN_COMMAND_KINDS)[number], Record<string, unknown>> = {
  SwapMeal: { kind: 'SwapMeal', itemId: 'meal-1', recipeSlug: 'dal-rice-meal' },
  SetMealStatus: { kind: 'SetMealStatus', itemId: 'meal-1', status: 'replaced', logId: 'log-1' },
  SetHomeMeal: { kind: 'SetHomeMeal', itemId: 'meal-1', homeDishKeys: ['dal_tadka', 'roti'] },
  SetEatOutPick: { kind: 'SetEatOutPick', itemId: 'meal-1', logId: 'log-1' },
  SwapExercise: { kind: 'SwapExercise', sessionId: 'sess-1', exerciseOrder: 0, exerciseId: 'leg_press_machine' },
  MoveSession: { kind: 'MoveSession', sessionId: 'sess-1', toDate: '2026-11-05' },
  SetSessionTime: { kind: 'SetSessionTime', sessionId: 'sess-1', start: '18:45' },
  SkipSession: { kind: 'SkipSession', sessionId: 'sess-1' },
  LaterSession: { kind: 'LaterSession', sessionId: 'sess-1', minutes: '30' },
  SetSessionFeedback: { kind: 'SetSessionFeedback', sessionId: 'sess-1', feedback: 'too_easy' },
  TickGrocery: { kind: 'TickGrocery', weekStart: '2026-11-02', foodKey: 'egg_whole', checked: true },
  UpdatePrefs: {
    kind: 'UpdatePrefs',
    patch: {
      gymSchedule: [{ weekday: 1, start: '07:00', durationMin: 45 }],
      cookTimePref: 10,
      budgetTier: 3,
      notificationPrefs: { nightBefore: '21:00' },
    },
  },
};

function ok(cmd: Record<string, unknown>): boolean {
  return PlanCommandSchema.safeParse({ ...base, ...cmd }).success;
}

describe('PlanCommandSchema', () => {
  it('accepts every one of the 12 kinds', () => {
    expect(Object.keys(VALID).sort()).toEqual([...PLAN_COMMAND_KINDS].sort());
    expect(PLAN_COMMAND_KINDS).toHaveLength(12);
    for (const cmd of Object.values(VALID)) expect(ok(cmd), String(cmd.kind)).toBe(true);
  });

  it('needs a non-empty id and basePlanVersion ≥ 1', () => {
    expect(PlanCommandSchema.safeParse({ ...VALID.SkipSession, id: '', basePlanVersion: 1 }).success).toBe(false);
    expect(PlanCommandSchema.safeParse({ ...VALID.SkipSession, id: 'x', basePlanVersion: 0 }).success).toBe(false);
    expect(PlanCommandSchema.safeParse({ ...VALID.SkipSession, id: 'x', basePlanVersion: 1.5 }).success).toBe(false);
    expect(PlanCommandSchema.safeParse(VALID.SkipSession).success).toBe(false);
  });

  it('rejects unknown kinds and unknown keys', () => {
    expect(ok({ kind: 'DeleteEverything' })).toBe(false);
    expect(ok({ ...VALID.SkipSession, extra: true })).toBe(false);
  });

  it('validates value ranges', () => {
    expect(ok({ ...VALID.SetSessionTime, start: '24:00' })).toBe(false);
    expect(ok({ ...VALID.SetSessionTime, start: '18:40' })).toBe(false); // 15-minute slots
    expect(ok({ ...VALID.SetSessionTime, start: '6:30' })).toBe(false);
    expect(ok({ ...VALID.MoveSession, toDate: '2026-13-01' })).toBe(false);
    expect(ok({ ...VALID.MoveSession, toDate: '2026-02-30' })).toBe(false);
    expect(ok({ ...VALID.LaterSession, minutes: '45' })).toBe(false);
    expect(ok({ ...VALID.LaterSession, minutes: 30 })).toBe(false);
    expect(ok({ ...VALID.SwapExercise, exerciseOrder: -1 })).toBe(false);
    expect(ok({ ...VALID.SwapExercise, exerciseOrder: 1.5 })).toBe(false);
    expect(ok({ ...VALID.SetMealStatus, status: 'planned' })).toBe(false);
    expect(ok({ ...VALID.SwapMeal, recipeSlug: 'Dal Rice' })).toBe(false);
    expect(ok({ ...VALID.SetHomeMeal, homeDishKeys: [] })).toBe(false);
    expect(ok({ ...VALID.SetHomeMeal, homeDishKeys: ['roti', 'roti'] })).toBe(false);
    expect(ok({ ...VALID.TickGrocery, weekStart: '2026-11-03' })).toBe(false); // not a Monday
    expect(ok({ ...VALID.TickGrocery, weekStart: 'next monday' })).toBe(false); // malformed: rejected, never thrown
    expect(ok({ ...VALID.TickGrocery, weekStart: '2026-02-30' })).toBe(false);
    const patch = (p: Record<string, unknown>) => ok({ kind: 'UpdatePrefs', patch: p });
    expect(patch({ gymSchedule: [{ weekday: 7, start: '18:30', durationMin: 60 }] })).toBe(false);
    expect(patch({ gymSchedule: [{ weekday: 1, start: '18:30', durationMin: 50 }] })).toBe(false);
    expect(
      patch({
        gymSchedule: [
          { weekday: 1, start: '18:30', durationMin: 60 },
          { weekday: 1, start: '07:00', durationMin: 45 },
        ],
      }),
    ).toBe(false);
    expect(patch({ availableDays: [0, 0] })).toBe(false);
    expect(patch({ cookTimePref: 15 })).toBe(false);
    expect(patch({ budgetTier: 4 })).toBe(false);
    expect(patch({ mealTimes: { breakfast: '08:00', lunch: '13:00' } })).toBe(false);
    expect(patch({ units: 'stone' })).toBe(false);
    expect(patch({ weightKg: 80 })).toBe(false); // body numbers never travel in commands
  });

  it('StoredPlanCommandSchema (plan-command, sync-push) needs a uuid id', () => {
    expect(StoredPlanCommandSchema.safeParse({ ...base, ...VALID.SkipSession }).success).toBe(false);
    expect(
      StoredPlanCommandSchema.safeParse({
        ...VALID.SkipSession,
        id: '9b2f1c3e-6a7d-4e8f-9a0b-1c2d3e4f5a6b',
        basePlanVersion: 2,
      }).success,
    ).toBe(true);
  });
});

describe('patches', () => {
  it('ProfilePrefsPatch accepts a partial notificationPrefs and an empty patch', () => {
    expect(ProfilePrefsPatchSchema.safeParse({}).success).toBe(true);
    expect(ProfilePrefsPatchSchema.safeParse({ notificationPrefs: { haptics: false } }).success).toBe(true);
  });

  it('BodyGoalPatch validates ranges and allows clearing the goal weight', () => {
    expect(BodyGoalPatchSchema.safeParse({ weightKg: 74.5, goalWeightKg: null }).success).toBe(true);
    expect(BodyGoalPatchSchema.safeParse({ heightCm: 300 }).success).toBe(false);
    expect(BodyGoalPatchSchema.safeParse({ injuries: ['knee', 'elbow'] }).success).toBe(false);
  });
});

describe('CoachCommandSchema', () => {
  it('accepts the commands in the valid coach fixture', () => {
    const fixture = readJson('fixtures/ai/coach_chat/tool_propose.json') as {
      response: { content: Array<{ type: string; input?: { commands: unknown[] } }> };
    };
    const tool = fixture.response.content.find((b) => b.type === 'tool_use');
    expect(tool?.input?.commands.length).toBeGreaterThan(0);
    for (const c of tool?.input?.commands ?? []) expect(CoachCommandSchema.safeParse(c).success).toBe(true);
  });

  it('rejects the numeric "minutes" in the bad coach fixture', () => {
    const fixture = readJson('fixtures/ai/coach_chat/bad_tool_numeric.json') as {
      response: { content: Array<{ type: string; input?: { commands: unknown[] } }> };
    };
    const tool = fixture.response.content.find((b) => b.type === 'tool_use');
    const results = (tool?.input?.commands ?? []).map((c) => CoachCommandSchema.safeParse(c).success);
    expect(results).toContain(false);
  });

  it('carries no ids or plan versions, and only string enums', () => {
    expect(CoachCommandSchema.safeParse({ kind: 'SkipSession', sessionId: 's1', id: 'x' }).success).toBe(false);
    expect(CoachCommandSchema.safeParse({ kind: 'SkipSession', sessionId: 's1', basePlanVersion: 1 }).success).toBe(
      false,
    );
    expect(CoachCommandSchema.safeParse({ kind: 'SetMealStatus', itemId: 'm1', status: 'eaten' }).success).toBe(false);
    expect(CoachPrefsPatchSchema.safeParse({ cookTimePref: 20 }).success).toBe(false);
    expect(CoachPrefsPatchSchema.safeParse({ cookTimePref: '20', sessionLength: '75' }).success).toBe(true);
    expect(CoachPrefsPatchSchema.safeParse({ gymDays: [0, 2, 4] }).success).toBe(false);
    expect(CoachPrefsPatchSchema.safeParse({ gymDays: ['mon', 'wed', 'fri'] }).success).toBe(true);
    expect(CoachPrefsPatchSchema.safeParse({ gymDays: ['mon', 'mon'] }).success).toBe(false);
  });

  it('z.toJSONSchema: the only number anywhere is SwapExercise.exerciseOrder', () => {
    const numeric: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${path}[${i}]`));
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const type = obj.type;
      const types = Array.isArray(type) ? type : [type];
      if (types.includes('number') || types.includes('integer')) numeric.push(path);
      for (const [k, v] of Object.entries(obj)) walk(v, `${path}/${k}`);
    };
    walk(z.toJSONSchema(CoachCommandSchema), '#');
    expect(numeric).toHaveLength(1);
    expect(numeric[0]).toMatch(/\/properties\/exerciseOrder$/);
  });

  it('weekdayOfDayName maps mon → 0 … sun → 6', () => {
    expect(weekdayOfDayName('mon')).toBe(0);
    expect(weekdayOfDayName('sun')).toBe(6);
  });
});
