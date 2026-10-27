// Eat-out mode (engines.md §3.7): pick the best option from a menu the user typed or photographed.
import type { Nutrition, Portion } from '../types/nutrition.ts';
import type { ResolvedFood } from '../types/plan.ts';
import { roundNutrition, scaleNutrition } from '../nutrition/nutrition.ts';
import { fmtQty, plural } from '../util/format.ts';

const PORTIONS = [0.5, 1, 1.5] as const;

function scaledPortion(food: ResolvedFood, k: number): Portion {
  const base = food.standardPortion;
  const qty = base.qty * k;
  const unitWord = base.unit === 'g' || base.unit === 'ml' ? base.unit : plural(base.unit, qty);
  return { ...base, grams: base.grams * k, qty, label: `${fmtQty(qty)} ${unitWord} ${food.name.toLowerCase()}` };
}

/**
 * Among options with kcal ≤ 1.2 × slot kcal at a standard portion (0.5 / 1 / 1.5), pick the highest protein per kcal;
 * its portion is the qualifying one closest to the slot's calories. Runner-up = the second-best option. If none
 * qualify, pick the lowest-kcal option at 0.5 portion and flag `overTarget` so the UI can say so.
 */
export function pickEatOut(p: { options: ResolvedFood[]; slotTarget: Nutrition }): {
  pick: ResolvedFood;
  portion: Portion;
  nutrition: Nutrition;
  runnerUp?: ResolvedFood;
  overTarget?: boolean;
} {
  if (p.options.length === 0) throw new Error('pickEatOut: no options');
  const limit = 1.2 * p.slotTarget.kcal;
  const qualifying = p.options
    .map((o) => {
      const fits = PORTIONS.filter((k) => o.nutrition.kcal * k <= limit);
      if (fits.length === 0) return null;
      const k = fits.reduce((best, x) =>
        Math.abs(o.nutrition.kcal * x - p.slotTarget.kcal) < Math.abs(o.nutrition.kcal * best - p.slotTarget.kcal)
          ? x
          : best,
      );
      const density = o.nutrition.kcal > 0 ? o.nutrition.proteinG / o.nutrition.kcal : 0;
      return { o, k, density };
    })
    .filter((x): x is { o: ResolvedFood; k: (typeof PORTIONS)[number]; density: number } => x !== null)
    .sort((a, b) => b.density - a.density || a.o.name.localeCompare(b.o.name));

  const best = qualifying[0];
  if (best) {
    const result: {
      pick: ResolvedFood;
      portion: Portion;
      nutrition: Nutrition;
      runnerUp?: ResolvedFood;
    } = {
      pick: best.o,
      portion: scaledPortion(best.o, best.k),
      nutrition: roundNutrition(scaleNutrition(best.o.nutrition, best.k)),
    };
    const second = qualifying[1];
    if (second) result.runnerUp = second.o;
    return result;
  }
  const lightest = [...p.options].sort((a, b) => a.nutrition.kcal - b.nutrition.kcal)[0]!;
  return {
    pick: lightest,
    portion: scaledPortion(lightest, 0.5),
    nutrition: roundNutrition(scaleNutrition(lightest.nutrition, 0.5)),
    overTarget: true,
  };
}
