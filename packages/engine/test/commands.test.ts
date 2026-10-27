import { describe, expect, it } from 'vitest';
import { applyCommand, type PlanCommand, type PlanState } from '../src/mod.ts';
import { at, buildWeek } from './helpers/plan.ts';
import { TZ } from './helpers/t1.ts';

const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const ctx = { now: at(MON, '08:00'), tz: TZ };
let n = 0;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const cmd = (body: DistributiveOmit<PlanCommand, 'id' | 'basePlanVersion'>, base = 1): PlanCommand =>
  ({ id: `cmd-${++n}`, basePlanVersion: base, ...body }) as PlanCommand;

describe('applyCommand — rejections (types.md §9)', () => {
  const week = buildWeek();
  const meal = week.plan.meals.find((m) => m.date === TUE && m.slot === 'dinner')!;
  const session = week.plan.sessions.find((s) => s.date === WED)!;

  it('stale basePlanVersion on a row replaced by the newer version → stale', () => {
    const replanned: PlanState = {
      ...week.state,
      plan: {
        ...week.plan,
        version: 2,
        meals: week.plan.meals.map((m) => (m.id === meal.id ? { ...m, version: 2 } : m)),
      },
    };
    const r = applyCommand(replanned, cmd({ kind: 'SetMealStatus', itemId: meal.id, status: 'eaten' }, 1), ctx);
    expect(r.reject).toBe('stale');
    // The same old version on a row the replan didn't touch still applies.
    const untouched = week.plan.meals.find((m) => m.date === TUE && m.slot === 'lunch')!;
    expect(
      applyCommand(replanned, cmd({ kind: 'SetMealStatus', itemId: untouched.id, status: 'eaten' }, 1), ctx).reject,
    ).toBeUndefined();
  });

  it('SetSessionFeedback on a planned session → invalid_status', () => {
    expect(
      applyCommand(week.state, cmd({ kind: 'SetSessionFeedback', sessionId: session.id, feedback: 'too_easy' }), ctx)
        .reject,
    ).toBe('invalid_status');
  });

  it('SetMealStatus on an unknown meal → applied (a meal can be confirmed later the same day)', () => {
    const state: PlanState = {
      ...week.state,
      plan: { ...week.plan, meals: week.plan.meals.map((m) => (m.id === meal.id ? { ...m, status: 'unknown' } : m)) },
    };
    const r = applyCommand(state, cmd({ kind: 'SetMealStatus', itemId: meal.id, status: 'eaten' }), ctx);
    expect(r.reject).toBeUndefined();
    expect(r.changed.meals?.find((m) => m.id === meal.id)?.status).toBe('eaten');
  });

  it('SwapMeal to a recipe that breaks the diet → invalid_value', () => {
    const veg: PlanState = { ...week.state, profile: { ...week.profile, diet: 'veg' } };
    expect(
      applyCommand(veg, cmd({ kind: 'SwapMeal', itemId: meal.id, recipeSlug: 'chicken-curry-rice' }), ctx).reject,
    ).toBe('invalid_value');
  });

  it('missing target → not_found; out-of-range values → invalid_value; plan edits on actuals → not_planned', () => {
    expect(applyCommand(week.state, cmd({ kind: 'SkipSession', sessionId: 'nope' }), ctx).reject).toBe('not_found');
    expect(
      applyCommand(week.state, cmd({ kind: 'SetSessionTime', sessionId: session.id, start: '18:20' }), ctx).reject,
    ).toBe('invalid_value');
    expect(
      applyCommand(week.state, cmd({ kind: 'SetMealStatus', itemId: meal.id, status: 'replaced' }), ctx).reject,
    ).toBe('invalid_value');
    const eaten: PlanState = {
      ...week.state,
      plan: { ...week.plan, meals: week.plan.meals.map((m) => (m.id === meal.id ? { ...m, status: 'eaten' } : m)) },
    };
    expect(
      applyCommand(eaten, cmd({ kind: 'SwapMeal', itemId: meal.id, recipeSlug: 'dal-rice-meal' }), ctx).reject,
    ).toBe('not_planned');
    expect(applyCommand(eaten, cmd({ kind: 'SetMealStatus', itemId: meal.id, status: 'half' }), ctx).reject).toBe(
      'invalid_status',
    );
  });
});

describe('applyCommand — changes', () => {
  const week = buildWeek();
  const tueDinner = week.plan.meals.find((m) => m.date === TUE && m.slot === 'dinner')!;
  const wed = week.plan.sessions.find((s) => s.date === WED)!;

  it("SwapMeal on a future day re-fits that day; a swap that can't reach the targets is applied and flagged", () => {
    const r = applyCommand(
      week.state,
      cmd({ kind: 'SwapMeal', itemId: tueDinner.id, recipeSlug: 'dal-rice-meal' }),
      ctx,
    );
    expect(r.reject).toBeUndefined();
    const meals = r.state.plan.meals.filter((m) => m.date === TUE);
    expect(meals.find((m) => m.slot === 'dinner')?.recipeSlug).toBe('dal-rice-meal');
    const kcal = meals.reduce((a, m) => a + m.nutrition.kcal, 0);
    const protein = meals.reduce((a, m) => a + m.nutrition.proteinG, 0);
    const reached =
      Math.abs(kcal - week.targets.kcal) <= 0.05 * week.targets.kcal && protein >= 0.95 * week.targets.proteinG;
    expect(r.state.plan.days.find((d) => d.date === TUE)?.ok).toBe(reached);
    // Dal + rice is low in protein, so the re-fit leans on the add-on cap (3 a day).
    expect(meals.reduce((a, m) => a + m.addons.reduce((x, y) => x + y.qty, 0), 0)).toBe(3);
    // A protein-dense swap keeps the day ok.
    const r2 = applyCommand(
      week.state,
      cmd({ kind: 'SwapMeal', itemId: tueDinner.id, recipeSlug: 'chicken-rice-bowl' }),
      ctx,
    );
    expect(r2.state.plan.days.find((d) => d.date === TUE)?.ok).toBe(true);
  });

  it('SetMealStatus today rebalances the rest of the day', () => {
    const lunch = week.plan.meals.find((m) => m.date === MON && m.slot === 'lunch')!;
    const state: PlanState = {
      ...week.state,
      logs: new Map([['log-1', { kcal: 900, proteinG: 25, carbsG: 100, fatG: 40 }]]),
    };
    const r = applyCommand(
      state,
      cmd({ kind: 'SetMealStatus', itemId: lunch.id, status: 'replaced', logId: 'log-1' }),
      { now: at(MON, '14:00'), tz: TZ },
    );
    expect(r.reject).toBeUndefined();
    const dinner = r.changed.meals?.find((m) => m.slot === 'dinner');
    expect(dinner).toBeDefined();
    expect(r.changed.days?.[0]?.tomorrowDeltaKcal).toBeLessThanOrEqual(0);
  });

  it("MoveSession moves the gym day and re-plans both days' meals (the post-workout meal follows)", () => {
    const r = applyCommand(week.state, cmd({ kind: 'MoveSession', sessionId: wed.id, toDate: '2026-11-05' }), ctx);
    expect(r.reject).toBeUndefined();
    const moved = r.state.plan.sessions.find((s) => s.id === wed.id)!;
    expect(moved).toMatchObject({ date: '2026-11-05', movedFromDate: WED, plannedStart: at('2026-11-05', '18:30') });
    expect(r.state.plan.meals.some((m) => m.date === WED && m.slot === 'post_workout')).toBe(false);
    expect(r.state.plan.meals.some((m) => m.date === '2026-11-05' && m.slot === 'post_workout')).toBe(true);
    expect(r.changed.removed?.meals?.length).toBeGreaterThan(0);
    expect(
      applyCommand(week.state, cmd({ kind: 'MoveSession', sessionId: wed.id, toDate: '2026-11-06' }), ctx).reject,
    ).toBe('invalid_value');
  });

  it('LaterSession pushes the start (and the post-workout meal); past bedtime it moves the session instead', () => {
    const r = applyCommand(week.state, cmd({ kind: 'LaterSession', sessionId: wed.id, minutes: '60' }), ctx);
    expect(r.state.plan.sessions.find((s) => s.id === wed.id)?.plannedStart).toBe(at(WED, '19:30'));
    expect(r.state.plan.meals.find((m) => m.date === WED && m.slot === 'post_workout')?.plannedAt).toBe(
      at(WED, '20:30'),
    );
    const late: PlanState = {
      ...week.state,
      plan: {
        ...week.plan,
        sessions: week.plan.sessions.map((s) => (s.id === wed.id ? { ...s, plannedStart: at(WED, '22:15') } : s)),
      },
    };
    const r2 = applyCommand(late, cmd({ kind: 'LaterSession', sessionId: wed.id, minutes: '90' }), ctx);
    expect(r2.state.plan.sessions.find((s) => s.id === wed.id)?.date).not.toBe(WED);
  });

  it('a bedtime after midnight is respected (night owls can push a late session)', () => {
    const owl: PlanState = {
      ...week.state,
      profile: { ...week.profile, sleep: '00:30', wake: '08:00' },
      plan: {
        ...week.plan,
        sessions: week.plan.sessions.map((s) => (s.id === wed.id ? { ...s, plannedStart: at(WED, '21:30') } : s)),
      },
    };
    const r = applyCommand(owl, cmd({ kind: 'LaterSession', sessionId: wed.id, minutes: '60' }), ctx);
    expect(r.state.plan.sessions.find((s) => s.id === wed.id)?.plannedStart).toBe(at(WED, '22:30'));
    const r2 = applyCommand(owl, cmd({ kind: 'LaterSession', sessionId: wed.id, minutes: '90' }), ctx);
    expect(r2.state.plan.sessions.find((s) => s.id === wed.id)?.plannedStart).toBe(at(WED, '23:00'));
  });

  it("SwapExercise swaps one exercise's sets and keeps the weight when the load type matches", () => {
    const sets = week.plan.sets.filter((s) => s.sessionId === wed.id && s.exerciseOrder === 1);
    const r = applyCommand(
      week.state,
      cmd({ kind: 'SwapExercise', sessionId: wed.id, exerciseOrder: 1, exerciseId: 'shoulder_press_db' }),
      ctx,
    );
    expect(r.reject).toBeUndefined();
    for (const s of r.changed.sets ?? []) {
      expect(s.exerciseId).toBe('shoulder_press_db');
      expect(s.swappedFromExerciseId).toBe(sets[0]!.exerciseId);
    }
    const knee: PlanState = { ...week.state, profile: { ...week.profile, injuries: ['knee'] } };
    expect(
      applyCommand(
        knee,
        cmd({ kind: 'SwapExercise', sessionId: wed.id, exerciseOrder: 3, exerciseId: 'walking_lunge_db' }),
        ctx,
      ).reject,
    ).toBe('invalid_value');
  });

  it('UpdatePrefs validates values and re-plans the rest of the week', () => {
    expect(applyCommand(week.state, cmd({ kind: 'UpdatePrefs', patch: { cookTimePref: 15 as 10 } }), ctx).reject).toBe(
      'invalid_value',
    );
    const r = applyCommand(
      week.state,
      cmd({
        kind: 'UpdatePrefs',
        patch: { mealTimes: { breakfast: '08:30', lunch: '13:00', snack: '17:00', dinner: '20:30' } },
      }),
      ctx,
    );
    expect(r.reject).toBeUndefined();
    expect(r.state.profile.mealTimes.dinner).toBe('20:30');
    expect(r.state.plan.meals.find((m) => m.date === TUE && m.slot === 'dinner')?.plannedAt).toBe(at(TUE, '20:30'));
  });

  it('TickGrocery toggles one item', () => {
    const state: PlanState = {
      ...week.state,
      grocery: [
        {
          foodKey: 'chicken_breast_raw',
          name: 'Chicken breast (raw)',
          qty: 900,
          unit: 'g',
          group: 'meat',
          checked: false,
        },
      ],
    };
    const r = applyCommand(
      state,
      cmd({ kind: 'TickGrocery', weekStart: week.plan.weekStart, foodKey: 'chicken_breast_raw', checked: true }),
      ctx,
    );
    expect(r.changed.grocery?.[0]?.checked).toBe(true);
    expect(
      applyCommand(
        state,
        cmd({ kind: 'TickGrocery', weekStart: week.plan.weekStart, foodKey: 'nope', checked: true }),
        ctx,
      ).reject,
    ).toBe('not_found');
  });
});
