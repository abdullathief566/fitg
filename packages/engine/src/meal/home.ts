// Home Food mode (engines.md §3.6): the family cooks; FitG gives portions of the dishes and, if needed, a protein add-on.
import type { Unit } from '../types/enums.ts';
import type { AddonPick, Nutrition, Portion } from '../types/nutrition.ts';
import type { FoodIndex, HomeDish, ProteinAddon, RecipeIndex } from '../types/reference.ts';
import { addNutrition, recipeNutrition, roundNutrition, scaleNutrition, sumNutrition } from '../nutrition/nutrition.ts';
import { fmtQty, plural } from '../util/format.ts';
import { ADDON_CAP_PER_SLOT, addonNutrition, bestAddon } from './scale.ts';

/** Nutrition of one unit of a home dish = recipeNutrition(recipe, 1) × gramsPerUnit / cookedYieldG. */
export function homeDishUnitNutrition(dish: HomeDish, lib: RecipeIndex, foods: FoodIndex): Nutrition {
  const recipe = lib.get(dish.recipeSlug);
  if (!recipe) throw new Error(`Home dish ${dish.key}: unknown recipe ${dish.recipeSlug}`);
  if (!recipe.cookedYieldG) throw new Error(`Home dish ${dish.key}: recipe ${recipe.slug} has no cookedYieldG`);
  return scaleNutrition(recipeNutrition(recipe, foods, 1), dish.gramsPerUnit / recipe.cookedYieldG);
}

const CARB = new Set<HomeDish['category']>(['rice', 'bread']);
const PROTEIN_SIDE = new Set<HomeDish['category']>(['dal', 'curry_nonveg']);

interface Line {
  dish: HomeDish;
  qty: number;
  step: number;
  min: number;
  max: number;
  unitN: Nutrition;
}

function startQty(d: HomeDish): number {
  if (d.category === 'bread') return 2;
  return 1;
}

function lineFor(d: HomeDish, unitN: Nutrition): Line {
  if (d.category === 'bread') return { dish: d, qty: startQty(d), step: 1, min: 1, max: 6, unitN };
  if (d.category === 'rice') return { dish: d, qty: 1, step: 0.5, min: 0.5, max: 3, unitN };
  if (PROTEIN_SIDE.has(d.category)) return { dish: d, qty: 1, step: 0.5, min: 0.5, max: 2.5, unitN };
  return { dish: d, qty: 1, step: 0.5, min: 1, max: 1, unitN };
}

function dishLabel(d: HomeDish, qty: number): string {
  if (d.unit === 'roti') return `${fmtQty(qty)} ${plural('roti', qty)}`;
  const unitWord = d.unit === 'katori' ? 'katori' : plural(d.unit, qty);
  return `${fmtQty(qty)} ${unitWord} ${d.name.toLowerCase()}`;
}

/**
 * Start: bread 2 rotis, rice 1 katori, dal/sabzi/curry 1 katori, others 1 unit. Adjust carbs first (rice in
 * 0.5-katori steps, roti whole, min 1) toward the slot kcal ±10%, then dal/curry in 0.5 steps; then add an eligible
 * protein add-on if protein < proteinMinG (and re-fit the calories). `addons` should already be diet-filtered.
 */
export function portionHomeMeal(p: {
  dishes: HomeDish[];
  slotTarget: { kcal: number; proteinMinG?: number };
  addons: ProteinAddon[];
  pantry: Set<string>;
  lib: RecipeIndex;
  foods: FoodIndex;
}): { portions: Portion[]; addons: AddonPick[]; nutrition: Nutrition; label: string } {
  const lines = p.dishes.map((d) => lineFor(d, homeDishUnitNutrition(d, p.lib, p.foods)));
  const addon = bestAddon(
    p.addons.filter((a) => p.pantry.has(a.pantryFoodKey)),
    p.foods,
  );
  const addonN = addon ? addonNutrition(addon, p.foods) : null;
  let addonUnits = 0;

  const total = (): Nutrition =>
    addNutrition(
      sumNutrition(lines.map((l) => scaleNutrition(l.unitN, l.qty))),
      addonN ? scaleNutrition(addonN, addonUnits) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  const lo = 0.9 * p.slotTarget.kcal;
  const hi = 1.1 * p.slotTarget.kcal;

  const fitKcal = (): void => {
    for (let guard = 0; guard < 40; guard++) {
      const k = total().kcal;
      if (k >= lo && k <= hi) return;
      const groups = [
        lines.filter((l) => CARB.has(l.dish.category)),
        lines.filter((l) => PROTEIN_SIDE.has(l.dish.category)),
      ];
      let moved = false;
      for (const group of groups) {
        const line =
          k > hi
            ? group.find((l) => l.qty - l.step >= l.min - 1e-9)
            : group.find((l) => l.qty + l.step <= l.max + 1e-9);
        if (!line) continue;
        const before = Math.abs(k - p.slotTarget.kcal);
        line.qty += k > hi ? -line.step : line.step;
        const after = Math.abs(total().kcal - p.slotTarget.kcal);
        if (after >= before) {
          line.qty -= k > hi ? -line.step : line.step; // a step that doesn't get closer is undone
          continue;
        }
        moved = true;
        break;
      }
      if (!moved) return;
    }
  };

  fitKcal();
  const min = p.slotTarget.proteinMinG;
  while (min !== undefined && addon && total().proteinG < min && addonUnits < ADDON_CAP_PER_SLOT) {
    addonUnits++;
    fitKcal();
  }

  const portions: Portion[] = lines.map((l) => ({
    foodKey: l.dish.key,
    homeDishKey: l.dish.key,
    grams: l.qty * l.dish.gramsPerUnit,
    unit: l.dish.unit as Unit,
    qty: l.qty,
    label: dishLabel(l.dish, l.qty),
  }));
  const picks: AddonPick[] = addon && addonUnits > 0 ? [{ addonKey: addon.key, qty: addonUnits }] : [];
  const labelParts = portions.map((x) => x.label);
  if (addon && addonUnits > 0) {
    const name = addon.name.toLowerCase();
    labelParts.push(`add ${addonUnits} ${name.includes('(') ? name : plural(name, addonUnits)}`);
  }
  return { portions, addons: picks, nutrition: roundNutrition(total()), label: labelParts.join(' · ') };
}
