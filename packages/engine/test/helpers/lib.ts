// Test helper: loads the seed files + synthetic sample food values IN-PROCESS (testing.md §1: engine tests never
// depend on data:build output). Maps the seed's snake_case JSON onto engine types.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFoodIndex,
  expandTemplates,
  recipeNutrition,
  type ExerciseLib,
  type ExerciseRow,
  type FoodIndex,
  type FoodRow,
  type FoodUnit,
  type HomeDish,
  type ProteinAddon,
  type RecipeIndex,
  type RecipeRow,
  type TemplateSplitSeed,
  type WorkoutTemplate,
} from '../../src/mod.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// The seed JSON is parsed loosely here on purpose (contracts validate it strictly); `any` keeps the mapping short.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

export interface TestLib {
  foods: FoodIndex;
  recipes: RecipeIndex;
  homeDishes: Map<string, HomeDish>;
  addons: ProteinAddon[];
  exercises: ExerciseLib;
  templates: Map<string, WorkoutTemplate>;
  /** Foods marked `staple: true` (T1's pantry). */
  staples: Set<string>;
}

let cached: TestLib | undefined;

export function loadLib(): TestLib {
  if (cached) return cached;
  const map = readJson('data/seed/foods.map.json').foods;
  const sample = new Map<string, Record<string, number>>(
    readJson('data/sample/foods.sample.json').foods.map((f: { key: string }) => [f.key, f]),
  );
  const foods: FoodRow[] = [];
  const units: FoodUnit[] = [];
  for (const f of map) {
    const v = sample.get(f.key);
    if (!v) throw new Error(`no sample value for ${f.key}`);
    foods.push({
      key: f.key,
      name: f.name,
      category: f.category,
      kcal: v.kcal!,
      proteinG: v.protein_g!,
      carbsG: v.carbs_g!,
      fatG: v.fat_g!,
      fiberG: v.fiber_g ?? 0,
      isRaw: f.is_raw,
      yieldFactor: f.yield_factor,
      cookedWithOil: f.cooked_with_oil,
      synthetic: true,
    });
    for (const u of f.units) units.push({ foodKey: f.key, unit: u.unit, grams: u.grams, label: u.label });
  }
  const foodIndex = buildFoodIndex(foods, units);

  const recipes: RecipeIndex = new Map();
  for (const r of readJson('data/seed/recipes.seed.json').recipes) {
    const row: RecipeRow = {
      slug: r.slug,
      name: r.name,
      cuisine: r.cuisine,
      mealSlots: r.meal_slots,
      dietTags: r.diet_tags,
      allergens: r.allergens,
      cookTimeMin: r.cook_time_min,
      costTier: r.cost_tier,
      servings: r.servings,
      oilTsp: r.oil_tsp,
      ...(r.cooked_yield_g !== undefined ? { cookedYieldG: r.cooked_yield_g } : {}),
      ...(r.prep ? { prep: { text: r.prep.text, leadHours: r.prep.lead_hours } } : {}),
      requires: r.requires ?? [],
      ingredients: r.ingredients.map((i: Record<string, unknown>) => ({
        foodKey: i.food,
        grams: i.grams,
        unit: i.unit,
        qty: i.qty,
        role: i.role,
        scalable: i.scalable,
      })),
      steps: r.steps.map((s: { text: string; timer_sec?: number }) =>
        s.timer_sec !== undefined ? { text: s.text, timerSec: s.timer_sec } : { text: s.text },
      ),
      scaleRules: { minMult: r.scale_rules.min_mult, maxMult: r.scale_rules.max_mult, step: r.scale_rules.step },
      proteinAddons: r.protein_addons,
      tags: r.tags,
      isDraft: r.is_draft,
      nutritionPerServing: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    };
    row.nutritionPerServing = recipeNutrition(row, foodIndex, 1);
    recipes.set(row.slug, row);
  }

  const homeDishes = new Map<string, HomeDish>();
  for (const d of readJson('data/seed/home_dishes.seed.json').home_dishes) {
    if (d.needs_recipe || !d.recipe_slug) continue;
    homeDishes.set(d.key, {
      key: d.key,
      name: d.name,
      aliases: d.aliases,
      recipeSlug: d.recipe_slug,
      unit: d.unit,
      gramsPerUnit: d.grams_per_unit,
      category: d.category,
      proteinClass: d.protein_class,
    });
  }

  const addons: ProteinAddon[] = readJson('data/seed/protein_addons.seed.json').protein_addons.map(
    (a: Record<string, unknown>) => ({
      key: a.key,
      name: a.name,
      foodKey: a.food_key,
      unit: a.unit,
      gramsPerUnit: a.grams_per_unit,
      dietTags: a.diet_tags,
      pantryFoodKey: a.pantry_food_key,
    }),
  );

  const byId = new Map<string, ExerciseRow>();
  for (const e of readJson('data/seed/exercises.seed.json').exercises) {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      primaryMuscle: e.primary_muscle,
      secondaryMuscles: e.secondary_muscles,
      movementPattern: e.movement_pattern,
      equipment: e.equipment,
      loadType: e.load_type,
      isMachine: e.is_machine,
      injuryTags: e.injury_tags,
      formCues: e.form_cues,
      startLoadRatio: e.start_load_ratio,
      incrementKg: e.increment_kg,
      repMin: e.rep_min,
      repMax: e.rep_max,
      importance: e.importance,
    });
  }

  const splits: TemplateSplitSeed[] = readJson('data/seed/workout_templates.seed.json').splits;
  const templates = new Map(expandTemplates(splits).map((t) => [t.id, t]));
  const staples = new Set<string>(map.filter((f: { staple: boolean }) => f.staple).map((f: { key: string }) => f.key));

  cached = { foods: foodIndex, recipes, homeDishes, addons, exercises: { byId }, templates, staples };
  return cached;
}
