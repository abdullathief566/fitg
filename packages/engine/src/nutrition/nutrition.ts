// Nutrition math (engines.md §3.1). Nutrition always uses exact raw grams; labels round.
import type { FoodIndex, FoodRow, FoodUnit, RecipeRow } from '../types/reference.ts';
import type { Nutrition } from '../types/nutrition.ts';
import { roundDp } from '../util/round.ts';

export const ZERO_NUTRITION: Nutrition = Object.freeze({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

/** per-100 g × grams / 100. */
export function nutritionForGrams(food: FoodRow, grams: number): Nutrition {
  return {
    kcal: (food.kcal * grams) / 100,
    proteinG: (food.proteinG * grams) / 100,
    carbsG: (food.carbsG * grams) / 100,
    fatG: (food.fatG * grams) / 100,
  };
}

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

export function subNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    kcal: a.kcal - b.kcal,
    proteinG: a.proteinG - b.proteinG,
    carbsG: a.carbsG - b.carbsG,
    fatG: a.fatG - b.fatG,
  };
}

export function scaleNutrition(n: Nutrition, k: number): Nutrition {
  return { kcal: n.kcal * k, proteinG: n.proteinG * k, carbsG: n.carbsG * k, fatG: n.fatG * k };
}

export function sumNutrition(list: readonly Nutrition[]): Nutrition {
  return list.reduce<Nutrition>((acc, n) => addNutrition(acc, n), { ...ZERO_NUTRITION });
}

/** Rounded copy for storage/display (1 decimal). Math keeps the exact values. */
export function roundNutrition(n: Nutrition, dp = 1): Nutrition {
  return {
    kcal: roundDp(n.kcal, dp),
    proteinG: roundDp(n.proteinG, dp),
    carbsG: roundDp(n.carbsG, dp),
    fatG: roundDp(n.fatG, dp),
  };
}

export function foodOf(foods: FoodIndex, key: string): FoodRow {
  const entry = foods.get(key);
  if (!entry) throw new Error(`Unknown food key: ${key}`);
  return entry.food;
}

/**
 * Nutrition of one serving at `multiplier`: scalable ingredients × multiplier; non-scalable stay fixed.
 * Oil is an ingredient like any other (1 tsp = 4.5 g).
 */
export function recipeNutrition(recipe: RecipeRow, foods: FoodIndex, multiplier: number): Nutrition {
  let n: Nutrition = { ...ZERO_NUTRITION };
  for (const ing of recipe.ingredients) {
    const grams = ing.grams * (ing.scalable ? multiplier : 1);
    n = addNutrition(n, nutritionForGrams(foodOf(foods, ing.foodKey), grams));
  }
  return n;
}

/** g protein per 100 kcal (0 when there are no calories). */
export function proteinDensity(n: Nutrition): number {
  return n.kcal > 0 ? (n.proteinG / n.kcal) * 100 : 0;
}

/** Builds the FoodIndex the planners use from food rows and their household units. */
export function buildFoodIndex(foods: readonly FoodRow[], units: readonly FoodUnit[]): FoodIndex {
  const index: FoodIndex = new Map();
  for (const food of foods) index.set(food.key, { food, units: [] });
  for (const u of units) {
    const entry = index.get(u.foodKey);
    if (!entry) throw new Error(`Unit for unknown food key: ${u.foodKey}`);
    entry.units.push(u);
  }
  return index;
}

/**
 * Cooking oil / ghee: a food in the 'fat' category that is measured by the teaspoon.
 * (Peanut butter is a fat too, but it's measured by the tablespoon and isn't "oil".)
 */
export function isOilFood(foods: FoodIndex, key: string): boolean {
  const entry = foods.get(key);
  if (!entry) return false;
  return entry.food.category === 'fat' && entry.units.some((u) => u.unit === 'tsp');
}

/** Oil in teaspoons for a recipe at a multiplier (written out on every label and in the dinner ping). */
export function recipeOilTsp(recipe: RecipeRow, foods: FoodIndex, multiplier = 1): number {
  let grams = 0;
  for (const ing of recipe.ingredients) {
    if (isOilFood(foods, ing.foodKey)) grams += ing.grams * (ing.scalable ? multiplier : 1);
  }
  return grams / 4.5;
}
