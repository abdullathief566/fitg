// The reference library shipped inside the app (assets/bundle, written by `npm run data:build -- --prod`, or by
// `npm run app:bundle:sample` during development). Built once, on first use.
import { libFromBundle, type BundleLib, type PhoneBundle } from '@fitg/contracts';
import manifest from '../../assets/bundle/manifest.json';
import foods from '../../assets/bundle/foods.json';
import recipes from '../../assets/bundle/recipes.json';
import homeDishes from '../../assets/bundle/home_dishes.json';
import addons from '../../assets/bundle/protein_addons.json';
import exercises from '../../assets/bundle/exercises.json';
import templates from '../../assets/bundle/templates.json';

let lib: BundleLib | undefined;

export function getLib(): BundleLib {
  lib ??= libFromBundle({
    manifest,
    foods,
    recipes,
    homeDishes,
    addons,
    exercises,
    templates,
  } as unknown as PhoneBundle);
  return lib;
}
