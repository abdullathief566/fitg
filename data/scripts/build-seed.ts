// build-seed.ts — data/seed/*.json → database seed SQL + the phone's bundled JSON (data-pipeline.md §3).
//
//   npx tsx data/scripts/build-seed.ts --sample   synthetic values from data/sample/foods.sample.json
//                                                  → data/out/sample/seed/*.sql + data/out/sample/bundle/*.json
//   npx tsx data/scripts/build-seed.ts [--prod]   USDA pins + curated values (the default)
//                                                  → supabase/seed/*.sql + apps/mobile/assets/bundle/*.json
//   --out <dir>                                    write <dir>/seed and <dir>/bundle instead
//
// Steps: validate every seed file (Zod) → fail on any unknown or duplicate key → (prod) refuse synthetic values, null
// curated values, draft recipes and needs_recipe dishes, listing every offender → resolve food values → deterministic
// ids (UUIDv5 of the stable key) → expand the template splits into six rows → nutrition_per_serving from the engine's
// recipeNutrition (never typed by hand) → validate (oil_tsp, cooked_yield_g, scale rules, column precision) →
// idempotent SQL (insert … on conflict (id) do update) + bundle JSON with a bundle_version (hash32 of the content).
// Nothing is written unless every step passes. Sample builds never write into apps/ or supabase/.
//
// Child-row ids (not addressed by keys elsewhere) are also deterministic: food_aliases = UUIDv5('food_alias:<food>:<alias>'),
// food_units = UUIDv5('food_unit:<food>:<unit>'), recipe_ingredients = UUIDv5('recipe_ingredient:<slug>:<index>').
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { hash32, recipeOilTsp, refId, templateName } from '@fitg/engine';
import {
  BUNDLE_FILE_SCHEMAS,
  ExercisesRowSchema,
  FoodAliasesRowSchema,
  FoodUnitsRowSchema,
  FoodsRowSchema,
  HomeDishesRowSchema,
  ProteinAddonsRowSchema,
  RecipeIngredientsRowSchema,
  RecipesRowSchema,
  SEED_FILE_NAMES,
  SeedDataError,
  WorkoutTemplatesRowSchema,
  buildReference,
  findSeedProblems,
  fromEngineNutrition,
  issueLines,
  parseSeedFiles,
  sampleFoodValues,
  type FoodValues,
  type ReferenceLib,
  type SeedFiles,
  type UsdaPinsFile,
} from '@fitg/contracts';
import type { z } from 'zod';
import { loadPinnedValues, readPinsFile } from './import-usda.ts';
import { REPO_ROOT, argValues, isMain, readJsonFile, writeJsonFile } from './util.ts';

export type BuildMode = 'sample' | 'prod';

export interface BuildSeedOptions {
  mode: BuildMode;
  /** Repository root (holds data/seed, data/sample, data/raw/usda). */
  root: string;
  /** Write `<outDir>/seed/*.sql` and `<outDir>/bundle/*.json` instead of the mode's default folders. */
  outDir?: string;
}

export interface BuildSeedResult {
  mode: BuildMode;
  bundle_version: string;
  counts: {
    foods: number;
    food_aliases: number;
    food_units: number;
    recipes: number;
    recipe_ingredients: number;
    home_dishes: number;
    protein_addons: number;
    exercises: number;
    templates: number;
  };
  skipped: { home_dishes: string[] };
  warnings: string[];
  sqlDir: string;
  bundleDir: string;
  /** Absolute paths of every file written. */
  files: string[];
}

export const SQL_FILES = [
  '01_foods.sql',
  '02_recipes.sql',
  '03_home_dishes.sql',
  '04_protein_addons.sql',
  '05_exercises.sql',
  '06_templates.sql',
] as const;

// ───────────────────────── SQL literals ─────────────────────────

/** A single-quoted SQL string (quotes doubled; standard_conforming_strings, so backslashes are literal). */
export function sqlString(s: string): string {
  if (s.includes('\u0000')) throw new Error(`NUL byte in a seed string: ${JSON.stringify(s)}`);
  return `'${s.replaceAll("'", "''")}'`;
}

export function sqlNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Not a finite number: ${n}`);
  return String(n);
}

/** `array[…]::<type>[]`, or `'{}'::<type>[]` when empty. */
export function sqlArray(xs: ReadonlyArray<string | number>, elemType: string): string {
  if (xs.length === 0) return `'{}'::${elemType}[]`;
  return `array[${xs.map((x) => (typeof x === 'number' ? sqlNumber(x) : sqlString(x))).join(', ')}]::${elemType}[]`;
}

export function sqlJson(v: unknown): string {
  return `${sqlString(JSON.stringify(v))}::jsonb`;
}

type SqlKind = 'text' | 'number' | 'boolean' | 'json' | { array: string };
interface Column {
  name: string;
  kind: SqlKind;
}

function renderValue(v: unknown, kind: SqlKind, where: string): string {
  if (v === null) return 'null';
  if (kind === 'text' && typeof v === 'string') return sqlString(v);
  if (kind === 'number' && typeof v === 'number') return sqlNumber(v);
  if (kind === 'boolean' && typeof v === 'boolean') return v ? 'true' : 'false';
  if (kind === 'json') return sqlJson(v);
  if (typeof kind === 'object' && Array.isArray(v)) return sqlArray(v as Array<string | number>, kind.array);
  throw new Error(`${where}: can't write ${JSON.stringify(v)} as ${JSON.stringify(kind)}`);
}

/** `insert … values … on conflict (…) do update set <every other column> = excluded.<column>;` */
export function upsertSql(
  table: string,
  cols: readonly Column[],
  rows: ReadonlyArray<Record<string, unknown>>,
  conflict: readonly string[],
): string {
  if (rows.length === 0) return `-- ${table}: no rows\n`;
  const values = rows
    .map((r, i) => {
      const cells = cols.map((c) => {
        if (!(c.name in r)) throw new Error(`${table} row ${i}: missing column ${c.name}`);
        return renderValue(r[c.name], c.kind, `${table}.${c.name}`);
      });
      return `  (${cells.join(', ')})`;
    })
    .join(',\n');
  const updates = cols
    .filter((c) => !conflict.includes(c.name))
    .map((c) => `  ${c.name} = excluded.${c.name}`)
    .join(',\n');
  return `insert into ${table} (${cols.map((c) => c.name).join(', ')})\nvalues\n${values}\non conflict (${conflict.join(', ')}) do update set\n${updates};\n`;
}

/** Deletes child rows of the seeded parents that are no longer in the seed (so a reseed replaces them exactly). */
export function pruneSql(
  table: string,
  parentCol: string,
  parentIds: readonly string[],
  keepIds: readonly string[],
): string {
  if (parentIds.length === 0) return '';
  const parents = parentIds.map(sqlString).join(', ');
  if (keepIds.length === 0) return `delete from ${table} where ${parentCol} in (${parents});\n`;
  return `delete from ${table} where ${parentCol} in (${parents})\n  and id not in (${keepIds.map(sqlString).join(', ')});\n`;
}

const t = (name: string): Column => ({ name, kind: 'text' });
const n = (name: string): Column => ({ name, kind: 'number' });
const b = (name: string): Column => ({ name, kind: 'boolean' });
const j = (name: string): Column => ({ name, kind: 'json' });
const a = (name: string, elem: string): Column => ({ name, kind: { array: elem } });

const COLUMNS = {
  foods: [
    t('id'),
    t('key'),
    t('source'),
    t('source_id'),
    t('name'),
    t('name_hi'),
    t('category'),
    n('kcal'),
    n('protein_g'),
    n('carbs_g'),
    n('fat_g'),
    n('fiber_g'),
    b('is_raw'),
    n('yield_factor'),
    b('is_generic'),
    b('cooked_with_oil'),
  ],
  food_aliases: [t('id'), t('food_id'), t('alias'), t('lang')],
  food_units: [t('id'), t('food_id'), t('unit'), n('grams'), t('label')],
  recipes: [
    t('id'),
    t('slug'),
    t('name'),
    t('cuisine'),
    a('meal_slots', 'slot_t'),
    a('diet_tags', 'diet_t'),
    a('allergens', 'text'),
    n('cook_time_min'),
    n('cost_tier'),
    n('servings'),
    j('steps'),
    n('oil_tsp'),
    n('cooked_yield_g'),
    j('nutrition_per_serving'),
    j('scale_rules'),
    a('protein_addon_keys', 'text'),
    a('tags', 'text'),
    a('requires', 'text'),
    j('prep'),
    b('is_draft'),
  ],
  recipe_ingredients: [
    t('id'),
    t('recipe_id'),
    t('food_id'),
    n('grams'),
    t('household_unit'),
    n('household_qty'),
    t('role'),
    b('scalable'),
    n('sort'),
  ],
  home_dishes: [
    t('id'),
    t('key'),
    t('name'),
    a('aliases', 'text'),
    t('recipe_id'),
    t('unit'),
    n('grams_per_unit'),
    t('category'),
    t('protein_class'),
  ],
  protein_addons: [
    t('id'),
    t('key'),
    t('name'),
    t('food_id'),
    t('unit'),
    n('grams_per_unit'),
    a('diet_tags', 'diet_t'),
    t('pantry_food_id'),
  ],
  // `level` and `image_paths` keep their database values (defaults now; images arrive in Phase 2+).
  exercises: [
    t('id'),
    t('source_name'),
    t('name'),
    t('primary_muscle'),
    a('secondary_muscles', 'text'),
    t('movement_pattern'),
    a('equipment', 'text'),
    t('load_type'),
    b('is_machine'),
    a('injury_tags', 'text'),
    a('form_cues', 'text'),
    n('start_load_ratio'),
    n('increment_kg'),
    n('rep_min'),
    n('rep_max'),
    n('importance'),
  ],
  workout_templates: [t('id'), t('name'), a('days_per_week', 'int'), t('split'), t('variant'), j('sessions')],
} satisfies Record<string, Column[]>;

// ───────────────────────── reading the seed ─────────────────────────

/** Reads and validates the six seed files under `<root>/data/seed/` (one error listing every problem). */
export function readSeedFiles(root: string): SeedFiles {
  const problems: string[] = [];
  const raw: Partial<Record<keyof SeedFiles, unknown>> = {};
  for (const [part, file] of Object.entries(SEED_FILE_NAMES) as Array<[keyof SeedFiles, string]>) {
    const path = join(root, 'data/seed', file);
    if (!existsSync(path)) {
      problems.push(`missing seed file data/seed/${file}`);
      continue;
    }
    try {
      raw[part] = readJsonFile(path);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  if (problems.length > 0) throw new SeedDataError('Seed files could not be read:', problems);
  return parseSeedFiles(raw as Record<keyof SeedFiles, unknown>);
}

// ───────────────────────── production refusals ─────────────────────────

const CURATED_FIELDS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const;

/**
 * `--prod` refuses null curated values, draft recipes, needs_recipe dishes and USDA foods without a confirmed pin
 * (and pins that don't fit). One line per offender.
 */
export function prodSeedRefusals(seeds: SeedFiles, pins: UsdaPinsFile | null): string[] {
  const out: string[] = [];
  const foods = new Map(seeds.foodsMap.foods.map((f) => [f.key, f]));
  const pinned = new Set<string>();
  const byFdc = new Map<string, string[]>();
  for (const p of pins?.pins ?? []) {
    if (pinned.has(p.key)) out.push(`usda_pins.json: '${p.key}' is pinned twice`);
    pinned.add(p.key);
    const food = foods.get(p.key);
    if (!food) out.push(`usda_pins.json: pin for unknown food key '${p.key}'`);
    else if (food.usda_query === null)
      out.push(`usda_pins.json: '${p.key}' is a curated food (usda_query null) but has a USDA pin`);
    const fdc = String(p.fdc_id);
    byFdc.set(fdc, [...(byFdc.get(fdc) ?? []), p.key]);
  }
  for (const [fdc, keys] of byFdc) {
    if (keys.length > 1)
      out.push(`usda_pins.json: fdc_id ${fdc} is pinned for ${keys.join(' and ')} (foods.source_id must be unique)`);
  }
  for (const f of seeds.foodsMap.foods) {
    if (f.usda_query !== null) {
      if (!pinned.has(f.key))
        out.push(
          `foods.map.json: '${f.key}' has no USDA pin yet — run \`npm run data:import-usda\` and confirm a match`,
        );
    } else {
      const nulls = CURATED_FIELDS.filter((k) => f.curated[k] === null);
      if (nulls.length > 0) out.push(`foods.map.json: '${f.key}' curated values are still null (${nulls.join(', ')})`);
    }
  }
  for (const r of seeds.recipes.recipes) {
    if (r.is_draft) out.push(`recipes.seed.json: '${r.slug}' is a draft (is_draft: true) — approve it or remove it`);
  }
  for (const d of seeds.homeDishes.home_dishes) {
    if (d.needs_recipe)
      out.push(`home_dishes.seed.json: '${d.key}' needs a recipe (needs_recipe: true) — add one or remove the dish`);
  }
  return out;
}

/** `--prod` refuses any synthetic (sample) value. */
export function syntheticValueRefusals(values: ReadonlyMap<string, FoodValues>): string[] {
  return [...values]
    .filter(([, v]) => v.synthetic === true)
    .map(([k]) => `food '${k}' has synthetic (sample) nutrition values`);
}

// ───────────────────────── values ─────────────────────────

interface FoodSource {
  source: 'usda' | 'curated';
  sourceId: string | null;
}

function resolveValues(mode: BuildMode, root: string, seeds: SeedFiles, pins: UsdaPinsFile | null) {
  const sources = new Map<string, FoodSource>();
  const warnings: string[] = [];
  if (mode === 'sample') {
    const values = sampleFoodValues(readJsonFile(join(root, 'data/sample/foods.sample.json')));
    for (const f of seeds.foodsMap.foods)
      sources.set(f.key, { source: f.usda_query === null ? 'curated' : 'usda', sourceId: null });
    return { values, sources, warnings };
  }
  const values = new Map<string, FoodValues>();
  const usdaKeys = new Set(seeds.foodsMap.foods.filter((f) => f.usda_query !== null).map((f) => f.key));
  const usdaPins = (pins?.pins ?? []).filter((p) => usdaKeys.has(p.key));
  const pinned = loadPinnedValues(join(root, 'data/raw/usda'), usdaPins);
  if (pinned.problems.length > 0)
    throw new SeedDataError('Production build refused — USDA values could not be resolved:', pinned.problems);
  warnings.push(...pinned.warnings);
  for (const p of usdaPins) sources.set(p.key, { source: 'usda', sourceId: String(p.fdc_id) });
  for (const [k, v] of pinned.values) values.set(k, v);
  for (const f of seeds.foodsMap.foods) {
    if (f.usda_query !== null) continue;
    const c = f.curated;
    // prodSeedRefusals already guaranteed non-null values.
    values.set(f.key, {
      kcal: c.kcal ?? NaN,
      protein_g: c.protein_g ?? NaN,
      carbs_g: c.carbs_g ?? NaN,
      fat_g: c.fat_g ?? NaN,
      fiber_g: c.fiber_g ?? NaN,
    });
    sources.set(f.key, { source: 'curated', sourceId: null });
  }
  return { values, sources, warnings };
}

// ───────────────────────── validation ─────────────────────────

/** data-pipeline.md §3 step 6, on the built library. Errors fail the build; warnings are printed. */
export function validateReference(seeds: SeedFiles, lib: ReferenceLib): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  for (const r of seeds.recipes.recipes) {
    const row = lib.recipes.get(r.slug)!;
    if (row.mealSlots.length === 0) problems.push(`recipes.seed.json: '${r.slug}' has no meal slot`);
    if (row.dietTags.length === 0) problems.push(`recipes.seed.json: '${r.slug}' has no diet tag`);
    const oil = recipeOilTsp(row, lib.foods, 1);
    if (Math.abs(oil - row.oilTsp) > 1e-6) {
      problems.push(
        `recipes.seed.json: '${r.slug}' has oil_tsp ${row.oilTsp} but its oil/ghee ingredients add up to ${Number(oil.toFixed(3))} tsp`,
      );
    }
    const s = row.scaleRules;
    if (!(s.minMult > 0 && s.minMult <= s.maxMult && s.step > 0)) {
      problems.push(`recipes.seed.json: '${r.slug}' scale_rules need 0 < min_mult ≤ max_mult and step > 0`);
    }
    r.ingredients.forEach((ing, i) => {
      const units = lib.foods.get(ing.food)!.units;
      const per =
        ing.unit === 'g' || ing.unit === 'ml'
          ? (units.find((u) => u.unit === ing.unit)?.grams ?? 1)
          : units.find((u) => u.unit === ing.unit)?.grams;
      if (per === undefined) return;
      const expected = per * ing.qty;
      if (Math.abs(ing.grams - expected) > 0.02 * expected) {
        warnings.push(
          `recipes.seed.json: '${r.slug}' ingredient ${i} (${ing.food}) is ${ing.grams} g but ${ing.qty} ${ing.unit} = ${Number(expected.toFixed(2))} g`,
        );
      }
    });
  }
  for (const dish of lib.homeDishes.values()) {
    const recipe = lib.recipes.get(dish.recipeSlug)!;
    if (recipe.cookedYieldG === undefined) {
      problems.push(`home_dishes.seed.json: '${dish.key}' uses recipe '${recipe.slug}', which has no cooked_yield_g`);
    }
  }
  return { problems, warnings };
}

/** Fits a Postgres numeric(precision, scale) without rounding? */
function fitsNumeric(x: number, precision: number, scale: number): boolean {
  return Number.isFinite(x) && Math.abs(x) < 10 ** (precision - scale) && Number(x.toFixed(scale)) === x;
}

// ───────────────────────── rows ─────────────────────────

interface Rows {
  foods: Array<Record<string, unknown>>;
  food_aliases: Array<Record<string, unknown>>;
  food_units: Array<Record<string, unknown>>;
  recipes: Array<Record<string, unknown>>;
  recipe_ingredients: Array<Record<string, unknown>>;
  home_dishes: Array<Record<string, unknown>>;
  protein_addons: Array<Record<string, unknown>>;
  exercises: Array<Record<string, unknown>>;
  workout_templates: Array<Record<string, unknown>>;
}

function buildRows(
  seeds: SeedFiles,
  lib: ReferenceLib,
  sources: ReadonlyMap<string, FoodSource>,
): { rows: Rows; problems: string[] } {
  const problems: string[] = [];
  const precision = (table: string, key: string, col: string, x: number | null, p: number, s: number): void => {
    if (x !== null && !fitsNumeric(x, p, s))
      problems.push(`${table} '${key}': ${col} ${x} doesn't fit numeric(${p},${s})`);
  };
  const rows: Rows = {
    foods: [],
    food_aliases: [],
    food_units: [],
    recipes: [],
    recipe_ingredients: [],
    home_dishes: [],
    protein_addons: [],
    exercises: [],
    workout_templates: [],
  };

  for (const f of seeds.foodsMap.foods) {
    const food = lib.foods.get(f.key)!.food;
    const src = sources.get(f.key)!;
    const id = refId(f.key);
    rows.foods.push({
      id,
      key: f.key,
      source: src.source,
      source_id: src.sourceId,
      name: f.name,
      name_hi: f.aliases.find(([, lang]) => lang === 'hi')?.[0] ?? null,
      category: f.category,
      kcal: food.kcal,
      protein_g: food.proteinG,
      carbs_g: food.carbsG,
      fat_g: food.fatG,
      fiber_g: food.fiberG,
      is_raw: f.is_raw,
      yield_factor: f.yield_factor,
      is_generic: false,
      cooked_with_oil: f.cooked_with_oil,
    });
    precision('foods', f.key, 'kcal', food.kcal, 7, 2);
    for (const [col, v] of [
      ['protein_g', food.proteinG],
      ['carbs_g', food.carbsG],
      ['fat_g', food.fatG],
      ['fiber_g', food.fiberG],
    ] as const) {
      precision('foods', f.key, col, v, 6, 2);
    }
    precision('foods', f.key, 'yield_factor', f.yield_factor, 5, 2);
    for (const [alias, lang] of f.aliases) {
      rows.food_aliases.push({ id: refId(`food_alias:${f.key}:${alias}`), food_id: id, alias, lang });
    }
    for (const u of f.units) {
      rows.food_units.push({
        id: refId(`food_unit:${f.key}:${u.unit}`),
        food_id: id,
        unit: u.unit,
        grams: u.grams,
        label: u.label,
      });
      precision('food_units', `${f.key}:${u.unit}`, 'grams', u.grams, 7, 2);
    }
  }

  for (const r of seeds.recipes.recipes) {
    const row = lib.recipes.get(r.slug)!;
    const id = refId(r.slug);
    rows.recipes.push({
      id,
      slug: r.slug,
      name: r.name,
      cuisine: r.cuisine,
      meal_slots: r.meal_slots,
      diet_tags: r.diet_tags,
      allergens: r.allergens,
      cook_time_min: r.cook_time_min,
      cost_tier: r.cost_tier,
      servings: r.servings,
      steps: r.steps.map((s) =>
        s.timer_sec === undefined ? { text: s.text } : { text: s.text, timer_sec: s.timer_sec },
      ),
      oil_tsp: r.oil_tsp,
      cooked_yield_g: r.cooked_yield_g ?? null,
      nutrition_per_serving: fromEngineNutrition(row.nutritionPerServing),
      scale_rules: { min_mult: r.scale_rules.min_mult, max_mult: r.scale_rules.max_mult, step: r.scale_rules.step },
      protein_addon_keys: r.protein_addons,
      tags: r.tags,
      requires: r.requires ?? [],
      prep: r.prep === undefined ? null : { text: r.prep.text, lead_hours: r.prep.lead_hours },
      is_draft: r.is_draft,
    });
    precision('recipes', r.slug, 'oil_tsp', r.oil_tsp, 4, 2);
    precision('recipes', r.slug, 'cooked_yield_g', r.cooked_yield_g ?? null, 7, 1);
    r.ingredients.forEach((ing, i) => {
      rows.recipe_ingredients.push({
        id: refId(`recipe_ingredient:${r.slug}:${i}`),
        recipe_id: id,
        food_id: refId(ing.food),
        grams: ing.grams,
        household_unit: ing.unit,
        household_qty: ing.qty,
        role: ing.role,
        scalable: ing.scalable,
        sort: i,
      });
      precision('recipe_ingredients', `${r.slug}:${i}`, 'grams', ing.grams, 7, 2);
      precision('recipe_ingredients', `${r.slug}:${i}`, 'household_qty', ing.qty, 5, 2);
    });
  }

  for (const d of seeds.homeDishes.home_dishes) {
    const dish = lib.homeDishes.get(d.key);
    if (!dish) continue; // needs_recipe: skipped
    rows.home_dishes.push({
      id: refId(d.key),
      key: d.key,
      name: d.name,
      aliases: d.aliases,
      recipe_id: refId(dish.recipeSlug),
      unit: d.unit,
      grams_per_unit: d.grams_per_unit,
      category: d.category,
      protein_class: d.protein_class,
    });
    precision('home_dishes', d.key, 'grams_per_unit', d.grams_per_unit, 7, 2);
  }

  for (const ad of seeds.addons.protein_addons) {
    rows.protein_addons.push({
      id: refId(ad.key),
      key: ad.key,
      name: ad.name,
      food_id: refId(ad.food_key),
      unit: ad.unit,
      grams_per_unit: ad.grams_per_unit,
      diet_tags: ad.diet_tags,
      pantry_food_id: refId(ad.pantry_food_key),
    });
    precision('protein_addons', ad.key, 'grams_per_unit', ad.grams_per_unit, 7, 2);
  }

  for (const e of seeds.exercises.exercises) {
    rows.exercises.push({
      id: e.id,
      source_name: e.source_name,
      name: e.name,
      primary_muscle: e.primary_muscle,
      secondary_muscles: e.secondary_muscles,
      movement_pattern: e.movement_pattern,
      equipment: e.equipment,
      load_type: e.load_type,
      is_machine: e.is_machine,
      injury_tags: e.injury_tags,
      form_cues: e.form_cues,
      start_load_ratio: e.start_load_ratio,
      increment_kg: e.increment_kg,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      importance: e.importance,
    });
    precision('exercises', e.id, 'start_load_ratio', e.start_load_ratio, 4, 3);
    precision('exercises', e.id, 'increment_kg', e.increment_kg, 4, 2);
  }

  for (const tpl of lib.templates) {
    rows.workout_templates.push({
      id: tpl.id,
      name: templateName(tpl),
      days_per_week: tpl.daysPerWeek,
      split: tpl.split,
      variant: tpl.variant,
      sessions: tpl.sessions,
    });
  }

  // Every row must be a valid database row (contracts' row schemas). Exercises get the two DB-default columns.
  const check = (
    table: string,
    schema: z.ZodType,
    list: ReadonlyArray<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ): void => {
    list.forEach((row, i) => {
      const r = schema.safeParse({ ...row, ...extra });
      if (!r.success) problems.push(...issueLines(`${table}[${i}]`, r.error));
    });
  };
  check('foods', FoodsRowSchema, rows.foods);
  check('food_aliases', FoodAliasesRowSchema, rows.food_aliases);
  check('food_units', FoodUnitsRowSchema, rows.food_units);
  check('recipes', RecipesRowSchema, rows.recipes);
  check('recipe_ingredients', RecipeIngredientsRowSchema, rows.recipe_ingredients);
  check('home_dishes', HomeDishesRowSchema, rows.home_dishes);
  check('protein_addons', ProteinAddonsRowSchema, rows.protein_addons);
  check('exercises', ExercisesRowSchema, rows.exercises, { level: 'beginner', image_paths: [] });
  check('workout_templates', WorkoutTemplatesRowSchema, rows.workout_templates);
  return { rows, problems };
}

// ───────────────────────── bundle ─────────────────────────

function bundleContent(seeds: SeedFiles, lib: ReferenceLib) {
  return {
    foods: seeds.foodsMap.foods.map((f) => {
      const entry = lib.foods.get(f.key)!;
      return { id: refId(f.key), ...entry.food, units: entry.units };
    }),
    recipes: seeds.recipes.recipes.map((r) => ({ id: refId(r.slug), ...lib.recipes.get(r.slug)! })),
    home_dishes: seeds.homeDishes.home_dishes.flatMap((d) => {
      const dish = lib.homeDishes.get(d.key);
      return dish ? [{ id: refId(d.key), ...dish }] : [];
    }),
    protein_addons: lib.addons.map((ad) => ({ id: refId(ad.key), ...ad })),
    exercises: seeds.exercises.exercises.map((e) => lib.exercises.byId.get(e.id)!),
    templates: lib.templates.map((tpl) => ({ ...tpl, name: templateName(tpl) })),
  };
}

/** 8 hex chars of FNV-1a over the bundle content (same content → same version). */
export function bundleVersionOf(content: unknown): string {
  return hash32(JSON.stringify(content)).toString(16).padStart(8, '0');
}

// ───────────────────────── output ─────────────────────────

function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function outputDirs(mode: BuildMode, root: string, outDir?: string): { sqlDir: string; bundleDir: string } {
  const dirs =
    outDir !== undefined
      ? { sqlDir: join(outDir, 'seed'), bundleDir: join(outDir, 'bundle') }
      : mode === 'prod'
        ? { sqlDir: join(root, 'supabase/seed'), bundleDir: join(root, 'apps/mobile/assets/bundle') }
        : { sqlDir: join(root, 'data/out/sample/seed'), bundleDir: join(root, 'data/out/sample/bundle') };
  if (mode === 'sample') {
    for (const d of [dirs.sqlDir, dirs.bundleDir]) {
      if (isInside(d, join(root, 'apps')) || isInside(d, join(root, 'supabase'))) {
        throw new Error(`Sample builds never write into apps/ or supabase/ (refused: ${d})`);
      }
    }
  }
  return dirs;
}

function sqlFile(mode: BuildMode, version: string, title: string, statements: string[]): string {
  const header = [
    `-- FitG reference seed: ${title}`,
    `-- Generated by data/scripts/build-seed.ts (mode: ${mode}). Do not edit by hand.`,
    `-- bundle_version: ${version}`,
    '-- Idempotent: rows are upserted by id (UUIDv5 of the stable key); child rows of seeded parents that are no',
    '-- longer in the seed are deleted. Reference rows removed from the seed are NOT deleted (other rows point at them).',
    ...(mode === 'sample'
      ? ['-- SAMPLE BUILD: synthetic nutrition values and draft recipes. Never load this into production.']
      : []),
  ];
  return [...header, '', 'begin;', '', ...statements.filter((s) => s !== ''), 'commit;', ''].join('\n');
}

// ───────────────────────── the build ─────────────────────────

export function buildSeed(opts: BuildSeedOptions): BuildSeedResult {
  const { mode, root } = opts;
  const { sqlDir, bundleDir } = outputDirs(mode, root, opts.outDir);

  // 1. Load and validate every seed file.
  const seeds = readSeedFiles(root);

  // 2 + 8. Unknown/duplicate keys always fail; --prod also refuses unfinished data. Every offender is listed.
  const problems = findSeedProblems(seeds);
  const pins = mode === 'prod' ? readPinsFile(join(root, 'data/seed/usda_pins.json')) : null;
  if (mode === 'prod') problems.push(...prodSeedRefusals(seeds, pins));
  if (problems.length > 0) {
    throw new SeedDataError(
      mode === 'prod'
        ? 'Production build refused — fix every item below (or build with --sample):'
        : 'Seed build failed:',
      problems,
    );
  }

  // 2. Resolve food values.
  const { values, sources, warnings } = resolveValues(mode, root, seeds, pins);
  if (mode === 'prod') {
    const synthetic = syntheticValueRefusals(values);
    if (synthetic.length > 0) throw new SeedDataError('Production build refused — synthetic values:', synthetic);
  }

  // 3–5. Ids, templates, nutrition (buildReference checks keys again and every food's values).
  const { lib, skippedHomeDishes } = buildReference(seeds, values);

  // 6. Validate.
  const v = validateReference(seeds, lib);
  warnings.push(...v.warnings);
  const built = buildRows(seeds, lib, sources);
  const errors = [...v.problems, ...built.problems];
  if (errors.length > 0) throw new SeedDataError('Seed build failed validation:', errors);

  if (mode === 'sample') {
    warnings.unshift(
      'sample build: nutrition values are synthetic (data/sample/foods.sample.json) — for tests and local runs only',
    );
    const drafts = seeds.recipes.recipes.filter((r) => r.is_draft).map((r) => r.slug);
    if (drafts.length > 0) warnings.push(`sample build: kept ${drafts.length} draft recipe(s): ${drafts.join(', ')}`);
  }
  if (skippedHomeDishes.length > 0) {
    warnings.push(
      `skipped ${skippedHomeDishes.length} home dish(es) that still need a recipe: ${skippedHomeDishes.join(', ')}`,
    );
  }

  // 7. SQL + bundle.
  const content = bundleContent(seeds, lib);
  const version = bundleVersionOf(content);
  const { rows } = built;
  const foodIds = rows.foods.map((r) => r.id as string);
  const recipeIds = rows.recipes.map((r) => r.id as string);
  const sql: Record<(typeof SQL_FILES)[number], string> = {
    '01_foods.sql': sqlFile(mode, version, 'foods, food_aliases, food_units', [
      upsertSql('foods', COLUMNS.foods, rows.foods, ['id']),
      pruneSql(
        'food_aliases',
        'food_id',
        foodIds,
        rows.food_aliases.map((r) => r.id as string),
      ),
      upsertSql('food_aliases', COLUMNS.food_aliases, rows.food_aliases, ['id']),
      pruneSql(
        'food_units',
        'food_id',
        foodIds,
        rows.food_units.map((r) => r.id as string),
      ),
      upsertSql('food_units', COLUMNS.food_units, rows.food_units, ['id']),
    ]),
    '02_recipes.sql': sqlFile(mode, version, 'recipes, recipe_ingredients', [
      upsertSql('recipes', COLUMNS.recipes, rows.recipes, ['id']),
      pruneSql(
        'recipe_ingredients',
        'recipe_id',
        recipeIds,
        rows.recipe_ingredients.map((r) => r.id as string),
      ),
      upsertSql('recipe_ingredients', COLUMNS.recipe_ingredients, rows.recipe_ingredients, ['id']),
    ]),
    '03_home_dishes.sql': sqlFile(mode, version, 'home_dishes', [
      upsertSql('home_dishes', COLUMNS.home_dishes, rows.home_dishes, ['id']),
    ]),
    '04_protein_addons.sql': sqlFile(mode, version, 'protein_addons', [
      upsertSql('protein_addons', COLUMNS.protein_addons, rows.protein_addons, ['id']),
    ]),
    '05_exercises.sql': sqlFile(mode, version, 'exercises', [
      upsertSql('exercises', COLUMNS.exercises, rows.exercises, ['id']),
    ]),
    '06_templates.sql': sqlFile(mode, version, 'workout_templates', [
      upsertSql('workout_templates', COLUMNS.workout_templates, rows.workout_templates, ['id']),
    ]),
  };

  const counts = {
    foods: rows.foods.length,
    food_aliases: rows.food_aliases.length,
    food_units: rows.food_units.length,
    recipes: rows.recipes.length,
    recipe_ingredients: rows.recipe_ingredients.length,
    home_dishes: rows.home_dishes.length,
    protein_addons: rows.protein_addons.length,
    exercises: rows.exercises.length,
    templates: rows.workout_templates.length,
  };
  const bundleFiles: Record<keyof typeof BUNDLE_FILE_SCHEMAS, unknown> = {
    'foods.json': { bundle_version: version, foods: content.foods },
    'recipes.json': { bundle_version: version, recipes: content.recipes },
    'home_dishes.json': { bundle_version: version, home_dishes: content.home_dishes },
    'protein_addons.json': { bundle_version: version, protein_addons: content.protein_addons },
    'exercises.json': { bundle_version: version, exercises: content.exercises },
    'templates.json': { bundle_version: version, templates: content.templates },
    'manifest.json': {
      bundle_version: version,
      mode,
      counts: {
        foods: counts.foods,
        recipes: counts.recipes,
        home_dishes: counts.home_dishes,
        protein_addons: counts.protein_addons,
        exercises: counts.exercises,
        templates: counts.templates,
      },
      files: [
        'foods.json',
        'recipes.json',
        'home_dishes.json',
        'protein_addons.json',
        'exercises.json',
        'templates.json',
      ],
    },
  };
  // Self-check: every bundle file matches its contracts schema before anything is written.
  const bundleProblems = (Object.keys(bundleFiles) as Array<keyof typeof BUNDLE_FILE_SCHEMAS>).flatMap((f) => {
    const r = BUNDLE_FILE_SCHEMAS[f].safeParse(bundleFiles[f]);
    return r.success ? [] : issueLines(f, r.error);
  });
  if (bundleProblems.length > 0) throw new SeedDataError('Bundle failed its schema check:', bundleProblems);

  // Write (only now — a failed build leaves no partial output).
  mkdirSync(sqlDir, { recursive: true });
  mkdirSync(bundleDir, { recursive: true });
  const files: string[] = [];
  for (const name of SQL_FILES) {
    const path = join(sqlDir, name);
    writeFileSync(path, sql[name]);
    files.push(path);
  }
  for (const [name, data] of Object.entries(bundleFiles)) {
    const path = join(bundleDir, name);
    writeJsonFile(path, data);
    files.push(path);
  }

  return {
    mode,
    bundle_version: version,
    counts,
    skipped: { home_dishes: skippedHomeDishes },
    warnings,
    sqlDir,
    bundleDir,
    files,
  };
}

// ───────────────────────── CLI ─────────────────────────

export interface CliIO {
  log: (line: string) => void;
  error: (line: string) => void;
}
const consoleIO: CliIO = { log: (l) => console.log(l), error: (l) => console.error(l) };

/** The CLI (`--sample` | `--prod`, default prod; `--out <dir>`). Returns the exit code; a refused build prints every offender. */
export function runBuildSeed(
  argv: readonly string[],
  opts: { root: string; io?: CliIO } = { root: REPO_ROOT },
): number {
  const io = opts.io ?? consoleIO;
  const sample = argv.includes('--sample');
  const prod = argv.includes('--prod');
  if (sample && prod) {
    io.error('Pick one: --sample or --prod');
    return 1;
  }
  const mode: BuildMode = sample ? 'sample' : 'prod';
  const outDir = argValues(argv, '--out')[0];
  let r: BuildSeedResult;
  try {
    r = buildSeed({ mode, root: opts.root, ...(outDir !== undefined ? { outDir: resolve(outDir) } : {}) });
  } catch (e) {
    if (e instanceof SeedDataError) {
      io.error(e.message);
      return 1;
    }
    throw e;
  }
  const c = r.counts;
  io.log(`FitG seed build (${r.mode}) — bundle_version ${r.bundle_version}`);
  io.log(
    `  foods ${c.foods} (aliases ${c.food_aliases}, units ${c.food_units}) · recipes ${c.recipes} (ingredients ${c.recipe_ingredients}) · ` +
      `home dishes ${c.home_dishes} (${r.skipped.home_dishes.length} skipped) · add-ons ${c.protein_addons} · exercises ${c.exercises} · templates ${c.templates}`,
  );
  io.log(`  SQL    → ${relative(opts.root, r.sqlDir) || '.'} (${SQL_FILES.length} files)`);
  io.log(`  bundle → ${relative(opts.root, r.bundleDir) || '.'} (${r.files.length - SQL_FILES.length} files)`);
  if (r.warnings.length > 0) {
    io.log('Warnings:');
    for (const w of r.warnings) io.log(`  - ${w}`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = runBuildSeed(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).stack ?? String(e));
    process.exitCode = 1;
  }
}
