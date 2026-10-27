import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ExercisesFileSchema,
  FoodsMapFileSchema,
  HomeDishesFileSchema,
  ProteinAddonsFileSchema,
  RecipesFileSchema,
  SampleFoodsFileSchema,
  SeedDataError,
  SeedRecipeSchema,
  UsdaPinsFileSchema,
  WorkoutTemplatesFileSchema,
  findSeedProblems,
  parseSeedFiles,
  type SeedFiles,
} from '../src/mod.ts';
import { clone, readJson, seedInput } from './helpers.ts';

const SCHEMA_FOR_FILE: Record<string, z.ZodType> = {
  'data/seed/foods.map.json': FoodsMapFileSchema,
  'data/seed/usda_pins.json': UsdaPinsFileSchema,
  'data/seed/recipes.seed.json': RecipesFileSchema,
  'data/seed/home_dishes.seed.json': HomeDishesFileSchema,
  'data/seed/protein_addons.seed.json': ProteinAddonsFileSchema,
  'data/seed/exercises.seed.json': ExercisesFileSchema,
  'data/seed/workout_templates.seed.json': WorkoutTemplatesFileSchema,
  'data/sample/foods.sample.json': SampleFoodsFileSchema,
};

function jsonFiles(dir: string): string[] {
  return readdirSync(new URL(`../../../${dir}/`, import.meta.url))
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${dir}/${f}`);
}

describe('real seed files', () => {
  // recipes.schema.json is the JSON Schema the recipe seed follows, not a seed file.
  const files = [...jsonFiles('data/seed'), ...jsonFiles('data/sample')].filter(
    (f) => !f.endsWith('recipes.schema.json'),
  );

  it('every file in data/seed and data/sample has a schema', () => {
    for (const f of files) expect(SCHEMA_FOR_FILE[f], f).toBeDefined();
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  for (const f of [...jsonFiles('data/seed'), ...jsonFiles('data/sample')].filter(
    (x) => !x.endsWith('recipes.schema.json'),
  )) {
    it(`${f} parses`, () => {
      const r = SCHEMA_FOR_FILE[f]!.safeParse(readJson(f));
      expect(r.success, r.success ? '' : z.prettifyError(r.error)).toBe(true);
    });
  }

  it('the real seed has no integrity problems', () => {
    expect(findSeedProblems(parseSeedFiles(seedInput()))).toEqual([]);
  });

  it('counts match the seed (40 foods, 42 recipes, 29 home dishes, 7 add-ons, 33 exercises, 2 splits)', () => {
    const s = parseSeedFiles(seedInput());
    expect(s.foodsMap.foods).toHaveLength(40);
    expect(s.recipes.recipes).toHaveLength(42);
    expect(s.homeDishes.home_dishes).toHaveLength(29);
    expect(s.addons.protein_addons).toHaveLength(7);
    expect(s.exercises.exercises).toHaveLength(33);
    expect(s.templates.splits).toHaveLength(2);
  });
});

describe('SeedRecipeSchema matches data/seed/recipes.schema.json exactly', () => {
  const CONSTRAINTS = [
    'minimum',
    'exclusiveMinimum',
    'maximum',
    'minItems',
    'maxItems',
    'pattern',
    'minLength',
    'maxLength',
  ] as const;
  type Js = Record<string, unknown>;

  /** Walks the reference JSON Schema and checks the Zod-generated one keyword by keyword (no more, no less). */
  function compare(ref: Js, got: Js, path: string, problems: string[]): void {
    if (ref.enum !== undefined) {
      const a = JSON.stringify([...(ref.enum as unknown[])].sort());
      const b = JSON.stringify([...((got.enum as unknown[] | undefined) ?? [])].sort());
      if (a !== b) problems.push(`${path}: enum ${a} vs ${b}`);
    } else if (ref.type !== undefined && ref.type !== got.type) {
      problems.push(`${path}: type ${String(ref.type)} vs ${String(got.type)}`);
    }
    for (const k of CONSTRAINTS) {
      let g = got[k];
      if (k === 'maximum' && g === Number.MAX_SAFE_INTEGER) g = undefined; // z.int() adds the safe-integer bound
      if (k === 'minimum' && g === Number.MIN_SAFE_INTEGER) g = undefined;
      if (ref[k] !== g) problems.push(`${path}: ${k} ${String(ref[k])} vs ${String(g)}`);
    }
    if (ref.additionalProperties === false && got.additionalProperties !== false) problems.push(`${path}: not strict`);
    if (ref.properties !== undefined) {
      const rp = ref.properties as Record<string, Js>;
      const gp = (got.properties ?? {}) as Record<string, Js>;
      const rk = Object.keys(rp).sort().join(',');
      const gk = Object.keys(gp).sort().join(',');
      if (rk !== gk) problems.push(`${path}: properties [${rk}] vs [${gk}]`);
      const rr = [...((ref.required as string[] | undefined) ?? [])].sort().join(',');
      const gr = [...((got.required as string[] | undefined) ?? [])].sort().join(',');
      if (rr !== gr) problems.push(`${path}: required [${rr}] vs [${gr}]`);
      for (const [k, v] of Object.entries(rp)) if (gp[k]) compare(v, gp[k], `${path}.${k}`, problems);
    }
    if (ref.items !== undefined) compare(ref.items as Js, (got.items ?? {}) as Js, `${path}[]`, problems);
  }

  it('same properties, required keys, enums and constraints', () => {
    const problems: string[] = [];
    compare(
      readJson('data/seed/recipes.schema.json') as Js,
      z.toJSONSchema(SeedRecipeSchema) as Js,
      'recipe',
      problems,
    );
    expect(problems).toEqual([]);
  });
});

describe('integrity checks catch every kind of unknown key', () => {
  function seeds(): SeedFiles {
    return clone(parseSeedFiles(seedInput()));
  }

  it('unknown ingredient food, requires key, add-on key, pantry key, recipe slug and exercise id', () => {
    const s = seeds();
    s.recipes.recipes[0]!.ingredients[0]!.food = 'unicorn_meat';
    s.recipes.recipes[1]!.requires = ['moon_cheese'];
    s.recipes.recipes[2]!.protein_addons = ['dragon_egg'];
    s.addons.protein_addons[0]!.food_key = 'phoenix_egg';
    s.addons.protein_addons[1]!.pantry_food_key = 'mystery_curd';
    s.homeDishes.home_dishes[0]!.recipe_slug = 'no-such-recipe';
    s.templates.splits[0]!.sessions[0]!.slots[0]!.preferred.gym = ['flying_squat'];
    const problems = findSeedProblems(s).join('\n');
    for (const k of [
      'unicorn_meat',
      'moon_cheese',
      'dragon_egg',
      'phoenix_egg',
      'mystery_curd',
      'no-such-recipe',
      'flying_squat',
    ]) {
      expect(problems).toContain(k);
    }
  });

  it('duplicate keys, an undefined household unit and an empty preferred list', () => {
    const s = seeds();
    s.foodsMap.foods.push(clone(s.foodsMap.foods[0]!));
    s.recipes.recipes[0]!.ingredients[0]!.unit = 'scoop'; // eggs have no scoop
    s.templates.splits[1]!.sessions[0]!.slots[0]!.preferred.home_db = [];
    const problems = findSeedProblems(s).join('\n');
    expect(problems).toContain("duplicate food key 'egg_whole'");
    expect(problems).toContain("unit 'scoop'");
    expect(problems).toContain('has no preferred exercise');
  });

  it('parseSeedFiles lists schema problems with the file name and path', () => {
    const raw = seedInput();
    const foods = clone(raw.foodsMap) as { foods: Array<Record<string, unknown>> };
    foods.foods[0]!.calories = 100; // unknown key
    try {
      parseSeedFiles({ ...raw, foodsMap: foods });
      throw new Error('expected a SeedDataError');
    } catch (e) {
      expect(e).toBeInstanceOf(SeedDataError);
      expect((e as SeedDataError).problems.join('\n')).toContain('foods.map.json foods.0');
    }
  });
});

describe('seed schema rules', () => {
  it('a food has either a usda_query or a curated object', () => {
    const raw = clone(readJson('data/seed/foods.map.json')) as { foods: Array<Record<string, unknown>> };
    const usda = raw.foods.find((f) => typeof f.usda_query === 'string')!;
    const curated = raw.foods.find((f) => f.usda_query === null)!;
    expect(FoodsMapFileSchema.safeParse({ foods: [{ ...usda, curated: curated.curated }] }).success).toBe(false);
    const { curated: _c, ...noCurated } = curated;
    expect(FoodsMapFileSchema.safeParse({ foods: [noCurated] }).success).toBe(false);
    expect(FoodsMapFileSchema.safeParse({ foods: [usda, curated] }).success).toBe(true);
  });

  it('needs_recipe is true exactly when recipe_slug is null', () => {
    const raw = clone(readJson('data/seed/home_dishes.seed.json')) as { home_dishes: Array<Record<string, unknown>> };
    const withRecipe = raw.home_dishes.find((d) => d.recipe_slug !== null)!;
    expect(HomeDishesFileSchema.safeParse({ home_dishes: [{ ...withRecipe, needs_recipe: true }] }).success).toBe(
      false,
    );
    expect(HomeDishesFileSchema.safeParse({ home_dishes: [{ ...withRecipe, recipe_slug: null }] }).success).toBe(false);
  });

  it('exercises need exactly 3 form cues and rep_max ≥ rep_min', () => {
    const raw = clone(readJson('data/seed/exercises.seed.json')) as { exercises: Array<Record<string, unknown>> };
    const ex = raw.exercises[0]!;
    expect(ExercisesFileSchema.safeParse({ exercises: [{ ...ex, form_cues: ['a', 'b'] }] }).success).toBe(false);
    expect(ExercisesFileSchema.safeParse({ exercises: [{ ...ex, form_cues: ['a', 'b', 'c', 'd'] }] }).success).toBe(
      false,
    );
    expect(ExercisesFileSchema.safeParse({ exercises: [{ ...ex, rep_min: 12, rep_max: 8 }] }).success).toBe(false);
  });

  it('usda_pins.json: { pins: [{ key, fdc_id, dataset, description }] }', () => {
    const pin = { key: 'egg_whole', fdc_id: 171287, dataset: 'sr_legacy', description: 'Egg, whole, raw, fresh' };
    expect(UsdaPinsFileSchema.safeParse({ pins: [pin] }).success).toBe(true);
    expect(UsdaPinsFileSchema.safeParse({ pins: [{ ...pin, dataset: 'branded' }] }).success).toBe(false);
    expect(UsdaPinsFileSchema.safeParse({ pins: [{ ...pin, fdc_id: '171287' }] }).success).toBe(false);
  });

  it('sample values must be marked synthetic', () => {
    expect(
      SampleFoodsFileSchema.safeParse({
        foods: [{ key: 'egg_whole', kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0 }],
      }).success,
    ).toBe(false);
  });
});
