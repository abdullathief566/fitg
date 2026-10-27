// build-seed tests. Every build writes into a fresh temp dir (`outDir`), never into data/out, apps/ or supabase/.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildFoodIndex, recipeNutrition, refId, templateName } from '@fitg/engine';
import {
  BUNDLE_FILE_SCHEMAS,
  BundleFoodsSchema,
  BundleRecipesSchema,
  BundleTemplatesSchema,
  SeedDataError,
  loadReferenceLib,
  sampleFoodValues,
} from '@fitg/contracts';
import {
  SQL_FILES,
  buildSeed,
  outputDirs,
  prodSeedRefusals,
  pruneSql,
  readSeedFiles,
  sqlArray,
  sqlJson,
  sqlNumber,
  sqlString,
  syntheticValueRefusals,
  upsertSql,
} from '../scripts/build-seed.ts';
import { readPinsFile } from '../scripts/import-usda.ts';
import { REPO_ROOT } from '../scripts/util.ts';

const SEED_FILES = [
  'foods.map.json',
  'recipes.seed.json',
  'home_dishes.seed.json',
  'protein_addons.seed.json',
  'exercises.seed.json',
  'workout_templates.seed.json',
] as const;
type SeedName = (typeof SEED_FILES)[number];
// The seed files are plain JSON; tests edit them as loose objects.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- free-form JSON edits in tests

const temps: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'fitg-seed-'));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function readRepoJson(rel: string): Json {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8')) as Json;
}

/** A throwaway repo root holding copies of data/seed and data/sample, optionally edited first. */
function makeRoot(edit?: (files: Record<SeedName, Json>, sample: Json) => void): string {
  const root = tempDir();
  const files = Object.fromEntries(SEED_FILES.map((f) => [f, readRepoJson(`data/seed/${f}`)])) as Record<
    SeedName,
    Json
  >;
  const sample = readRepoJson('data/sample/foods.sample.json');
  edit?.(files, sample);
  mkdirSync(join(root, 'data/seed'), { recursive: true });
  mkdirSync(join(root, 'data/sample'), { recursive: true });
  for (const f of SEED_FILES) writeFileSync(join(root, 'data/seed', f), JSON.stringify(files[f], null, 2));
  writeFileSync(join(root, 'data/sample/foods.sample.json'), JSON.stringify(sample, null, 2));
  return root;
}

function read(dir: string, name: string): string {
  return readFileSync(join(dir, name), 'utf8');
}

function expectThrowMatching(fn: () => unknown, ...patterns: RegExp[]): SeedDataError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SeedDataError);
    for (const p of patterns) expect((e as Error).message).toMatch(p);
    return e as SeedDataError;
  }
  throw new Error('expected the build to fail');
}

describe('sample build', () => {
  const out = tempDir();
  const result = buildSeed({ mode: 'sample', root: REPO_ROOT, outDir: out });

  it('succeeds and counts every reference row', () => {
    expect(result.counts).toEqual({
      foods: 40,
      food_aliases: 86,
      food_units: 65,
      recipes: 42,
      recipe_ingredients: 178,
      home_dishes: 29,
      protein_addons: 7,
      exercises: 33,
      templates: 6,
    });
    expect(result.skipped.home_dishes).toEqual([]);
    expect(result.bundle_version).toMatch(/^[0-9a-f]{8}$/);
  });

  it('keeps a draft recipe with a warning (the seed itself has none left)', () => {
    expect(result.warnings.join('\n')).not.toMatch(/draft/);
    const root = makeRoot((f) => {
      f['recipes.seed.json'].recipes[0].is_draft = true;
    });
    const r = buildSeed({ mode: 'sample', root, outDir: tempDir() });
    expect(r.counts.recipes).toBe(result.counts.recipes);
    expect(r.warnings.join('\n')).toMatch(/kept 1 draft recipe\(s\): egg-bhurji-roti/);
  });

  it('skips only needs_recipe dishes (the seed has none left)', () => {
    expect(result.warnings.join('\n')).not.toMatch(/skipped/);
    const dishes = JSON.parse(read(join(out, 'bundle'), 'home_dishes.json')) as { home_dishes: Array<{ key: string }> };
    expect(dishes.home_dishes.map((d) => d.key)).toEqual(
      readRepoJson('data/seed/home_dishes.seed.json').home_dishes.map((d: Json) => d.key),
    );
    expect(dishes.home_dishes).toHaveLength(29);
    const root = makeRoot((f) => {
      const sambar = f['home_dishes.seed.json'].home_dishes.find((d: Json) => d.key === 'sambar');
      sambar.recipe_slug = null;
      sambar.needs_recipe = true;
    });
    const r = buildSeed({ mode: 'sample', root, outDir: tempDir() });
    expect(r.skipped.home_dishes).toEqual(['sambar']);
    expect(r.counts.home_dishes).toBe(28);
    expect(r.warnings.join('\n')).toMatch(/skipped 1 home dish\(es\) that still need a recipe: sambar/);
  });

  it('writes six SQL files and the bundle, all carrying the bundle_version', () => {
    expect(readdirSync(join(out, 'seed')).sort()).toEqual([...SQL_FILES].sort());
    expect(readdirSync(join(out, 'bundle')).sort()).toEqual(Object.keys(BUNDLE_FILE_SCHEMAS).sort());
    for (const f of SQL_FILES) {
      const sql = read(join(out, 'seed'), f);
      expect(sql).toContain(`-- bundle_version: ${result.bundle_version}`);
      expect(sql).toContain('SAMPLE BUILD');
      expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    }
    for (const [name, schema] of Object.entries(BUNDLE_FILE_SCHEMAS)) {
      const parsed = schema.safeParse(JSON.parse(read(join(out, 'bundle'), name)));
      expect(parsed.success, name).toBe(true);
      expect((parsed.data as { bundle_version: string }).bundle_version).toBe(result.bundle_version);
    }
  });

  it('uses deterministic ids: UUIDv5 of the key', () => {
    const foods = read(join(out, 'seed'), '01_foods.sql');
    expect(foods).toContain(`('${refId('egg_whole')}', 'egg_whole', 'usda', null, 'Egg, whole'`);
    expect(foods).toContain(`'${refId('food_unit:rice_white_raw:katori')}'`);
    expect(read(join(out, 'seed'), '02_recipes.sql')).toContain(
      `'${refId('recipe_ingredient:egg-bhurji-roti:0')}', '${refId('egg-bhurji-roti')}', '${refId('egg_whole')}'`,
    );
    const bundle = BundleFoodsSchema.parse(JSON.parse(read(join(out, 'bundle'), 'foods.json')));
    expect(bundle.foods.find((f) => f.key === 'paneer')?.id).toBe(refId('paneer'));
  });

  it('emits idempotent upserts', () => {
    for (const f of SQL_FILES) {
      const sql = read(join(out, 'seed'), f);
      expect(sql).toMatch(/^begin;$/m);
      expect(sql).toMatch(/on conflict \(id\) do update set/);
    }
    expect(read(join(out, 'seed'), '01_foods.sql')).toMatch(/delete from food_aliases where food_id in \(/);
    expect(read(join(out, 'seed'), '02_recipes.sql')).toMatch(
      /array\['breakfast', 'post_workout', 'dinner'\]::slot_t\[\]/,
    );
    // `level` and `image_paths` keep their database values: they are not in the insert's column list.
    const insert = /insert into exercises \(([^)]*)\)/.exec(read(join(out, 'seed'), '05_exercises.sql'))?.[1] ?? '';
    expect(insert).toContain('form_cues');
    expect(insert).not.toMatch(/\blevel\b|image_paths/);
  });

  it('nutrition in the bundle equals the engine recipeNutrition (±1 kcal), from the bundle and from the seed in-process', () => {
    const foods = BundleFoodsSchema.parse(JSON.parse(read(join(out, 'bundle'), 'foods.json'))).foods;
    const index = buildFoodIndex(
      foods.map(({ id: _id, units: _u, ...food }) => food),
      foods.flatMap((f) => f.units),
    );
    const repoRead = (rel: string): unknown => readRepoJson(rel);
    const lib = loadReferenceLib({
      foodsMap: repoRead('data/seed/foods.map.json'),
      recipes: repoRead('data/seed/recipes.seed.json'),
      homeDishes: repoRead('data/seed/home_dishes.seed.json'),
      addons: repoRead('data/seed/protein_addons.seed.json'),
      exercises: repoRead('data/seed/exercises.seed.json'),
      templates: repoRead('data/seed/workout_templates.seed.json'),
      sample: repoRead('data/sample/foods.sample.json'),
    });
    const recipes = BundleRecipesSchema.parse(JSON.parse(read(join(out, 'bundle'), 'recipes.json'))).recipes;
    expect(recipes).toHaveLength(42);
    for (const r of recipes) {
      const fromBundle = recipeNutrition(r, index, 1);
      const inProcess = recipeNutrition(lib.recipes.get(r.slug)!, lib.foods, 1);
      expect(Math.abs(r.nutritionPerServing.kcal - fromBundle.kcal), r.slug).toBeLessThanOrEqual(1);
      expect(Math.abs(r.nutritionPerServing.kcal - inProcess.kcal), r.slug).toBeLessThanOrEqual(1);
      expect(Math.abs(r.nutritionPerServing.proteinG - inProcess.proteinG), r.slug).toBeLessThanOrEqual(0.1);
    }
    // the SQL carries the same numbers (snake_case jsonb)
    const egg = recipes.find((r) => r.slug === 'egg-bhurji-roti')!;
    expect(read(join(out, 'seed'), '02_recipes.sql')).toContain(`"kcal":${egg.nutritionPerServing.kcal}`);
  });

  it('expands the two template splits into six rows with slot ids and names', () => {
    const templates = BundleTemplatesSchema.parse(JSON.parse(read(join(out, 'bundle'), 'templates.json'))).templates;
    expect(templates.map((t) => t.id)).toEqual([
      'full_ab_gym',
      'full_ab_machine',
      'full_ab_home_db',
      'upper_lower_gym',
      'upper_lower_machine',
      'upper_lower_home_db',
    ]);
    for (const t of templates) {
      expect(t.name).toBe(templateName(t));
      for (const s of t.sessions)
        s.slots.forEach((slot, i) => expect(slot.slotId).toBe(`${s.key}:${i}:${slot.pattern}`));
    }
    const machine = templates.find((t) => t.id === 'full_ab_machine')!;
    expect(machine.sessions[0]!.slots[0]).toMatchObject({
      slotId: 'A:0:squat',
      preferred: ['leg_press_machine', 'goblet_squat_db'],
    });
    expect(templates.find((t) => t.id === 'upper_lower_home_db')!.sessions[1]!.slots[0]!.slotId).toBe('lower:0:squat');
    const sql = read(join(out, 'seed'), '06_templates.sql');
    expect(sql.match(/^ {2}\('(full_ab|upper_lower)_(gym|machine|home_db)'/gm)).toHaveLength(6);
    expect(sql).toContain("'Full body A/B (machines)', array[1, 2, 3]::int[], 'full_ab', 'machine'");
  });

  it('is deterministic: a second build writes byte-identical files', () => {
    const again = tempDir();
    const r2 = buildSeed({ mode: 'sample', root: REPO_ROOT, outDir: again });
    expect(r2.bundle_version).toBe(result.bundle_version);
    for (const f of SQL_FILES) expect(read(join(again, 'seed'), f)).toBe(read(join(out, 'seed'), f));
    for (const f of Object.keys(BUNDLE_FILE_SCHEMAS))
      expect(read(join(again, 'bundle'), f)).toBe(read(join(out, 'bundle'), f));
  });
});

describe('output folders', () => {
  it('sample → data/out/sample; prod → supabase/seed + apps/mobile/assets/bundle', () => {
    expect(outputDirs('sample', '/r')).toEqual({
      sqlDir: '/r/data/out/sample/seed',
      bundleDir: '/r/data/out/sample/bundle',
    });
    expect(outputDirs('prod', '/r')).toEqual({ sqlDir: '/r/supabase/seed', bundleDir: '/r/apps/mobile/assets/bundle' });
  });

  it('sample builds never write into apps/ or supabase/', () => {
    const root = makeRoot();
    expect(() => buildSeed({ mode: 'sample', root, outDir: join(root, 'apps/mobile/assets') })).toThrow(
      /never write into apps\/ or supabase\//,
    );
    expect(() => buildSeed({ mode: 'sample', root, outDir: join(root, 'supabase') })).toThrow(/never write/);
    expect(existsSync(join(root, 'apps'))).toBe(false);
    expect(existsSync(join(root, 'supabase'))).toBe(false);
  });
});

describe('failures are loud and write nothing', () => {
  it('an unknown key fails (every kind is listed)', () => {
    const root = makeRoot((f) => {
      f['recipes.seed.json'].recipes[0].ingredients[0].food = 'unicorn_meat';
      f['recipes.seed.json'].recipes[1].requires = ['moon_cheese'];
      f['protein_addons.seed.json'].protein_addons[0].pantry_food_key = 'phoenix_egg';
      f['home_dishes.seed.json'].home_dishes[0].recipe_slug = 'no-such-recipe';
      f['workout_templates.seed.json'].splits[0].sessions[0].slots[0].preferred.machine = ['flying_squat'];
    });
    const out = tempDir();
    const err = expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: out }),
      /unicorn_meat/,
      /moon_cheese/,
      /phoenix_egg/,
      /no-such-recipe/,
      /flying_squat/,
    );
    expect(err.problems).toHaveLength(5);
    expect(readdirSync(out)).toEqual([]);
  });

  it('a schema problem fails with the file and path', () => {
    const root = makeRoot((f) => {
      f['exercises.seed.json'].exercises[0].form_cues = ['only one'];
    });
    expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: tempDir() }),
      /exercises\.seed\.json exercises\.0\.form_cues/,
    );
  });

  it('oil_tsp must equal the oil/ghee teaspoons', () => {
    const root = makeRoot((f) => {
      f['recipes.seed.json'].recipes[0].oil_tsp = 3;
    });
    expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: tempDir() }),
      /'egg-bhurji-roti' has oil_tsp 3 but its oil\/ghee ingredients add up to 1 tsp/,
    );
  });

  it('a component recipe used by a home dish needs cooked_yield_g', () => {
    const root = makeRoot((f) => {
      delete f['recipes.seed.json'].recipes.find((r: Json) => r.slug === 'dal-tadka-home').cooked_yield_g;
    });
    expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: tempDir() }),
      /'dal_tadka' uses recipe 'dal-tadka-home', which has no cooked_yield_g/,
    );
  });

  it('duplicate keys fail', () => {
    const root = makeRoot((f) => {
      f['exercises.seed.json'].exercises.push(f['exercises.seed.json'].exercises[0]);
    });
    expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: tempDir() }),
      /duplicate id 'barbell_back_squat'/,
    );
  });

  it('values that would be rounded by the database fail', () => {
    const root = makeRoot((_f, sample) => {
      sample.foods[0].kcal = 143.456;
    });
    expectThrowMatching(
      () => buildSeed({ mode: 'sample', root, outDir: tempDir() }),
      /kcal 143\.456 doesn't fit numeric\(7,2\)/,
    );
  });
});

describe('--prod refusals', () => {
  it('refuses unpinned USDA foods, null curated values, drafts and needs_recipe dishes — all listed at once', () => {
    // Unfinished data, as the build pack shipped it: the temp root has no usda_pins.json, and the edit below puts back
    // null curated values, draft recipes and dishes that still need a recipe.
    const n = { usda: 0, curated: 0, drafts: 0, dishes: 0 };
    const root = makeRoot((f) => {
      for (const food of f['foods.map.json'].foods) {
        if (food.usda_query !== null) {
          n.usda++;
          continue;
        }
        n.curated++;
        food.curated = { ...food.curated, kcal: null, protein_g: null, carbs_g: null, fat_g: null };
        if (food.key === 'roasted_chana') food.curated.fiber_g = null;
      }
      for (const r of f['recipes.seed.json'].recipes) {
        r.is_draft = true;
        n.drafts++;
      }
      for (const d of f['home_dishes.seed.json'].home_dishes) {
        if (d.key !== 'sambar' && !d.needs_recipe) continue;
        d.recipe_slug = null;
        d.needs_recipe = true;
        n.dishes++;
      }
    });
    const out = tempDir();
    const err = expectThrowMatching(
      () => buildSeed({ mode: 'prod', root, outDir: out }),
      /Production build refused/,
      /'egg_whole' has no USDA pin yet/,
      /'paneer' curated values are still null \(kcal, protein_g, carbs_g, fat_g\)/,
      /'roasted_chana' curated values are still null \(kcal, protein_g, carbs_g, fat_g, fiber_g\)/,
      /'egg-bhurji-roti' is a draft/,
      /'sambar' needs a recipe/,
    );
    expect(err.problems).toHaveLength(n.usda + n.curated + n.drafts + n.dishes);
    expect(readdirSync(out)).toEqual([]);
  });

  it("today's seed and pins pass every --prod refusal (pins, curated values, drafts, needs_recipe dishes)", () => {
    // Checked without the USDA CSVs (they are gitignored); the real --prod build also reads them.
    const left = prodSeedRefusals(readSeedFiles(REPO_ROOT), readPinsFile(join(REPO_ROOT, 'data/seed/usda_pins.json')));
    expect(left).toEqual([]);
  });

  it('refuses synthetic values', () => {
    const refusals = syntheticValueRefusals(sampleFoodValues(readRepoJson('data/sample/foods.sample.json')));
    expect(refusals).toHaveLength(40);
    expect(refusals[0]).toMatch(/'egg_whole' has synthetic/);
    expect(
      syntheticValueRefusals(new Map([['egg_whole', { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0 }]])),
    ).toEqual([]);
  });

  /** Finished data: approved recipes, no needs_recipe dishes, curated values filled, every USDA food pinned to a FAKE row. */
  function finishedRoot(edit?: (files: Record<SeedName, Json>) => void): { root: string; pins: Json[] } {
    const pins: Json[] = [];
    const root = makeRoot((f) => {
      for (const r of f['recipes.seed.json'].recipes) r.is_draft = false;
      f['home_dishes.seed.json'].home_dishes = f['home_dishes.seed.json'].home_dishes.filter(
        (d: Json) => !d.needs_recipe,
      );
      f['foods.map.json'].foods.forEach((food: Json, i: number) => {
        if (food.usda_query === null) {
          food.curated = { ...food.curated, kcal: 300 + i, protein_g: 20, carbs_g: 30, fat_g: 10, fiber_g: 1 };
        } else {
          pins.push({
            key: food.key,
            fdc_id: 990000 + i,
            dataset: 'sr_legacy',
            description: `FAKE ROW for ${food.key}`,
          });
        }
      });
      edit?.(f);
    });
    writeFileSync(
      join(root, 'data/seed/usda_pins.json'),
      JSON.stringify({ _note: 'FAKE pins for tests', pins }, null, 2),
    );
    const dir = join(root, 'data/raw/usda/sr_legacy');
    mkdirSync(dir, { recursive: true });
    const foodRows = pins.map((p) => `"${p.fdc_id}","sr_legacy_food","FAKE ROW for ${p.key}","1","2019-04-01"`);
    writeFileSync(
      join(dir, 'food.csv'),
      ['"fdc_id","data_type","description","food_category_id","publication_date"', ...foodRows].join('\n'),
    );
    const nutrientRows = pins.flatMap((p, i) =>
      [
        [1008, 100 + i],
        [1003, 5],
        [1004, 3],
        [1005, 12.5],
        [1079, 1],
      ].map(([id, amount]) => `"${i}","${p.fdc_id}","${id}","${amount}"`),
    );
    writeFileSync(join(dir, 'food_nutrient.csv'), ['"id","fdc_id","nutrient_id","amount"', ...nutrientRows].join('\n'));
    return { root, pins };
  }

  it('builds when every value is real (FAKE USDA rows here) and records the USDA source', () => {
    const { root, pins } = finishedRoot();
    const out = tempDir();
    const r = buildSeed({ mode: 'prod', root, outDir: out });
    expect(r.mode).toBe('prod');
    expect(r.counts.home_dishes).toBe(29);
    expect(r.warnings).toEqual([]);
    const sql = read(join(out, 'seed'), '01_foods.sql');
    expect(sql).not.toContain('SAMPLE BUILD');
    expect(sql).toContain(`'egg_whole', 'usda', '${pins[0]!.fdc_id}'`);
    expect(sql).toMatch(/'paneer', 'curated', null, 'Paneer', null, 'dairy', 307, 20, 30, 10, 1/);
    const manifest = JSON.parse(read(join(out, 'bundle'), 'manifest.json')) as { mode: string };
    expect(manifest.mode).toBe('prod');
    expect(read(join(out, 'bundle'), 'foods.json')).not.toContain('synthetic');
  });

  it('refuses when a pinned row lacks a nutrient or the CSVs are missing', () => {
    const { root } = finishedRoot();
    const file = join(root, 'data/raw/usda/sr_legacy/food_nutrient.csv');
    writeFileSync(
      file,
      read(join(root, 'data/raw/usda/sr_legacy'), 'food_nutrient.csv').replace(/^"\d+","990000","1005","12\.5"\n/m, ''),
    );
    expectThrowMatching(
      () => buildSeed({ mode: 'prod', root, outDir: tempDir() }),
      /'egg_whole' → fdc_id 990000 has no carbohydrate \(1005\)/,
    );
    rmSync(join(root, 'data/raw'), { recursive: true });
    expectThrowMatching(() => buildSeed({ mode: 'prod', root, outDir: tempDir() }), /USDA CSV not found/);
  });

  it('refuses a pin for an unknown food or two foods on one fdc_id', () => {
    const { root, pins } = finishedRoot();
    const bad = [...pins, { key: 'unicorn_meat', fdc_id: 1, dataset: 'sr_legacy', description: 'x' }];
    bad[1] = { ...bad[1], fdc_id: pins[0]!.fdc_id };
    writeFileSync(join(root, 'data/seed/usda_pins.json'), JSON.stringify({ pins: bad }));
    expectThrowMatching(
      () => buildSeed({ mode: 'prod', root, outDir: tempDir() }),
      /pin for unknown food key 'unicorn_meat'/,
      /fdc_id 990000 is pinned for egg_whole and atta_whole_wheat/,
    );
  });
});

describe('SQL literals', () => {
  it('doubles single quotes and refuses NUL bytes', () => {
    expect(sqlString("Mom's dal")).toBe("'Mom''s dal'");
    expect(sqlString("it''s")).toBe("'it''''s'");
    expect(sqlString('back\\slash')).toBe("'back\\slash'");
    expect(() => sqlString('a\u0000b')).toThrow(/NUL/);
  });

  it('writes arrays, jsonb and numbers', () => {
    expect(sqlArray([], 'text')).toBe("'{}'::text[]");
    expect(sqlArray(["a'b", 'c'], 'text')).toBe("array['a''b', 'c']::text[]");
    expect(sqlArray([1, 2.5], 'int')).toBe('array[1, 2.5]::int[]');
    expect(sqlJson({ text: "Don't" })).toBe(`'{"text":"Don''t"}'::jsonb`);
    expect(() => sqlNumber(Number.NaN)).toThrow();
  });

  it('upsert and prune statements', () => {
    const sql = upsertSql(
      't',
      [
        { name: 'id', kind: 'text' },
        { name: 'n', kind: 'number' },
      ],
      [
        { id: 'x', n: 1 },
        { id: "y'", n: null },
      ],
      ['id'],
    );
    expect(sql).toBe(
      "insert into t (id, n)\nvalues\n  ('x', 1),\n  ('y''', null)\non conflict (id) do update set\n  n = excluded.n;\n",
    );
    expect(() => upsertSql('t', [{ name: 'id', kind: 'text' }], [{}], ['id'])).toThrow(/missing column id/);
    expect(pruneSql('c', 'p_id', [], ['a'])).toBe('');
    expect(pruneSql('c', 'p_id', ['p'], [])).toBe("delete from c where p_id in ('p');\n");
  });

  it('a quote in seed text reaches the SQL escaped (end to end)', () => {
    const root = makeRoot((f) => {
      f['recipes.seed.json'].recipes[0].name = "Mom's egg bhurji";
      f['recipes.seed.json'].recipes[0].steps[1].text = "Don't overcook the eggs.";
    });
    const out = tempDir();
    buildSeed({ mode: 'sample', root, outDir: out });
    const sql = read(join(out, 'seed'), '02_recipes.sql');
    expect(sql).toContain("'Mom''s egg bhurji'");
    expect(sql).toContain('"text":"Don\'\'t overcook the eggs."');
  });
});
