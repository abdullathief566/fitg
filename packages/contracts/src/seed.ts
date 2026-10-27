// Seed files (data-pipeline.md §2): every file is a wrapper `{ _note?: string, <list>: [...] }`.
// Plus the integrity checks shared by loadReferenceLib and build-seed (unknown keys, duplicates, missing units).
import { z } from 'zod';
import {
  AliasLangSchema,
  CostTierSchema,
  CuisineSchema,
  DietSchema,
  HomeDishCategorySchema,
  ImportanceSchema,
  IngredientRoleSchema,
  InjurySchema,
  LoadTypeSchema,
  MovementPatternSchema,
  ProteinClassSchema,
  RecipeSlugSchema,
  SlotSchema,
  SnakeKeySchema,
  SplitSchema,
  TemplateKeySchema,
  UnitSchema,
} from './common.ts';
import {
  ExerciseRowSchema,
  FoodRowSchema,
  FoodUnitSchema,
  HomeDishSchema,
  ProteinAddonSchema,
  RecipeRowSchema,
  WorkoutTemplateSchema,
} from './engine.ts';

const Note = z.string().optional();

// ───────────────────────── foods.map.json ─────────────────────────

/** Founder-curated values per 100 g; numbers stay null until filled from a label or a cited reference. */
export const CuratedValuesSchema = z.strictObject({
  kcal: z.number().nonnegative().nullable(),
  protein_g: z.number().nonnegative().nullable(),
  carbs_g: z.number().nonnegative().nullable(),
  fat_g: z.number().nonnegative().nullable(),
  fiber_g: z.number().nonnegative().nullable(),
  reference: z.string(),
});

export const SeedFoodUnitSchema = z.strictObject({
  unit: UnitSchema,
  /** RAW grams per household unit for raw foods (rice katori = 50 g raw). */
  grams: z.number().positive(),
  label: z.string().min(1),
});

const seedFoodBase = {
  key: SnakeKeySchema,
  name: z.string().min(1),
  category: z.string().min(1),
  /** Default pantry suggestion in onboarding. */
  staple: z.boolean(),
  is_raw: z.boolean(),
  yield_factor: z.number().positive(),
  cooked_with_oil: z.boolean(),
  aliases: z.array(z.tuple([z.string().min(1), AliasLangSchema])),
  units: z.array(SeedFoodUnitSchema),
};

/** A USDA food: `usda_query` is a search hint for import-usda.ts; no `curated` object. */
export const SeedUsdaFoodSchema = z.strictObject({ ...seedFoodBase, usda_query: z.string().min(1) });
/** A curated food: `usda_query: null` plus a `curated` object. */
export const SeedCuratedFoodSchema = z.strictObject({
  ...seedFoodBase,
  usda_query: z.null(),
  curated: CuratedValuesSchema,
});
export const SeedFoodSchema = z.union([SeedUsdaFoodSchema, SeedCuratedFoodSchema]);
export const FoodsMapFileSchema = z.strictObject({ _note: Note, foods: z.array(SeedFoodSchema) });

// ───────────────────────── usda_pins.json ─────────────────────────

export const UsdaDatasetSchema = z.enum(['sr_legacy', 'foundation']);
export const UsdaPinSchema = z.strictObject({
  key: SnakeKeySchema,
  fdc_id: z.number().int().positive(),
  dataset: UsdaDatasetSchema,
  description: z.string().min(1),
});
export const UsdaPinsFileSchema = z.strictObject({ _note: Note, pins: z.array(UsdaPinSchema) });

// ───────────────────────── recipes.seed.json (exactly recipes.schema.json) ─────────────────────────

export const SeedRecipeIngredientSchema = z.strictObject({
  /** foods.map.json key */
  food: z.string(),
  /** raw grams per serving */
  grams: z.number().gt(0),
  unit: UnitSchema,
  qty: z.number().gt(0),
  role: IngredientRoleSchema,
  scalable: z.boolean(),
});

export const SeedRecipeSchema = z.strictObject({
  /** food keys that must be in the pantry for this recipe to be offered */
  requires: z.array(z.string()).optional(),
  slug: RecipeSlugSchema,
  name: z.string(),
  cuisine: CuisineSchema,
  meal_slots: z.array(SlotSchema).min(1),
  diet_tags: z.array(DietSchema).min(1),
  allergens: z.array(z.string()),
  cook_time_min: z.number().int().min(0),
  cost_tier: CostTierSchema,
  servings: z.number().int().min(1),
  oil_tsp: z.number().min(0),
  cooked_yield_g: z.number().gt(0).optional(),
  prep: z.strictObject({ text: z.string(), lead_hours: z.number() }).optional(),
  ingredients: z.array(SeedRecipeIngredientSchema).min(1),
  steps: z.array(z.strictObject({ text: z.string(), timer_sec: z.number().int().min(1).optional() })).min(1),
  scale_rules: z.strictObject({ min_mult: z.number(), max_mult: z.number(), step: z.number() }),
  /** protein_addons keys */
  protein_addons: z.array(z.string()),
  tags: z.array(z.string()),
  is_draft: z.boolean(),
});
export const RecipesFileSchema = z.strictObject({ _note: Note, recipes: z.array(SeedRecipeSchema) });

// ───────────────────────── home_dishes.seed.json ─────────────────────────

export const SeedHomeDishSchema = z
  .strictObject({
    key: SnakeKeySchema,
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    recipe_slug: RecipeSlugSchema.nullable(),
    /** true until the founder adds a standard home-style recipe (tag "component", with cooked_yield_g). */
    needs_recipe: z.boolean(),
    unit: UnitSchema,
    /** cooked grams per unit */
    grams_per_unit: z.number().positive(),
    category: HomeDishCategorySchema,
    protein_class: ProteinClassSchema,
  })
  .refine((d) => d.needs_recipe === (d.recipe_slug === null), {
    message: 'needs_recipe must be true exactly when recipe_slug is null',
    path: ['needs_recipe'],
  });
export const HomeDishesFileSchema = z.strictObject({ _note: Note, home_dishes: z.array(SeedHomeDishSchema) });

// ───────────────────────── protein_addons.seed.json ─────────────────────────

export const SeedProteinAddonSchema = z.strictObject({
  key: SnakeKeySchema,
  name: z.string().min(1),
  food_key: SnakeKeySchema,
  unit: UnitSchema,
  grams_per_unit: z.number().positive(),
  diet_tags: z.array(DietSchema).min(1),
  /** must be in the pantry to be suggested */
  pantry_food_key: SnakeKeySchema,
});
export const ProteinAddonsFileSchema = z.strictObject({ _note: Note, protein_addons: z.array(SeedProteinAddonSchema) });

// ───────────────────────── exercises.seed.json ─────────────────────────

export const SeedExerciseSchema = z
  .strictObject({
    id: SnakeKeySchema,
    /** free-exercise-db name (import matching) */
    source_name: z.string().min(1).nullable(),
    name: z.string().min(1),
    primary_muscle: z.string().min(1),
    secondary_muscles: z.array(z.string().min(1)),
    movement_pattern: MovementPatternSchema,
    equipment: z.array(z.string().min(1)),
    load_type: LoadTypeSchema,
    is_machine: z.boolean(),
    injury_tags: z.array(InjurySchema),
    form_cues: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
    start_load_ratio: z.number().min(0).max(9.999),
    increment_kg: z.number().min(0).max(99.99),
    rep_min: z.number().int().positive(),
    rep_max: z.number().int().positive(),
    importance: ImportanceSchema,
  })
  .refine((e) => e.rep_max >= e.rep_min, { message: 'rep_max must be ≥ rep_min', path: ['rep_max'] });
export const ExercisesFileSchema = z.strictObject({ _note: Note, exercises: z.array(SeedExerciseSchema) });

// ───────────────────────── workout_templates.seed.json (engine `TemplateSplitSeed`) ─────────────────────────

export const TemplateSplitSeedSchema = z.strictObject({
  split: SplitSchema,
  daysPerWeek: z.array(z.number().int().min(1).max(7)).min(1),
  sessions: z
    .array(
      z.strictObject({
        key: TemplateKeySchema,
        name: z.string().min(1),
        importance: z.number().int().min(1).max(3),
        slots: z
          .array(
            z.strictObject({
              pattern: MovementPatternSchema,
              primaryMuscle: z.string().min(1),
              sets: z.number().int().positive(),
              repMin: z.number().int().positive(),
              repMax: z.number().int().positive(),
              restSec: z.number().int().nonnegative(),
              importance: ImportanceSchema,
              preferred: z.strictObject({
                gym: z.array(SnakeKeySchema),
                machine: z.array(SnakeKeySchema),
                home_db: z.array(SnakeKeySchema),
              }),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});
export const WorkoutTemplatesFileSchema = z.strictObject({ _note: Note, splits: z.array(TemplateSplitSeedSchema) });

// ───────────────────────── data/sample/foods.sample.json ─────────────────────────

/** Synthetic per-100 g values for every food key (tests and --sample builds only; --prod refuses them). */
export const SampleFoodValuesSchema = z.strictObject({
  key: SnakeKeySchema,
  synthetic: z.literal(true),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative(),
});
export const SampleFoodsFileSchema = z.strictObject({ _note: Note, foods: z.array(SampleFoodValuesSchema) });

// ───────────────────────── types ─────────────────────────

export type SeedFood = z.infer<typeof SeedFoodSchema>;
export type SeedRecipe = z.infer<typeof SeedRecipeSchema>;
export type SeedHomeDish = z.infer<typeof SeedHomeDishSchema>;
export type SeedProteinAddon = z.infer<typeof SeedProteinAddonSchema>;
export type SeedExercise = z.infer<typeof SeedExerciseSchema>;
export type UsdaPin = z.infer<typeof UsdaPinSchema>;
export type FoodsMapFile = z.infer<typeof FoodsMapFileSchema>;
export type UsdaPinsFile = z.infer<typeof UsdaPinsFileSchema>;
export type RecipesFile = z.infer<typeof RecipesFileSchema>;
export type HomeDishesFile = z.infer<typeof HomeDishesFileSchema>;
export type ProteinAddonsFile = z.infer<typeof ProteinAddonsFileSchema>;
export type ExercisesFile = z.infer<typeof ExercisesFileSchema>;
export type WorkoutTemplatesFile = z.infer<typeof WorkoutTemplatesFileSchema>;
export type SampleFoodsFile = z.infer<typeof SampleFoodsFileSchema>;

/** Per-100 g values for one food, as the sample file and the USDA importer give them. */
export interface FoodValues {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  synthetic?: boolean;
}

/** The six seed files, parsed. */
export interface SeedFiles {
  foodsMap: FoodsMapFile;
  recipes: RecipesFile;
  homeDishes: HomeDishesFile;
  addons: ProteinAddonsFile;
  exercises: ExercisesFile;
  templates: WorkoutTemplatesFile;
}

export const SEED_FILE_SCHEMAS = {
  foodsMap: FoodsMapFileSchema,
  recipes: RecipesFileSchema,
  homeDishes: HomeDishesFileSchema,
  addons: ProteinAddonsFileSchema,
  exercises: ExercisesFileSchema,
  templates: WorkoutTemplatesFileSchema,
} as const;

/** File names under data/seed/ for each part of SeedFiles. */
export const SEED_FILE_NAMES: Record<keyof SeedFiles, string> = {
  foodsMap: 'foods.map.json',
  recipes: 'recipes.seed.json',
  homeDishes: 'home_dishes.seed.json',
  addons: 'protein_addons.seed.json',
  exercises: 'exercises.seed.json',
  templates: 'workout_templates.seed.json',
};

/** Thrown when seed data is invalid; `problems` lists every offender (one line each). */
export class SeedDataError extends Error {
  readonly problems: string[];
  constructor(title: string, problems: string[]) {
    super(`${title}\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'SeedDataError';
    this.problems = problems;
  }
}

/** Zod issues as one line each: `<label> <path>: <message>`. */
export function issueLines(label: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${label}${i.path.length > 0 ? ` ${i.path.join('.')}` : ''}: ${i.message}`);
}

/** Parses the six seed files (raw JSON), throwing one SeedDataError that lists every schema problem. */
export function parseSeedFiles(raw: Record<keyof SeedFiles, unknown>): SeedFiles {
  const problems: string[] = [];
  const parsed: Partial<SeedFiles> = {};
  for (const part of Object.keys(SEED_FILE_SCHEMAS) as (keyof SeedFiles)[]) {
    const r = SEED_FILE_SCHEMAS[part].safeParse(raw[part]);
    if (r.success) (parsed as Record<string, unknown>)[part] = r.data;
    else problems.push(...issueLines(SEED_FILE_NAMES[part], r.error));
  }
  if (problems.length > 0) throw new SeedDataError('Seed files failed schema validation:', problems);
  return parsed as SeedFiles;
}

const ALWAYS_UNITS = new Set(['g', 'ml']);

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  }
  return [...dup];
}

/**
 * Referential integrity of the seed (data-pipeline.md §3 steps 2 and 6): every key a file mentions must exist,
 * no key appears twice, units used by ingredients exist for their food, and every template slot has a preferred
 * exercise for every variant. Returns one line per offender (empty = clean).
 */
export function findSeedProblems(seeds: SeedFiles): string[] {
  const problems: string[] = [];
  const foods = seeds.foodsMap.foods;
  const recipes = seeds.recipes.recipes;
  const dishes = seeds.homeDishes.home_dishes;
  const addons = seeds.addons.protein_addons;
  const exercises = seeds.exercises.exercises;
  const splits = seeds.templates.splits;

  for (const k of duplicates(foods.map((f) => f.key))) problems.push(`foods.map.json: duplicate food key '${k}'`);
  for (const k of duplicates(recipes.map((r) => r.slug))) problems.push(`recipes.seed.json: duplicate slug '${k}'`);
  for (const k of duplicates(dishes.map((d) => d.key))) problems.push(`home_dishes.seed.json: duplicate key '${k}'`);
  for (const k of duplicates(addons.map((a) => a.key))) problems.push(`protein_addons.seed.json: duplicate key '${k}'`);
  for (const k of duplicates(exercises.map((e) => e.id))) problems.push(`exercises.seed.json: duplicate id '${k}'`);
  for (const k of duplicates(splits.map((s) => s.split)))
    problems.push(`workout_templates.seed.json: duplicate split '${k}'`);
  for (const f of foods) {
    for (const a of duplicates(f.aliases.map(([alias]) => alias)))
      problems.push(`foods.map.json: food '${f.key}' lists alias '${a}' twice`);
    for (const u of duplicates(f.units.map((x) => x.unit)))
      problems.push(`foods.map.json: food '${f.key}' lists unit '${u}' twice`);
  }

  const foodByKey = new Map(foods.map((f) => [f.key, f]));
  const recipeSlugs = new Set(recipes.map((r) => r.slug));
  const addonKeys = new Set(addons.map((a) => a.key));
  const exerciseIds = new Set(exercises.map((e) => e.id));

  for (const r of recipes) {
    r.ingredients.forEach((ing, i) => {
      const food = foodByKey.get(ing.food);
      if (!food) {
        problems.push(`recipes.seed.json: '${r.slug}' ingredient ${i} uses unknown food key '${ing.food}'`);
        return;
      }
      if (!ALWAYS_UNITS.has(ing.unit) && !food.units.some((u) => u.unit === ing.unit)) {
        problems.push(
          `recipes.seed.json: '${r.slug}' ingredient ${i} uses unit '${ing.unit}', which food '${ing.food}' doesn't define`,
        );
      }
    });
    for (const k of r.requires ?? []) {
      if (!foodByKey.has(k)) problems.push(`recipes.seed.json: '${r.slug}' requires unknown food key '${k}'`);
    }
    for (const k of r.protein_addons) {
      if (!addonKeys.has(k)) problems.push(`recipes.seed.json: '${r.slug}' lists unknown protein add-on '${k}'`);
    }
  }

  for (const a of addons) {
    const food = foodByKey.get(a.food_key);
    if (!food) problems.push(`protein_addons.seed.json: '${a.key}' uses unknown food key '${a.food_key}'`);
    else if (!ALWAYS_UNITS.has(a.unit) && !food.units.some((u) => u.unit === a.unit)) {
      problems.push(
        `protein_addons.seed.json: '${a.key}' uses unit '${a.unit}', which food '${a.food_key}' doesn't define`,
      );
    }
    if (!foodByKey.has(a.pantry_food_key)) {
      problems.push(`protein_addons.seed.json: '${a.key}' uses unknown pantry food key '${a.pantry_food_key}'`);
    }
  }

  for (const d of dishes) {
    if (d.recipe_slug !== null && !recipeSlugs.has(d.recipe_slug)) {
      problems.push(`home_dishes.seed.json: '${d.key}' uses unknown recipe slug '${d.recipe_slug}'`);
    }
  }

  for (const split of splits) {
    for (const k of duplicates(split.sessions.map((s) => s.key))) {
      problems.push(`workout_templates.seed.json: split '${split.split}' has session '${k}' twice`);
    }
    for (const session of split.sessions) {
      session.slots.forEach((slot, i) => {
        for (const variant of ['gym', 'machine', 'home_db'] as const) {
          const ids = slot.preferred[variant];
          const where = `split '${split.split}' session '${session.key}' slot ${i} (${slot.pattern}) variant '${variant}'`;
          if (ids.length === 0) problems.push(`workout_templates.seed.json: ${where} has no preferred exercise`);
          for (const id of ids) {
            if (!exerciseIds.has(id))
              problems.push(`workout_templates.seed.json: ${where} uses unknown exercise id '${id}'`);
          }
          for (const id of duplicates(ids)) problems.push(`workout_templates.seed.json: ${where} lists '${id}' twice`);
        }
      });
    }
  }
  return problems;
}

// ───────────────────────── the phone bundle (build-seed output) ─────────────────────────

const BundleVersion = z.string().regex(/^[0-9a-f]{8}$/, 'Expected 8 hex characters');
const Id = z.guid();

/** foods.json — FoodRow + its id and household units. */
export const BundleFoodsSchema = z.strictObject({
  bundle_version: BundleVersion,
  foods: z.array(z.strictObject({ id: Id, ...FoodRowSchema.shape, units: z.array(FoodUnitSchema) })),
});
/** recipes.json — RecipeRow (nutritionPerServing computed by the engine) + id. */
export const BundleRecipesSchema = z.strictObject({
  bundle_version: BundleVersion,
  recipes: z.array(z.strictObject({ id: Id, ...RecipeRowSchema.shape })),
});
export const BundleHomeDishesSchema = z.strictObject({
  bundle_version: BundleVersion,
  home_dishes: z.array(z.strictObject({ id: Id, ...HomeDishSchema.shape })),
});
export const BundleProteinAddonsSchema = z.strictObject({
  bundle_version: BundleVersion,
  protein_addons: z.array(z.strictObject({ id: Id, ...ProteinAddonSchema.shape })),
});
/** exercises.json — ExerciseRow (`id` is the exercise slug, as in the database). */
export const BundleExercisesSchema = z.strictObject({
  bundle_version: BundleVersion,
  exercises: z.array(ExerciseRowSchema),
});
/** templates.json — the six expanded WorkoutTemplate rows + display name. */
export const BundleTemplatesSchema = z.strictObject({
  bundle_version: BundleVersion,
  templates: z.array(z.strictObject({ ...WorkoutTemplateSchema.shape, name: z.string().min(1) })),
});
export const BundleManifestSchema = z.strictObject({
  bundle_version: BundleVersion,
  mode: z.enum(['sample', 'prod']),
  counts: z.strictObject({
    foods: z.number().int().nonnegative(),
    recipes: z.number().int().nonnegative(),
    home_dishes: z.number().int().nonnegative(),
    protein_addons: z.number().int().nonnegative(),
    exercises: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
  }),
  files: z.array(z.string().min(1)),
});

/** Bundle file name → schema. */
export const BUNDLE_FILE_SCHEMAS = {
  'foods.json': BundleFoodsSchema,
  'recipes.json': BundleRecipesSchema,
  'home_dishes.json': BundleHomeDishesSchema,
  'protein_addons.json': BundleProteinAddonsSchema,
  'exercises.json': BundleExercisesSchema,
  'templates.json': BundleTemplatesSchema,
  'manifest.json': BundleManifestSchema,
} as const;
