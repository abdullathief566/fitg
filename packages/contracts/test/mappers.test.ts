import { describe, expect, it } from 'vitest';
import { computeTargets, recipeNutrition, refId } from '@fitg/engine';
import type { PlanDay, PlannedMeal, PlannedSet, SessionPlan } from '@fitg/engine/types';
import {
  DEFAULT_NOTIFICATION_PREFS,
  MealItemsRowSchema,
  PlanDaysRowSchema,
  ProfilesRowSchema,
  SeedDataError,
  TargetsRowSchema,
  WorkoutSessionsRowSchema,
  WorkoutSetsRowSchema,
  buildRefLookup,
  fromEngineMeal,
  fromEnginePlanDay,
  fromEngineProfile,
  fromEngineSession,
  fromEngineSet,
  fromEngineTargets,
  loadReferenceLib,
  parseSeedFiles,
  refLookupFromLib,
  sampleFoodValues,
  toEngineMeal,
  toEnginePlanDay,
  toEngineProfile,
  toEngineSession,
  toEngineSet,
  toEngineTargets,
  toHomeDish,
} from '../src/mod.ts';
import { T1_PROFILE, USER_ID, clone, seedInput } from './helpers.ts';

const NOW = '2026-11-02T08:00:00.000+00:00';
const stamps = { created_at: NOW, updated_at: NOW };

describe('loadReferenceLib (seed + sample values, in-process)', () => {
  const lib = loadReferenceLib(seedInput());

  it('loads every reference list', () => {
    expect(lib.foods.size).toBe(40);
    expect(lib.recipes.size).toBe(42);
    expect(lib.homeDishes.size).toBe(29); // every dish has a recipe now
    expect(lib.addons).toHaveLength(7);
    expect(lib.exercises.byId.size).toBe(33);
    expect(lib.foods.get('rice_white_raw')?.units.map((u) => u.unit)).toEqual(['katori', 'g']);
    expect(lib.foods.get('egg_whole')?.food.synthetic).toBe(true);
  });

  it('expands the two splits into six templates with slot ids', () => {
    expect(lib.templates.map((t) => t.id).sort()).toEqual(
      [
        'full_ab_gym',
        'full_ab_home_db',
        'full_ab_machine',
        'upper_lower_gym',
        'upper_lower_home_db',
        'upper_lower_machine',
      ].sort(),
    );
    const machine = lib.templates.find((t) => t.id === 'full_ab_machine')!;
    expect(machine.sessions[0]!.slots[0]!.slotId).toBe('A:0:squat');
    expect(machine.sessions[0]!.slots[0]!.preferred).toEqual(['leg_press_machine', 'goblet_squat_db']);
  });

  it('computes nutritionPerServing with the engine (never by hand)', () => {
    for (const r of lib.recipes.values()) expect(r.nutritionPerServing).toEqual(recipeNutrition(r, lib.foods, 1));
    // egg-bhurji-roti from the sample values: 100 g egg 143 + 60 g atta 204 + 40 g onion 16 + 40 g tomato 7.2 + 4.5 g oil 39.78
    expect(lib.recipes.get('egg-bhurji-roti')!.nutritionPerServing.kcal).toBeCloseTo(409.98, 6);
  });

  it('maps seed fields to engine fields', () => {
    const rajma = lib.recipes.get('rajma-rice-meal')!;
    expect(rajma.prep).toEqual({ text: 'Soak the rajma tonight.', leadHours: 10 });
    expect(rajma.scaleRules).toEqual({ minMult: 0.5, maxMult: 2, step: 0.25 });
    expect(lib.recipes.get('whey-banana-shake')!.requires).toEqual(['whey_isolate']);
    expect(lib.recipes.get('dal-tadka-home')!.cookedYieldG).toBe(250);
    expect(lib.homeDishes.get('dal_tadka')).toMatchObject({
      recipeSlug: 'dal-tadka-home',
      gramsPerUnit: 150,
      category: 'dal',
    });
    expect(lib.addons.find((a) => a.key === 'boiled_egg')).toMatchObject({
      foodKey: 'egg_whole',
      pantryFoodKey: 'egg_whole',
    });
    expect(lib.exercises.byId.get('barbell_back_squat')!.formCues).toHaveLength(3);
  });

  it('accepts resolved values instead of the sample file', () => {
    const values = sampleFoodValues(seedInput().sample);
    const { sample: _s, ...files } = seedInput();
    expect(loadReferenceLib({ ...files, values }).foods.size).toBe(40);
  });

  it('fails loudly on an unknown key, listing it', () => {
    const input = seedInput();
    const recipes = clone(input.recipes) as { recipes: Array<{ ingredients: Array<{ food: string }> }> };
    recipes.recipes[0]!.ingredients[0]!.food = 'unicorn_meat';
    expect(() => loadReferenceLib({ ...input, recipes })).toThrow(SeedDataError);
    expect(() => loadReferenceLib({ ...input, recipes })).toThrow(/unicorn_meat/);
  });

  it('fails when a food has no values or values name an unknown food', () => {
    const input = seedInput();
    const sample = clone(input.sample) as { foods: Array<{ key: string }> };
    sample.foods = sample.foods.filter((f) => f.key !== 'paneer');
    expect(() => loadReferenceLib({ ...input, sample })).toThrow(/'paneer' has no nutrition values/);
    const extra = clone(input.sample) as { foods: Array<Record<string, unknown>> };
    extra.foods.push({ ...extra.foods[0], key: 'mystery_food' });
    expect(() => loadReferenceLib({ ...input, sample: extra })).toThrow(/unknown food key 'mystery_food'/);
  });

  it('toHomeDish refuses a dish that still needs a recipe', () => {
    const dish = parseSeedFiles(seedInput()).homeDishes.home_dishes[0]!;
    expect(() => toHomeDish({ ...dish, recipe_slug: null, needs_recipe: true })).toThrow(/needs_recipe/);
  });
});

describe('DB rows ↔ engine', () => {
  const lib = loadReferenceLib(seedInput());
  const refs = refLookupFromLib(lib);

  it('profiles round-trip (and the row parses)', () => {
    const row = { ...fromEngineProfile(T1_PROFILE, { onboardingCompletedAt: NOW }), ...stamps };
    expect(ProfilesRowSchema.safeParse(row).success).toBe(true);
    expect(toEngineProfile(ProfilesRowSchema.parse(row))).toEqual(T1_PROFILE);
  });

  it('profiles: Postgres HH:MM:SS times → HH:MM, notification_prefs {} → defaults', () => {
    const row = {
      ...fromEngineProfile(T1_PROFILE),
      ...stamps,
      wake_time: '07:00:00',
      sleep_time: '23:00:00',
      notification_prefs: {},
    };
    const p = toEngineProfile(ProfilesRowSchema.parse(row));
    expect(p.wake).toBe('07:00');
    expect(p.sleep).toBe('23:00');
    expect(p.notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('targets round-trip (T1: 1850 / 120)', () => {
    const t = computeTargets({
      sex: 'male',
      ageYears: 28,
      heightCm: 175,
      weightKg: 75,
      goal: 'fat_loss',
      activity: 'desk',
      gymDaysPerWeek: 3,
      safetyFlags: {},
    });
    expect([t.kcal, t.proteinG]).toEqual([1850, 120]);
    const row = {
      ...fromEngineTargets(t, {
        id: refId('targets-1'),
        userId: USER_ID,
        effectiveFrom: '2026-11-02',
        reason: 'onboarding',
      }),
      ...stamps,
    };
    expect(TargetsRowSchema.safeParse(row).success).toBe(true);
    expect(toEngineTargets(TargetsRowSchema.parse(row))).toEqual(t);
  });

  it('plan_days round-trip, including ok and problems', () => {
    const day: PlanDay = {
      id: refId('day-1'),
      date: '2026-11-07',
      isGymDay: false,
      kcalTarget: 1850,
      proteinTarget: 120,
      prepTasks: [
        {
          forDate: '2026-11-07',
          text: 'Soak the rajma tonight.',
          at: '2026-11-07T15:00:00.000Z',
          recipeSlug: 'rajma-rice-meal',
        },
      ],
      tomorrowDeltaKcal: -120,
      ok: false,
      problems: [{ code: 'protein_short', severity: 'error', date: '2026-11-07', detail: 'short' }],
    };
    const row = { ...fromEnginePlanDay(day, { userId: USER_ID, weeklyPlanId: refId('plan-1') }), updated_at: NOW };
    expect(PlanDaysRowSchema.safeParse(row).success).toBe(true);
    expect(toEnginePlanDay(PlanDaysRowSchema.parse(row))).toEqual(day);
  });

  it('workout_sessions and workout_sets round-trip (target_reps included)', () => {
    const session: SessionPlan = {
      id: refId('sess-1'),
      date: '2026-11-02',
      templateKey: 'A',
      name: 'Full body A',
      plannedStart: '2026-11-02T13:00:00.000Z',
      plannedDurationMin: 60,
      status: 'finished',
      startedAt: '2026-11-02T13:05:00.000Z',
      endedAt: '2026-11-02T14:00:00.000Z',
      startSource: 'ping_action',
      importance: 3,
      feedback: 'ok',
      version: 2,
    };
    const sRow = { ...fromEngineSession(session, { userId: USER_ID, planDayId: refId('day-1') }), ...stamps };
    expect(WorkoutSessionsRowSchema.safeParse(sRow).success).toBe(true);
    expect(toEngineSession(WorkoutSessionsRowSchema.parse(sRow))).toEqual(session);

    const set: PlannedSet = {
      id: refId('set-1'),
      sessionId: session.id,
      exerciseId: 'leg_press_machine',
      exerciseOrder: 0,
      setIndex: 1,
      targetWeightKg: 45,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetReps: 9,
      restSec: 120,
      actualWeightKg: 45,
      actualReps: 10,
      status: 'done',
      doneAt: '2026-11-02T13:12:00.000Z',
    };
    const setRow = { ...fromEngineSet(set, { userId: USER_ID }), updated_at: NOW };
    expect(WorkoutSetsRowSchema.safeParse(setRow).success).toBe(true);
    expect(toEngineSet(WorkoutSetsRowSchema.parse(setRow))).toEqual(set);
  });

  it('meal_items round-trip: recipe uuid ↔ slug, home dish uuids ↔ keys, portions of foods, dishes and recipes', () => {
    const recipeMeal: PlannedMeal = {
      id: refId('meal-1'),
      date: '2026-11-02',
      slot: 'breakfast',
      plannedAt: '2026-11-02T02:30:00.000Z',
      kind: 'recipe',
      recipeSlug: 'egg-bhurji-roti',
      multiplier: 1.25,
      portions: [{ foodKey: 'egg_whole', grams: 125, unit: 'egg', qty: 2.5, label: '2½ eggs' }],
      addons: [{ addonKey: 'curd_cup', qty: 1 }],
      nutrition: { kcal: 512.4, proteinG: 30.1, carbsG: 50.2, fatG: 20.3 },
      status: 'eaten',
      statusAt: '2026-11-02T03:00:00.000Z',
      version: 1,
    };
    const homeMeal: PlannedMeal = {
      id: refId('meal-2'),
      date: '2026-11-02',
      slot: 'dinner',
      plannedAt: '2026-11-02T15:45:00.000Z',
      kind: 'home_food',
      homeDishKeys: ['dal_tadka', 'roti'],
      multiplier: 1,
      portions: [
        {
          foodKey: 'dal_tadka',
          grams: 150,
          unit: 'katori',
          qty: 1,
          label: '1 katori dal tadka',
          homeDishKey: 'dal_tadka',
        },
        { foodKey: 'roti', grams: 80, unit: 'roti', qty: 2, label: '2 rotis', homeDishKey: 'roti' },
      ],
      addons: [],
      nutrition: { kcal: 420, proteinG: 18, carbsG: 60, fatG: 10 },
      status: 'replaced',
      replacedByLogId: refId('log-1'),
      version: 3,
    };
    const eatOut: PlannedMeal = {
      id: refId('meal-3'),
      date: '2026-11-02',
      slot: 'lunch',
      plannedAt: '2026-11-02T07:30:00.000Z',
      kind: 'eat_out',
      multiplier: 1,
      portions: [
        { foodKey: 'chicken-curry-rice', grams: 400, unit: 'plate', qty: 1, label: '1 plate chicken curry rice' },
      ],
      addons: [],
      nutrition: { kcal: 640, proteinG: 40, carbsG: 70, fatG: 18 },
      status: 'planned',
      version: 1,
    };
    for (const meal of [recipeMeal, homeMeal, eatOut]) {
      const row = { ...fromEngineMeal(meal, { userId: USER_ID, planDayId: refId('day-1') }, refs), ...stamps };
      const parsed = MealItemsRowSchema.safeParse(row);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(toEngineMeal(MealItemsRowSchema.parse(row), refs)).toEqual(meal);
    }
    const row = fromEngineMeal(recipeMeal, { userId: USER_ID, planDayId: refId('day-1') }, refs);
    expect(row.recipe_id).toBe(refId('egg-bhurji-roti'));
    expect(row.portions[0]).toMatchObject({ food_id: refId('egg_whole') });
    expect(fromEngineMeal(homeMeal, { userId: USER_ID, planDayId: refId('day-1') }, refs).home_dish_ids).toEqual([
      refId('dal_tadka'),
      refId('roti'),
    ]);
  });

  it('unknown keys and ids fail loudly', () => {
    const meal: PlannedMeal = {
      id: refId('m'),
      date: '2026-11-02',
      slot: 'lunch',
      plannedAt: '2026-11-02T07:30:00.000Z',
      kind: 'recipe',
      recipeSlug: 'not-a-recipe',
      multiplier: 1,
      portions: [],
      addons: [],
      nutrition: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
      status: 'planned',
      version: 1,
    };
    expect(() => fromEngineMeal(meal, { userId: USER_ID, planDayId: refId('d') }, refs)).toThrow(/not-a-recipe/);
    const noRecipes = buildRefLookup({ foods: ['egg_whole'] });
    const row = {
      ...fromEngineMeal({ ...meal, recipeSlug: 'egg-bhurji-roti' }, { userId: USER_ID, planDayId: refId('d') }, refs),
      ...stamps,
    };
    expect(() => toEngineMeal(MealItemsRowSchema.parse(row), noRecipes)).toThrow(/Unknown recipe id/);
  });
});
