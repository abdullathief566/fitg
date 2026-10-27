// Daily rebalance (engines.md §3.5, exact).
import type { Instant, Slot } from '../types/enums.ts';
import type { AddonPick, Nutrition } from '../types/nutrition.ts';
import type { PlannedDay, PlannedMeal, RebalanceDiff } from '../types/plan.ts';
import type { FoodIndex, ProteinAddon, RecipeIndex, RecipeRow } from '../types/reference.ts';
import { addNutrition, roundNutrition, scaleNutrition, sumNutrition, ZERO_NUTRITION } from '../nutrition/nutrition.ts';
import { round } from '../util/round.ts';
import { humanizeSlug, plural } from '../util/format.ts';
import { msOf } from '../util/time.ts';
import { bestAddon, fitDay, recipePortions } from './scale.ts';

export const REBALANCE_BOUNDS = { min: 0.5, max: 1.5 } as const;
export const MAX_TOMORROW_CARRY = 200;

/**
 * consumed = eaten + half + replaced (the off-plan log's nutrition) + `unknown` and still-`planned` meals whose time
 * has passed, counted as eaten as planned (FitG assumes you followed the plan and asks once).
 */
export function consumedSoFar(
  meals: readonly PlannedMeal[],
  logs: ReadonlyMap<string, Nutrition>,
  now: Instant,
): Nutrition {
  let n: Nutrition = { ...ZERO_NUTRITION };
  for (const m of meals) {
    switch (m.status) {
      case 'eaten':
        n = addNutrition(n, m.nutrition);
        break;
      case 'half':
        n = addNutrition(n, scaleNutrition(m.nutrition, 0.5));
        break;
      case 'replaced': {
        const log = m.replacedByLogId ? logs.get(m.replacedByLogId) : undefined;
        if (log) n = addNutrition(n, log);
        break;
      }
      case 'unknown':
        n = addNutrition(n, m.nutrition);
        break;
      case 'planned':
        if (m.plannedAt && msOf(m.plannedAt) <= msOf(now)) n = addNutrition(n, m.nutrition);
        break;
      case 'skipped':
        break;
    }
  }
  return n;
}

/** Meals still to come: planned and not yet due. */
export function remainingMeals(meals: readonly PlannedMeal[], now: Instant): PlannedMeal[] {
  return meals.filter((m) => m.status === 'planned' && m.plannedAt !== '' && msOf(m.plannedAt) > msOf(now));
}

function addonLabel(addons: readonly AddonPick[]): string | null {
  const a = addons[0];
  return a ? `${a.addonKey} x${a.qty}` : null;
}

export interface RebalanceResult {
  remaining: PlannedMeal[];
  diff: RebalanceDiff[];
  tomorrowDeltaKcal: number;
}

/**
 * 1. need = targets − consumed (kcal floored at 0).
 * 2. The scaleDay steps run on the remaining recipe meals against `need`, starting from ×1 with no add-ons, with
 *    multipliers clamped to [0.5, 1.5] (and the recipe's bounds) and the day's add-on caps (units already used today
 *    count). Home Food / eat-out placeholders still to come count as fixed.
 * 3. If the day still ends more than 5% over the kcal target: tomorrowDeltaKcal = −min(200, round(overflow, 10)).
 *    Under-eating never carries forward.
 * 4. diff = what changed per remaining meal (multiplier, add-on).
 */
export function rebalanceDay(p: {
  day: PlannedDay;
  consumed: Nutrition;
  remaining: PlannedMeal[];
  targets: { kcal: number; proteinG: number };
  addons: ProteinAddon[];
  foods: FoodIndex;
  now: Instant;
  /** Recipes for the remaining meals. */
  lib: RecipeIndex;
}): RebalanceResult {
  const remainingIds = new Set(p.remaining.map((m) => m.id));
  const usedToday = p.day.meals
    .filter((m) => !remainingIds.has(m.id))
    .reduce((s, m) => s + m.addons.reduce((a, x) => a + x.qty, 0), 0);

  const recipeMeals: Array<{ meal: PlannedMeal; recipe: RecipeRow }> = [];
  const fixed: PlannedMeal[] = [];
  for (const m of p.remaining) {
    const recipe = m.kind === 'recipe' && m.recipeSlug ? p.lib.get(m.recipeSlug) : undefined;
    if (recipe) recipeMeals.push({ meal: m, recipe });
    else fixed.push(m);
  }
  const fixedN = sumNutrition(fixed.map((m) => m.nutrition));
  const need = {
    kcal: Math.max(0, p.targets.kcal - p.consumed.kcal - fixedN.kcal),
    proteinG: Math.max(0, p.targets.proteinG - p.consumed.proteinG - fixedN.proteinG),
  };

  const addon = bestAddon(p.addons, p.foods);
  const r = fitDay({
    items: recipeMeals.map((x) => ({ recipe: x.recipe, slot: x.meal.slot })),
    targets: need,
    addon,
    shape: p.day.shape,
    foods: p.foods,
    bounds: REBALANCE_BOUNDS,
    usedToday,
  });

  const diff: RebalanceDiff[] = [];
  const updated = new Map<string, PlannedMeal>();
  for (const x of recipeMeals) {
    const fitted = r.slots.find((s) => s.slot === x.meal.slot);
    if (!fitted) continue;
    const addons: AddonPick[] = addon && fitted.addonUnits > 0 ? [{ addonKey: addon.key, qty: fitted.addonUnits }] : [];
    const meal: PlannedMeal = {
      ...x.meal,
      multiplier: fitted.multiplier,
      addons,
      portions: recipePortions(x.recipe, p.foods, fitted.multiplier),
      nutrition: roundNutrition(fitted.nutrition),
    };
    updated.set(meal.id, meal);
    if (fitted.multiplier !== x.meal.multiplier) {
      diff.push({
        itemId: meal.id,
        slot: meal.slot,
        field: 'multiplier',
        from: x.meal.multiplier,
        to: fitted.multiplier,
      });
    }
    const before = addonLabel(x.meal.addons);
    const after = addonLabel(addons);
    if (before !== after) {
      diff.push({ itemId: meal.id, slot: meal.slot, field: 'addon', from: before, to: after ?? 'none' });
    }
  }

  const dayKcal = p.consumed.kcal + fixedN.kcal + r.totals.kcal;
  const overflow = dayKcal - p.targets.kcal;
  const tomorrowDeltaKcal = overflow > 0.05 * p.targets.kcal ? -Math.min(MAX_TOMORROW_CARRY, round(overflow, 10)) : 0;

  return {
    remaining: p.remaining.map((m) => updated.get(m.id) ?? m),
    diff,
    tomorrowDeltaKcal,
  };
}

const SLOT_WORDS: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  post_workout: 'Your post-workout meal',
  dinner: 'Dinner',
  snack: 'Your snack',
};

/**
 * The code-templated line for a rebalance (the fallback when the fast model doesn't reword it). Only numbers from the
 * diff appear. E.g. "Dinner's a bit smaller tonight, plus 1 boiled egg."
 */
export function describeRebalance(diff: readonly RebalanceDiff[], addonNames: ReadonlyMap<string, string>): string {
  if (diff.length === 0) return 'Your plan for the rest of today stays the same.';
  const bySlot = new Map<Slot, { m?: RebalanceDiff; a?: RebalanceDiff }>();
  for (const d of diff) {
    const e = bySlot.get(d.slot) ?? {};
    if (d.field === 'multiplier') e.m = d;
    else e.a = d;
    bySlot.set(d.slot, e);
  }
  const order: Slot[] = ['dinner', 'post_workout', 'lunch', 'snack', 'breakfast'];
  const clauses: string[] = [];
  for (const slot of order) {
    const e = bySlot.get(slot);
    if (!e) continue;
    const size =
      e.m && typeof e.m.from === 'number' && typeof e.m.to === 'number'
        ? e.m.to < e.m.from
          ? 'a bit smaller'
          : 'a bit bigger'
        : null;
    let extra: string | null = null;
    if (e.a && typeof e.a.to === 'string' && e.a.to !== 'none') {
      const [key = '', qtyPart = '1'] = e.a.to.split(' x');
      extra = addonPhrase(key, Number(qtyPart), addonNames);
    }
    if (size && extra) clauses.push(`${SLOT_WORDS[slot]} is ${size}, plus ${extra}`);
    else if (size) clauses.push(`${SLOT_WORDS[slot]} is ${size}`);
    else if (extra) clauses.push(`${SLOT_WORDS[slot]} gets ${extra}`);
    if (clauses.length === 2) break;
  }
  return clauses.length === 0 ? 'Your plan for the rest of today stays the same.' : `${clauses.join('; ')}.`;
}

function addonPhrase(key: string, qty: number, names: ReadonlyMap<string, string>): string {
  const name = (names.get(key) ?? humanizeSlug(key)).toLowerCase();
  if (qty <= 1) return `1 ${name}`;
  if (name.includes('(')) return `${qty} × ${name}`;
  return `${qty} ${plural(name, qty)}`;
}
