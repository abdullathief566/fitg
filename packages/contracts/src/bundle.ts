// The phone bundle (data-pipeline.md §3). build-seed.ts writes the reference library as engine-shaped JSON into
// apps/mobile/assets/bundle/; the app turns it back into the engine's library with `libFromBundle` (no network,
// no recomputation: nutrition per serving was computed at build time).
import {
  buildFoodIndex,
  type ExerciseRow,
  type FoodRow,
  type FoodUnit,
  type HomeDish,
  type ProteinAddon,
  type RecipeRow,
  type WorkoutTemplate,
} from '@fitg/engine';
import type { ReferenceLib } from './mappers.ts';

export type BundleMode = 'sample' | 'prod';

export interface BundleManifest {
  bundle_version: string;
  /** `sample` = synthetic food values and draft recipes (development); `prod` = real values, approved recipes. */
  mode: BundleMode;
  counts: Record<string, number>;
  files: string[];
}

/** The seven JSON files, as `require`d by the app. Each file repeats the manifest's `bundle_version`. */
export interface PhoneBundle {
  manifest: BundleManifest;
  foods: { bundle_version: string; foods: Array<FoodRow & { id: string; units: FoodUnit[] }> };
  recipes: { bundle_version: string; recipes: Array<RecipeRow & { id: string }> };
  homeDishes: { bundle_version: string; home_dishes: Array<HomeDish & { id: string }> };
  addons: { bundle_version: string; protein_addons: Array<ProteinAddon & { id: string }> };
  exercises: { bundle_version: string; exercises: ExerciseRow[] };
  templates: { bundle_version: string; templates: Array<WorkoutTemplate & { name: string }> };
}

export interface BundleLib extends Omit<ReferenceLib, 'templates'> {
  /** By template id (`full_ab_machine`…), the shape `PlanLib.templates` takes. */
  templates: Map<string, WorkoutTemplate>;
  /** Display names by template id ("Full body A/B · machines"). */
  templateNames: Map<string, string>;
  bundleVersion: string;
  mode: BundleMode;
}

export class BundleError extends Error {}

export function libFromBundle(b: PhoneBundle): BundleLib {
  const version = b.manifest.bundle_version;
  if (b.manifest.mode !== 'sample' && b.manifest.mode !== 'prod') {
    throw new BundleError(`Unknown bundle mode '${String(b.manifest.mode)}'`);
  }
  const files: Array<[string, { bundle_version: string }]> = [
    ['foods', b.foods],
    ['recipes', b.recipes],
    ['home_dishes', b.homeDishes],
    ['protein_addons', b.addons],
    ['exercises', b.exercises],
    ['templates', b.templates],
  ];
  for (const [name, file] of files) {
    if (file.bundle_version !== version) {
      throw new BundleError(`${name}.json is version ${file.bundle_version}, the manifest says ${version}`);
    }
  }

  const foodRows: FoodRow[] = [];
  const units: FoodUnit[] = [];
  for (const { id: _id, units: foodUnits, ...food } of b.foods.foods) {
    foodRows.push(food);
    units.push(...foodUnits);
  }
  const templates = new Map<string, WorkoutTemplate>();
  const templateNames = new Map<string, string>();
  for (const { name, ...tpl } of b.templates.templates) {
    templates.set(tpl.id, tpl);
    templateNames.set(tpl.id, name);
  }
  return {
    foods: buildFoodIndex(foodRows, units),
    recipes: new Map(b.recipes.recipes.map(({ id: _id, ...r }) => [r.slug, r])),
    homeDishes: new Map(b.homeDishes.home_dishes.map(({ id: _id, ...d }) => [d.key, d])),
    addons: b.addons.protein_addons.map(({ id: _id, ...a }) => a),
    exercises: { byId: new Map(b.exercises.exercises.map((e) => [e.id, e])) },
    templates,
    templateNames,
    bundleVersion: version,
    mode: b.manifest.mode,
  };
}
