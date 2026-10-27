# FitG food and exercise data pipeline

`npm run data:build` turns the seed JSON in `data/seed/` into database seed SQL and the phone's bundled JSON. **No nutrition number is ever typed by hand into a recipe** — recipes list ingredients and raw grams; nutrition is computed from food rows.

## 1. Sources and licences

| Source | Licence | Use in v1 |
|---|---|---|
| USDA FoodData Central — **SR Legacy** first, then **Foundation Foods** (CSV downloads into `data/raw/usda/`, gitignored) | Public domain (CC0) | Base ingredients. `import-usda.ts` searches each food's `usda_query` (a search hint, not an exact name), prints the best matches, and pins the founder's choice with `--confirm` into `data/seed/usda_pins.json`. It never guesses. |
| Founder-curated values | — | Foods not in USDA (paneer, whey, roasted chana, soya chunks…) are `curated` rows filled from pack labels or a cited reference. **IFCT 2017 (ICMR-NIN)** has no explicit open licence: don't bulk-copy it; cite single values in curated rows or ask NIN for permission. |
| Open Food Facts | ODbL (share-alike on the database) | v1.1 only: runtime barcode lookup; store only what the user logs, with attribution. No bulk import. |
| free-exercise-db (GitHub) | Unlicense (public domain) | Exercise names + images. `import-exercises.ts` matches `source_name`, reports misses, copies images to `apps/mobile/assets/exercises/` as WebP ≤ 60 KB (Phase 2+). |
| wger | CC-BY-SA | Avoid for images (share-alike). |

USDA nutrient ids: energy **1008** (kcal); if absent (common in Foundation Foods) use **2047** (Atwater general), then **2048** (Atwater specific); protein **1003**; total fat **1004**; carbohydrate by difference **1005**; fibre **1079**. Values are per 100 g.

## 2. Seed files (`data/seed/`, copied unchanged from the build pack's `seed/`)

Every file has a wrapper object `{ "_note": "...", "<list>": [...] }`.

- **`foods.map.json`** → `foods: [{ key, name, category, usda_query | null, curated?: { kcal, protein_g, carbs_g, fat_g, fiber_g, reference }, staple, is_raw, yield_factor, cooked_with_oil, aliases: [[alias, lang], …], units: [{ unit, grams, label }] }]`. A food has either a `usda_query` or a `curated` object. `staple: true` marks the default pantry suggestions in onboarding. `units[].grams` are **raw** grams per household unit for raw foods (rice "katori" = 50 g raw = 150 g cooked).
- **`usda_pins.json`** (created by `import-usda.ts --confirm`) → `pins: [{ key, fdc_id, dataset: 'sr_legacy'|'foundation', description }]`.
- **`recipes.seed.json`** → `recipes: [...]`, schema `recipes.schema.json`. Fields beyond the obvious: `requires` (food keys that must be in the pantry for the recipe to be offered, e.g. whey), `prep` (`{ text, lead_hours }`, e.g. soak rajma), `cooked_yield_g` (needed by recipes used for Home Food portions), `tags` (`component` = never offered as a meal on its own), `is_draft` (until the founder approves). Ingredients reference food `key`s with raw grams, household unit and qty, role and `scalable`. `oil_tsp` equals the oil/ghee ingredient's household qty.
- **`home_dishes.seed.json`** → `home_dishes: [{ key, name, aliases[], recipe_slug | null, needs_recipe, unit, grams_per_unit (cooked), category, protein_class }]`.
- **`protein_addons.seed.json`** → `protein_addons: [{ key, name, food_key, unit, grams_per_unit, diet_tags[], pantry_food_key }]`.
- **`exercises.seed.json`** → `exercises: [{ id, source_name, name, primary_muscle, secondary_muscles[], movement_pattern, equipment[], load_type, is_machine, injury_tags[], form_cues[3], start_load_ratio, increment_kg, rep_min, rep_max, importance }]`.
- **`workout_templates.seed.json`** → `splits: [{ split, daysPerWeek[], sessions: [{ key, name, importance, slots: [{ pattern, primaryMuscle, sets, repMin, repMax, restSec, importance, preferred: { gym[], machine[], home_db[] } }] }] }]`.
- **`data/sample/foods.sample.json`** (copied from the build pack's `seed/sample/`) → `foods: [{ key, synthetic: true, kcal, protein_g, carbs_g, fat_g, fiber_g }]` — rough synthetic values for every food key, used by tests and `--sample` builds. The reference results in `engines.md` §3 were computed with these exact values.

## 3. Build steps (`data/scripts/build-seed.ts`, run with `tsx`)
1. Load and Zod-validate every seed file (`packages/contracts/src/seed.ts`).
2. Resolve food values: production → `usda_pins.json` rows from the USDA CSVs + `curated` values; `--sample` → `data/sample/foods.sample.json`. Fail on any unknown key.
3. Assign deterministic ids: reference rows get **UUIDv5(key)** with the namespace in `types.md` §0, so the phone bundle and the database agree.
4. Expand the two template splits into six template rows with `slotId`s (`engines.md` §2.1).
5. Compute `recipes.nutrition_per_serving` with the engine's `recipeNutrition` (multiplier 1).
6. Validate: every recipe has ≥ 1 slot and diet tag; `oil_tsp` matches; component recipes used by home dishes have `cooked_yield_g`; add-ons and `requires` reference existing foods; template `preferred` ids exist for every variant; no duplicate keys.
7. Emit idempotent SQL (`insert … on conflict do update`) and the bundle JSON with a `bundle_version`:
   - production: `supabase/seed/01_foods.sql … 06_templates.sql` and `apps/mobile/assets/bundle/*.json`;
   - `--sample`: the same files under `data/out/sample/` (gitignored) — sample builds never write into `apps/` or `supabase/`. (`npm run app:bundle:sample` deliberately copies a sample bundle into the app for development when `--prod` can't pass; the app then shows a "sample food values" line on Today and the reveal.)
8. **Mode rules**:
   - `--sample` takes every food's values from `foods.sample.json` (it covers every food key: 40 as of 2026-10-28), keeps draft recipes (with a warning), and skips only home dishes with `needs_recipe: true`.
   - `--prod` (production) refuses synthetic values, null curated values, `is_draft` recipes and `needs_recipe` dishes — it fails loudly instead.
9. Tests (`data/test/`): sample build succeeds; unknown key fails; `--prod` refusals; computed nutrition equals the bundle (±1 kcal); template expansion; importer matching against tiny fixture CSV/JSON files (fake rows for parser tests only). **Engine tests never depend on build output** — they load the seed + sample values in-process.

## 4. The founder's data tasks
**Status 2026-10-28:** the first four were done on the founder's behalf (`git log` c0de525, 625a0cb): 34 foods pinned to SR Legacy rows in `usda_pins.json`, 6 curated foods with label values cited in each food's `reference` (Amul paneer, MuscleBlaze whey isolate, Jabsons roasted chana, Nutrela soya chunks, Fortune poha, Amul fresh cream), all 20 starter recipes approved, and a home-style recipe for each of the 22 `needs_recipe` dishes (29 home dishes, 42 recipes). `npm run data:build -- --prod` passes and writes the app's bundle. Still worth the founder's eye: the label values against the packs he actually buys, and the yield/"medium" assumptions listed in the Phase 2 report.
- Run `import-usda.ts` after downloading the USDA CSVs and confirm each match. *(done)*
- Fill the curated values (paneer, whey, roasted chana, soya chunks) from labels. *(done)*
- Approve the 13 starter recipes and add 50–90 more he and his friends actually eat (format: the starter file). *(the starters are approved; more recipes still welcome)*
- Add standard home-style recipes for the `needs_recipe` dishes he cares about most (biryani, sambar, dosa, poha…). *(done for all 22)*
- Review the 3 form cues per exercise.
- Weekly from Phase 5: review `food_resolution_misses` and add aliases.
