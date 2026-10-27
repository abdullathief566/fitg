// Mappers: seed files → engine reference rows (loadReferenceLib), and DB rows (snake_case) ↔ engine types (camelCase).
// Reference rows are addressed by stable keys in the engine and by uuid in the database: id = refId(key) (UUIDv5),
// so uuid → key needs a reverse lookup built from the keys we know (RefLookup).
import type { z } from 'zod';
import { ZERO_NUTRITION, buildFoodIndex, expandTemplates, recipeNutrition, refId } from '@fitg/engine';
import type {
  ExerciseLib,
  ExerciseRow,
  FoodIndex,
  FoodRow,
  FoodUnit,
  HomeDish,
  LocalDate,
  LocalTime,
  MealTimes,
  NotificationPrefs,
  Nutrition,
  PlanDay,
  PlannedMeal,
  PlannedSet,
  Portion,
  Profile,
  ProteinAddon,
  RecipeIndex,
  RecipeRow,
  SafetyFlags,
  SessionPlan,
  Targets,
  WorkoutTemplate,
} from '@fitg/engine/types';
import type {
  DbMealTimesSchema,
  DbNutritionSchema,
  DbPortionSchema,
  DbSafetyFlagsSchema,
  DbSessionSummarySchema,
  MealItemsRow,
  PlanDaysRow,
  ProfilesRow,
  TargetReasonSchema,
  TargetsRow,
  WorkoutSessionsRow,
  WorkoutSetsRow,
} from './db.ts';
import {
  SampleFoodsFileSchema,
  SeedDataError,
  findSeedProblems,
  issueLines,
  parseSeedFiles,
  type FoodValues,
  type SeedExercise,
  type SeedFiles,
  type SeedFood,
  type SeedHomeDish,
  type SeedProteinAddon,
  type SeedRecipe,
} from './seed.ts';

type DbNutrition = z.infer<typeof DbNutritionSchema>;
type DbPortion = z.infer<typeof DbPortionSchema>;
type DbMealTimes = z.infer<typeof DbMealTimesSchema>;
type DbSafetyFlags = z.infer<typeof DbSafetyFlagsSchema>;
type DbSessionSummary = z.infer<typeof DbSessionSummarySchema>;
type TargetReason = z.infer<typeof TargetReasonSchema>;

// ───────────────────────── seed → engine ─────────────────────────

/** A seed food + its resolved per-100 g values → FoodRow (`synthetic` kept so --prod can refuse it). */
export function toFoodRow(food: SeedFood, values: FoodValues): FoodRow {
  const row: FoodRow = {
    key: food.key,
    name: food.name,
    category: food.category,
    kcal: values.kcal,
    proteinG: values.protein_g,
    carbsG: values.carbs_g,
    fatG: values.fat_g,
    fiberG: values.fiber_g,
    isRaw: food.is_raw,
    yieldFactor: food.yield_factor,
    cookedWithOil: food.cooked_with_oil,
  };
  if (values.synthetic === true) row.synthetic = true;
  return row;
}

export function toFoodUnits(food: SeedFood): FoodUnit[] {
  return food.units.map((u) => ({ foodKey: food.key, unit: u.unit, grams: u.grams, label: u.label }));
}

/** A seed recipe → RecipeRow. `nutritionPerServing` is computed with the engine's recipeNutrition (multiplier 1). */
export function toRecipeRow(recipe: SeedRecipe, foods: FoodIndex): RecipeRow {
  const row: RecipeRow = {
    slug: recipe.slug,
    name: recipe.name,
    cuisine: recipe.cuisine,
    mealSlots: [...recipe.meal_slots],
    dietTags: [...recipe.diet_tags],
    allergens: [...recipe.allergens],
    cookTimeMin: recipe.cook_time_min,
    costTier: recipe.cost_tier,
    servings: recipe.servings,
    oilTsp: recipe.oil_tsp,
    requires: [...(recipe.requires ?? [])],
    ingredients: recipe.ingredients.map((i) => ({
      foodKey: i.food,
      grams: i.grams,
      unit: i.unit,
      qty: i.qty,
      role: i.role,
      scalable: i.scalable,
    })),
    steps: recipe.steps.map((s) =>
      s.timer_sec === undefined ? { text: s.text } : { text: s.text, timerSec: s.timer_sec },
    ),
    scaleRules: {
      minMult: recipe.scale_rules.min_mult,
      maxMult: recipe.scale_rules.max_mult,
      step: recipe.scale_rules.step,
    },
    proteinAddons: [...recipe.protein_addons],
    tags: [...recipe.tags],
    isDraft: recipe.is_draft,
    nutritionPerServing: { ...ZERO_NUTRITION },
  };
  if (recipe.cooked_yield_g !== undefined) row.cookedYieldG = recipe.cooked_yield_g;
  if (recipe.prep !== undefined) row.prep = { text: recipe.prep.text, leadHours: recipe.prep.lead_hours };
  row.nutritionPerServing = recipeNutrition(row, foods, 1);
  return row;
}

/** A home dish with a recipe → HomeDish. `needs_recipe` dishes have no recipe yet and can't be mapped. */
export function toHomeDish(dish: SeedHomeDish): HomeDish {
  if (dish.recipe_slug === null) throw new Error(`Home dish '${dish.key}' has no recipe yet (needs_recipe)`);
  return {
    key: dish.key,
    name: dish.name,
    aliases: [...dish.aliases],
    recipeSlug: dish.recipe_slug,
    unit: dish.unit,
    gramsPerUnit: dish.grams_per_unit,
    category: dish.category,
    proteinClass: dish.protein_class,
  };
}

export function toProteinAddon(addon: SeedProteinAddon): ProteinAddon {
  return {
    key: addon.key,
    name: addon.name,
    foodKey: addon.food_key,
    unit: addon.unit,
    gramsPerUnit: addon.grams_per_unit,
    dietTags: [...addon.diet_tags],
    pantryFoodKey: addon.pantry_food_key,
  };
}

export function toExerciseRow(ex: SeedExercise): ExerciseRow {
  return {
    id: ex.id,
    name: ex.name,
    primaryMuscle: ex.primary_muscle,
    secondaryMuscles: [...ex.secondary_muscles],
    movementPattern: ex.movement_pattern,
    equipment: [...ex.equipment],
    loadType: ex.load_type,
    isMachine: ex.is_machine,
    injuryTags: [...ex.injury_tags],
    formCues: [ex.form_cues[0], ex.form_cues[1], ex.form_cues[2]],
    startLoadRatio: ex.start_load_ratio,
    incrementKg: ex.increment_kg,
    repMin: ex.rep_min,
    repMax: ex.rep_max,
    importance: ex.importance,
  };
}

// ───────────────────────── the reference library ─────────────────────────

export interface ReferenceLib {
  foods: FoodIndex;
  recipes: RecipeIndex;
  homeDishes: Map<string, HomeDish>;
  addons: ProteinAddon[];
  exercises: ExerciseLib;
  templates: WorkoutTemplate[];
}

export interface ReferenceBuild {
  lib: ReferenceLib;
  /** Home dishes left out because they still need a recipe (`needs_recipe: true`). */
  skippedHomeDishes: string[];
}

/** foods.sample.json (raw JSON) → key → values. Throws on schema problems or a key listed twice. */
export function sampleFoodValues(sample: unknown): Map<string, FoodValues> {
  const parsed = SampleFoodsFileSchema.safeParse(sample);
  if (!parsed.success)
    throw new SeedDataError(
      'foods.sample.json failed schema validation:',
      issueLines('foods.sample.json', parsed.error),
    );
  const out = new Map<string, FoodValues>();
  const problems: string[] = [];
  for (const f of parsed.data.foods) {
    if (out.has(f.key)) problems.push(`foods.sample.json: food '${f.key}' is listed twice`);
    out.set(f.key, {
      kcal: f.kcal,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      fiber_g: f.fiber_g,
      synthetic: f.synthetic,
    });
  }
  if (problems.length > 0) throw new SeedDataError('foods.sample.json is invalid:', problems);
  return out;
}

/**
 * Builds the engine's reference library from parsed seed files and resolved food values. Fails (SeedDataError,
 * every offender listed) on any unknown key, duplicate key, missing unit, or a food without values / values for an
 * unknown food. Home dishes with `needs_recipe: true` are skipped.
 */
export function buildReference(seeds: SeedFiles, values: ReadonlyMap<string, FoodValues>): ReferenceBuild {
  const problems = findSeedProblems(seeds);
  const foodKeys = new Set(seeds.foodsMap.foods.map((f) => f.key));
  for (const f of seeds.foodsMap.foods) {
    if (!values.has(f.key)) problems.push(`food '${f.key}' has no nutrition values`);
  }
  for (const key of values.keys()) {
    if (!foodKeys.has(key)) problems.push(`nutrition values given for unknown food key '${key}'`);
  }
  if (problems.length > 0) throw new SeedDataError('Seed data is inconsistent:', problems);

  const foodRows: FoodRow[] = [];
  const units: FoodUnit[] = [];
  for (const f of seeds.foodsMap.foods) {
    foodRows.push(toFoodRow(f, values.get(f.key)!));
    units.push(...toFoodUnits(f));
  }
  const foods = buildFoodIndex(foodRows, units);

  const recipes: RecipeIndex = new Map(seeds.recipes.recipes.map((r) => [r.slug, toRecipeRow(r, foods)]));

  const homeDishes = new Map<string, HomeDish>();
  const skippedHomeDishes: string[] = [];
  for (const d of seeds.homeDishes.home_dishes) {
    if (d.needs_recipe || d.recipe_slug === null) skippedHomeDishes.push(d.key);
    else homeDishes.set(d.key, toHomeDish(d));
  }

  const addons = seeds.addons.protein_addons.map(toProteinAddon);
  const exercises: ExerciseLib = { byId: new Map(seeds.exercises.exercises.map((e) => [e.id, toExerciseRow(e)])) };
  const templates = expandTemplates(seeds.templates.splits);

  return { lib: { foods, recipes, homeDishes, addons, exercises, templates }, skippedHomeDishes };
}

/** The raw seed files (JSON as loaded from data/seed/). */
export interface ReferenceSeedInput {
  foodsMap: unknown;
  recipes: unknown;
  homeDishes: unknown;
  addons: unknown;
  exercises: unknown;
  templates: unknown;
}

/** Food values come from foods.sample.json (`sample`) or from the USDA/curated resolution (`values`). */
export type ReferenceValuesInput =
  { sample: unknown; values?: undefined } | { values: ReadonlyMap<string, FoodValues>; sample?: undefined };

/**
 * Validates the seed files and returns `{ foods, recipes, homeDishes, addons, exercises, templates }` for the engine.
 * Tests and tools call this in-process with `data/seed/*.json` + `data/sample/foods.sample.json`.
 */
export function loadReferenceLib(input: ReferenceSeedInput & ReferenceValuesInput): ReferenceLib {
  const seeds = parseSeedFiles(input);
  const values = input.values ?? sampleFoodValues(input.sample);
  return buildReference(seeds, values).lib;
}

// ───────────────────────── uuid ↔ key ─────────────────────────

/** Reverse lookups uuid → key for reference rows (id = refId(key)). */
export interface RefLookup {
  foods: ReadonlyMap<string, string>;
  recipes: ReadonlyMap<string, string>;
  homeDishes: ReadonlyMap<string, string>;
}

function reverse(keys: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of keys) out.set(refId(k), k);
  return out;
}

export function buildRefLookup(keys: {
  foods?: Iterable<string>;
  recipes?: Iterable<string>;
  homeDishes?: Iterable<string>;
}): RefLookup {
  return {
    foods: reverse(keys.foods ?? []),
    recipes: reverse(keys.recipes ?? []),
    homeDishes: reverse(keys.homeDishes ?? []),
  };
}

export function refLookupFromLib(lib: Pick<ReferenceLib, 'foods' | 'recipes' | 'homeDishes'>): RefLookup {
  return buildRefLookup({ foods: lib.foods.keys(), recipes: lib.recipes.keys(), homeDishes: lib.homeDishes.keys() });
}

function keyOf(map: ReadonlyMap<string, string>, id: string, what: string): string {
  const key = map.get(id.toLowerCase());
  if (key === undefined) throw new Error(`Unknown ${what} id ${id}`);
  return key;
}

function knownId(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = refId(key);
  if (!map.has(id)) throw new Error(`Unknown ${what} key '${key}'`);
  return id;
}

// ───────────────────────── small shared conversions ─────────────────────────

export function toEngineNutrition(n: DbNutrition): Nutrition {
  return { kcal: n.kcal, proteinG: n.protein_g, carbsG: n.carbs_g, fatG: n.fat_g };
}

export function fromEngineNutrition(n: Nutrition): DbNutrition {
  return { kcal: n.kcal, protein_g: n.proteinG, carbs_g: n.carbsG, fat_g: n.fatG };
}

/** Postgres `time` ('HH:MM:SS') → LocalTime ('HH:MM'). */
function hhmm(t: string): LocalTime {
  return t.slice(0, 5);
}

function mealTimesToEngine(m: DbMealTimes): MealTimes {
  const out: MealTimes = { breakfast: hhmm(m.breakfast), lunch: hhmm(m.lunch), dinner: hhmm(m.dinner) };
  if (m.snack !== undefined) out.snack = hhmm(m.snack);
  return out;
}

function mealTimesFromEngine(m: MealTimes): DbMealTimes {
  const out: DbMealTimes = { breakfast: m.breakfast, lunch: m.lunch, dinner: m.dinner };
  if (m.snack !== undefined) out.snack = m.snack;
  return out;
}

function safetyToEngine(s: DbSafetyFlags): SafetyFlags {
  const out: SafetyFlags = {};
  if (s.pregnant !== undefined) out.pregnant = s.pregnant;
  if (s.diabetes !== undefined) out.diabetes = s.diabetes;
  if (s.glp1 !== undefined) out.glp1 = s.glp1;
  if (s.ed_history !== undefined) out.edHistory = s.ed_history;
  return out;
}

function safetyFromEngine(s: SafetyFlags): DbSafetyFlags {
  const out: DbSafetyFlags = {};
  if (s.pregnant !== undefined) out.pregnant = s.pregnant;
  if (s.diabetes !== undefined) out.diabetes = s.diabetes;
  if (s.glp1 !== undefined) out.glp1 = s.glp1;
  if (s.edHistory !== undefined) out.ed_history = s.edHistory;
  return out;
}

// ───────────────────────── profiles ─────────────────────────

/** `profiles.notification_prefs` defaults to '{}': missing keys take these values (schema.sql comment). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = Object.freeze({
  nightBefore: '21:30',
  preGymOffsetMin: 15,
  timeSensitive: true,
  haptics: true,
});

export function toEngineProfile(row: ProfilesRow): Profile {
  const np = row.notification_prefs;
  const p: Profile = {
    userId: row.user_id,
    sex: row.sex,
    birthYear: row.birth_year,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    goal: row.goal,
    activity: row.activity,
    experience: row.experience,
    injuries: [...row.injuries],
    equipment: row.equipment,
    homeDumbbellsKg: [...row.home_dumbbells_kg],
    gymSchedule: row.gym_schedule.map((s) => ({ weekday: s.weekday, start: s.start, durationMin: s.duration_min })),
    availableDays: [...row.available_days],
    diet: row.diet,
    cuisine: row.cuisine_pref,
    allergies: [...row.allergies],
    dislikes: [...row.dislikes],
    eatingMode: row.eating_mode,
    wake: hhmm(row.wake_time),
    sleep: hhmm(row.sleep_time),
    mealTimes: mealTimesToEngine(row.meal_times),
    cookTimePref: row.cook_time_pref,
    budgetTier: row.budget_tier,
    safetyFlags: safetyToEngine(row.safety_flags),
    tz: row.timezone,
    units: row.units,
    notificationPrefs: {
      nightBefore: np.night_before ?? DEFAULT_NOTIFICATION_PREFS.nightBefore,
      preGymOffsetMin: np.pre_gym_offset_min ?? DEFAULT_NOTIFICATION_PREFS.preGymOffsetMin,
      timeSensitive: np.time_sensitive ?? DEFAULT_NOTIFICATION_PREFS.timeSensitive,
      haptics: np.haptics ?? DEFAULT_NOTIFICATION_PREFS.haptics,
    },
    learnedTiming: {
      preGymShiftMin: row.learned_timing.pre_gym_shift_min,
      dinnerShiftMin: row.learned_timing.dinner_shift_min,
    },
  };
  if (row.display_name !== null) p.firstName = row.display_name;
  if (row.goal_weight_kg !== null) p.goalWeightKg = row.goal_weight_kg;
  if (row.journey_started_at !== null) p.journeyStartedAt = row.journey_started_at;
  return p;
}

/** Profile → profiles row (without the server-maintained created_at/updated_at). */
export function fromEngineProfile(
  p: Profile,
  meta: { onboardingCompletedAt?: string | null } = {},
): Omit<ProfilesRow, 'created_at' | 'updated_at'> {
  return {
    user_id: p.userId,
    display_name: p.firstName ?? null,
    sex: p.sex,
    birth_year: p.birthYear,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    goal_weight_kg: p.goalWeightKg ?? null,
    goal: p.goal,
    activity: p.activity,
    experience: p.experience,
    injuries: [...p.injuries],
    equipment: p.equipment,
    home_dumbbells_kg: [...p.homeDumbbellsKg],
    gym_schedule: p.gymSchedule.map((s) => ({ weekday: s.weekday, start: s.start, duration_min: s.durationMin })),
    available_days: [...p.availableDays],
    diet: p.diet,
    cuisine_pref: p.cuisine,
    allergies: [...p.allergies],
    dislikes: [...p.dislikes],
    eating_mode: p.eatingMode,
    wake_time: p.wake,
    sleep_time: p.sleep,
    meal_times: mealTimesFromEngine(p.mealTimes),
    cook_time_pref: p.cookTimePref,
    budget_tier: p.budgetTier,
    safety_flags: safetyFromEngine(p.safetyFlags),
    timezone: p.tz,
    units: p.units,
    notification_prefs: {
      night_before: p.notificationPrefs.nightBefore,
      pre_gym_offset_min: p.notificationPrefs.preGymOffsetMin,
      time_sensitive: p.notificationPrefs.timeSensitive,
      haptics: p.notificationPrefs.haptics,
    },
    learned_timing: {
      pre_gym_shift_min: p.learnedTiming.preGymShiftMin,
      dinner_shift_min: p.learnedTiming.dinnerShiftMin,
    },
    onboarding_completed_at: meta.onboardingCompletedAt ?? null,
    journey_started_at: p.journeyStartedAt ?? null,
  };
}

// ───────────────────────── targets ─────────────────────────

export function toEngineTargets(row: TargetsRow): Targets {
  const b = row.basis;
  return {
    kcal: row.kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    displayMode: row.display_mode,
    basis: {
      bmr: b.bmr,
      activityFactor: b.activity_factor,
      tdee: b.tdee,
      adjustPct: b.adjust_pct,
      bmi: b.bmi,
      weightUsedKg: b.weight_used_kg,
      floorsApplied: b.floors_applied,
      notes: [...b.notes],
    },
  };
}

export function fromEngineTargets(
  t: Targets,
  meta: { id: string; userId: string; effectiveFrom: LocalDate; reason: TargetReason; kcalDelta?: number },
): Omit<TargetsRow, 'created_at' | 'updated_at'> {
  return {
    id: meta.id,
    user_id: meta.userId,
    effective_from: meta.effectiveFrom,
    kcal: t.kcal,
    protein_g: t.proteinG,
    carbs_g: t.carbsG,
    fat_g: t.fatG,
    kcal_delta: meta.kcalDelta ?? 0,
    basis: {
      bmr: t.basis.bmr,
      activity_factor: t.basis.activityFactor,
      tdee: t.basis.tdee,
      adjust_pct: t.basis.adjustPct,
      bmi: t.basis.bmi,
      weight_used_kg: t.basis.weightUsedKg,
      floors_applied: t.basis.floorsApplied,
      notes: [...t.basis.notes],
    },
    reason: meta.reason,
    display_mode: t.displayMode,
  };
}

// ───────────────────────── plan_days ─────────────────────────

export function toEnginePlanDay(row: PlanDaysRow): PlanDay {
  return {
    id: row.id,
    date: row.date,
    isGymDay: row.is_gym_day,
    kcalTarget: row.kcal_target,
    proteinTarget: row.protein_target,
    prepTasks: row.prep_tasks.map((t) => ({ forDate: t.for_date, text: t.text, at: t.at, recipeSlug: t.recipe_slug })),
    tomorrowDeltaKcal: row.tomorrow_delta_kcal,
    ok: row.ok,
    problems: row.problems.map((p) => ({ ...p })),
  };
}

export function fromEnginePlanDay(
  d: PlanDay,
  meta: { userId: string; weeklyPlanId: string },
): Omit<PlanDaysRow, 'updated_at'> {
  return {
    id: d.id,
    weekly_plan_id: meta.weeklyPlanId,
    user_id: meta.userId,
    date: d.date,
    is_gym_day: d.isGymDay,
    kcal_target: d.kcalTarget,
    protein_target: d.proteinTarget,
    prep_tasks: d.prepTasks.map((t) => ({ for_date: t.forDate, text: t.text, at: t.at, recipe_slug: t.recipeSlug })),
    tomorrow_delta_kcal: d.tomorrowDeltaKcal,
    ok: d.ok,
    problems: d.problems.map((p) => ({ ...p })),
  };
}

// ───────────────────────── workout_sessions ─────────────────────────

export function toEngineSession(row: WorkoutSessionsRow): SessionPlan {
  const s: SessionPlan = {
    id: row.id,
    date: row.date,
    templateKey: row.template_key,
    name: row.name,
    plannedStart: row.planned_start,
    plannedDurationMin: row.planned_duration_min,
    status: row.status,
    importance: row.importance,
    version: row.version,
  };
  if (row.started_at !== null) s.startedAt = row.started_at;
  if (row.ended_at !== null) s.endedAt = row.ended_at;
  if (row.start_source !== null) s.startSource = row.start_source;
  if (row.moved_from_date !== null) s.movedFromDate = row.moved_from_date;
  if (row.feedback !== null) s.feedback = row.feedback;
  return s;
}

export function fromEngineSession(
  s: SessionPlan,
  meta: { userId: string; planDayId: string; summary?: DbSessionSummary | null },
): Omit<WorkoutSessionsRow, 'created_at' | 'updated_at'> {
  return {
    id: s.id,
    user_id: meta.userId,
    plan_day_id: meta.planDayId,
    date: s.date,
    template_key: s.templateKey,
    name: s.name,
    planned_start: s.plannedStart,
    planned_duration_min: s.plannedDurationMin,
    status: s.status,
    started_at: s.startedAt ?? null,
    ended_at: s.endedAt ?? null,
    start_source: s.startSource ?? null,
    importance: s.importance,
    moved_from_date: s.movedFromDate ?? null,
    feedback: s.feedback ?? null,
    summary: meta.summary ?? null,
    version: s.version,
  };
}

// ───────────────────────── workout_sets ─────────────────────────

export function toEngineSet(row: WorkoutSetsRow): PlannedSet {
  const s: PlannedSet = {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    exerciseOrder: row.exercise_order,
    setIndex: row.set_index,
    targetWeightKg: row.target_weight_kg,
    targetRepsMin: row.target_reps_min,
    targetRepsMax: row.target_reps_max,
    targetReps: row.target_reps,
    restSec: row.rest_sec,
    status: row.status,
  };
  if (row.actual_weight_kg !== null) s.actualWeightKg = row.actual_weight_kg;
  if (row.actual_reps !== null) s.actualReps = row.actual_reps;
  if (row.done_at !== null) s.doneAt = row.done_at;
  if (row.swapped_from_exercise_id !== null) s.swappedFromExerciseId = row.swapped_from_exercise_id;
  return s;
}

export function fromEngineSet(s: PlannedSet, meta: { userId: string }): Omit<WorkoutSetsRow, 'updated_at'> {
  return {
    id: s.id,
    session_id: s.sessionId,
    user_id: meta.userId,
    exercise_id: s.exerciseId,
    exercise_order: s.exerciseOrder,
    set_index: s.setIndex,
    target_weight_kg: s.targetWeightKg,
    target_reps_min: s.targetRepsMin,
    target_reps_max: s.targetRepsMax,
    target_reps: s.targetReps,
    rest_sec: s.restSec,
    actual_weight_kg: s.actualWeightKg ?? null,
    actual_reps: s.actualReps ?? null,
    status: s.status,
    done_at: s.doneAt ?? null,
    swapped_from_exercise_id: s.swappedFromExerciseId ?? null,
  };
}

// ───────────────────────── meal_items ─────────────────────────

function portionToEngine(p: DbPortion, refs: RefLookup): Portion {
  const base = { grams: p.grams, unit: p.unit, qty: p.qty, label: p.label };
  if (p.home_dish_id !== undefined) {
    const key = keyOf(refs.homeDishes, p.home_dish_id, 'home dish');
    return { foodKey: key, ...base, homeDishKey: key };
  }
  if (p.food_id !== undefined) return { foodKey: keyOf(refs.foods, p.food_id, 'food'), ...base };
  if (p.recipe_id !== undefined) return { foodKey: keyOf(refs.recipes, p.recipe_id, 'recipe'), ...base };
  throw new Error('Portion has no food_id, home_dish_id or recipe_id');
}

/** Home Food portions → home_dish_id; otherwise the key is a food (food_id) or, for eat-out picks, a recipe (recipe_id). */
function portionFromEngine(p: Portion, refs: RefLookup): DbPortion {
  const base = { grams: p.grams, unit: p.unit, qty: p.qty, label: p.label };
  if (p.homeDishKey !== undefined)
    return { home_dish_id: knownId(refs.homeDishes, p.homeDishKey, 'home dish'), ...base };
  const id = refId(p.foodKey);
  if (refs.foods.has(id)) return { food_id: id, ...base };
  if (refs.recipes.has(id)) return { recipe_id: id, ...base };
  throw new Error(`Portion refers to unknown food or recipe key '${p.foodKey}'`);
}

export function toEngineMeal(row: MealItemsRow, refs: RefLookup): PlannedMeal {
  const m: PlannedMeal = {
    id: row.id,
    date: row.date,
    slot: row.slot,
    plannedAt: row.planned_at,
    kind: row.kind,
    multiplier: row.multiplier,
    portions: row.portions.map((p) => portionToEngine(p, refs)),
    addons: row.addons.map((a) => ({ addonKey: a.addon_key, qty: a.qty })),
    nutrition: toEngineNutrition(row.nutrition),
    status: row.status,
    version: row.version,
  };
  if (row.recipe_id !== null) m.recipeSlug = keyOf(refs.recipes, row.recipe_id, 'recipe');
  if (row.home_dish_ids !== null)
    m.homeDishKeys = row.home_dish_ids.map((id) => keyOf(refs.homeDishes, id, 'home dish'));
  if (row.status_at !== null) m.statusAt = row.status_at;
  if (row.replaced_by_log_id !== null) m.replacedByLogId = row.replaced_by_log_id;
  return m;
}

export function fromEngineMeal(
  m: PlannedMeal,
  meta: { userId: string; planDayId: string },
  refs: RefLookup,
): Omit<MealItemsRow, 'created_at' | 'updated_at'> {
  return {
    id: m.id,
    user_id: meta.userId,
    plan_day_id: meta.planDayId,
    date: m.date,
    slot: m.slot,
    planned_at: m.plannedAt,
    kind: m.kind,
    recipe_id: m.recipeSlug === undefined ? null : knownId(refs.recipes, m.recipeSlug, 'recipe'),
    home_dish_ids:
      m.homeDishKeys === undefined ? null : m.homeDishKeys.map((k) => knownId(refs.homeDishes, k, 'home dish')),
    multiplier: m.multiplier,
    portions: m.portions.map((p) => portionFromEngine(p, refs)),
    addons: m.addons.map((a) => ({ addon_key: a.addonKey, qty: a.qty })),
    nutrition: fromEngineNutrition(m.nutrition),
    status: m.status,
    status_at: m.statusAt ?? null,
    replaced_by_log_id: m.replacedByLogId ?? null,
    version: m.version,
  };
}
