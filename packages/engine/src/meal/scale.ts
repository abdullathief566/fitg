// scaleDay (engines.md §3.4, exact): protein first, then calories, adjusting the least protein-dense food first.
// The same fitting core runs the daily rebalance (§3.5) with tighter multiplier bounds.
import type { LocalDate, Slot } from '../types/enums.ts';
import type { AddonPick, Nutrition, Portion } from '../types/nutrition.ts';
import type { DayShape, PlannedMeal } from '../types/plan.ts';
import type { FoodIndex, ProteinAddon, RecipeRow } from '../types/reference.ts';
import {
  addNutrition,
  foodOf,
  nutritionForGrams,
  proteinDensity,
  recipeNutrition,
  roundNutrition,
  scaleNutrition,
  sumNutrition,
  ZERO_NUTRITION,
} from '../nutrition/nutrition.ts';
import { portionLabel } from '../units/units.ts';
import { toInstant } from '../util/time.ts';
import { defaultIds, type IdFactory } from '../util/uuid.ts';

/** Where an add-on goes first, and which item grows first on a calorie tie. */
export const GROW_ORDER: readonly Slot[] = ['post_workout', 'dinner', 'lunch', 'breakfast', 'snack'];
/** Which item shrinks first on a protein-density tie. */
export const REDUCE_ORDER: readonly Slot[] = ['snack', 'breakfast', 'lunch', 'dinner', 'post_workout'];
export const ADDON_CAP_PER_SLOT = 2;
export const ADDON_CAP_PER_DAY = 3;
export const MAX_FIT_ITERATIONS = 80;

/** Lowest kcal per gram of protein (tie → key). */
export function bestAddon(addons: readonly ProteinAddon[], foods: FoodIndex): ProteinAddon | null {
  let best: ProteinAddon | null = null;
  let bestRatio = Infinity;
  for (const a of addons) {
    const n = nutritionForGrams(foodOf(foods, a.foodKey), a.gramsPerUnit);
    if (n.proteinG <= 0) continue;
    const ratio = n.kcal / n.proteinG;
    if (ratio < bestRatio || (ratio === bestRatio && best !== null && a.key < best.key)) {
      best = a;
      bestRatio = ratio;
    }
  }
  return best;
}

export function addonNutrition(addon: ProteinAddon, foods: FoodIndex, qty = 1): Nutrition {
  return scaleNutrition(nutritionForGrams(foodOf(foods, addon.foodKey), addon.gramsPerUnit), qty);
}

interface FitItem {
  slot: Slot;
  recipe: RecipeRow;
  m: number;
  minM: number;
  maxM: number;
  step: number;
  /** g protein per 100 kcal of the recipe at multiplier 1. */
  density: number;
  addonUnits: number;
  proteinMinG?: number;
}

interface FitContext {
  foods: FoodIndex;
  addon: ProteinAddon | null;
  addonN: Nutrition;
  /** Add-on units already used today (meals outside this fit). */
  usedToday: number;
}

function itemNutrition(it: FitItem, ctx: FitContext, m = it.m): Nutrition {
  const n = recipeNutrition(it.recipe, ctx.foods, m);
  return it.addonUnits > 0 ? addNutrition(n, scaleNutrition(ctx.addonN, it.addonUnits)) : n;
}

function totals(items: readonly FitItem[], ctx: FitContext): Nutrition {
  return sumNutrition(items.map((it) => itemNutrition(it, ctx)));
}

function unitsUsed(items: readonly FitItem[], ctx: FitContext): number {
  return ctx.usedToday + items.reduce((s, it) => s + it.addonUnits, 0);
}

function canAdd(it: FitItem, items: readonly FitItem[], ctx: FitContext): boolean {
  return ctx.addon !== null && it.addonUnits < ADDON_CAP_PER_SLOT && unitsUsed(items, ctx) < ADDON_CAP_PER_DAY;
}

const EPS = 1e-9;

/** Steps 2–3 of scaleDay: slot minimums, then the loop. Mutates `items`. */
function fit(items: FitItem[], target: { kcal: number; proteinG: number }, ctx: FitContext): void {
  // 2. Slot minimums.
  for (const it of items) {
    const min = it.proteinMinG;
    while (min !== undefined && itemNutrition(it, ctx).proteinG < min && canAdd(it, items, ctx)) it.addonUnits++;
  }
  // 3. The loop: first matching rule wins each iteration.
  for (let k = 0; k < MAX_FIT_ITERATIONS; k++) {
    const t = totals(items, ctx);
    if (t.proteinG < 0.95 * target.proteinG) {
      const slotWithRoom = GROW_ORDER.map((s) => items.find((i) => i.slot === s)).find(
        (i): i is FitItem => i !== undefined && canAdd(i, items, ctx),
      );
      if (slotWithRoom) {
        slotWithRoom.addonUnits++;
        continue;
      }
    }
    if (t.kcal > 1.05 * target.kcal) {
      const down = items
        .filter(
          (i) =>
            i.m - i.step >= i.minM - EPS &&
            (i.proteinMinG === undefined || itemNutrition(i, ctx, i.m - i.step).proteinG >= i.proteinMinG),
        )
        .sort((a, b) => a.density - b.density || REDUCE_ORDER.indexOf(a.slot) - REDUCE_ORDER.indexOf(b.slot))[0];
      if (down) {
        down.m -= down.step;
        continue;
      }
    }
    if (t.kcal < 0.95 * target.kcal) {
      const up = items
        .filter((i) => i.m + i.step <= i.maxM + EPS)
        .sort((a, b) => b.density - a.density || GROW_ORDER.indexOf(a.slot) - GROW_ORDER.indexOf(b.slot))[0];
      if (up) {
        up.m += up.step;
        continue;
      }
    }
    break;
  }
}

function makeFitItems(
  items: ReadonlyArray<{ recipe: RecipeRow; slot: Slot }>,
  shape: DayShape,
  foods: FoodIndex,
  bounds?: { min: number; max: number },
): FitItem[] {
  return items.map(({ recipe, slot }) => {
    const shapeSlot = shape.slots.find((s) => s.slot === slot);
    const item: FitItem = {
      slot,
      recipe,
      m: 1,
      minM: Math.max(recipe.scaleRules.minMult, bounds?.min ?? -Infinity),
      maxM: Math.min(recipe.scaleRules.maxMult, bounds?.max ?? Infinity),
      step: recipe.scaleRules.step,
      density: proteinDensity(recipeNutrition(recipe, foods, 1)),
      addonUnits: 0,
    };
    if (shapeSlot?.proteinMinG !== undefined) item.proteinMinG = shapeSlot.proteinMinG;
    return item;
  });
}

function evaluate(items: readonly FitItem[], target: { kcal: number; proteinG: number }, ctx: FitContext) {
  const t = totals(items, ctx);
  const minsMet = items.every(
    (it) => it.proteinMinG === undefined || itemNutrition(it, ctx).proteinG >= it.proteinMinG,
  );
  const kcalOk = Math.abs(t.kcal - target.kcal) <= 0.05 * target.kcal;
  const proteinOk = t.proteinG >= 0.95 * target.proteinG;
  const ok = kcalOk && proteinOk && minsMet;
  const reason = ok ? undefined : !proteinOk ? 'protein_short' : !kcalOk ? 'kcal_off' : 'slot_minimum';
  return { totals: t, ok, reason };
}

/** Portions for a recipe at a multiplier: exact grams, rounded household quantity on the label. Oil is always listed. */
export function recipePortions(recipe: RecipeRow, foods: FoodIndex, multiplier: number): Portion[] {
  return recipe.ingredients.map((ing) => {
    const k = ing.scalable ? multiplier : 1;
    const grams = ing.grams * k;
    const qty = ing.qty * k;
    return {
      foodKey: ing.foodKey,
      grams,
      unit: ing.unit,
      qty,
      label: portionLabel(foodOf(foods, ing.foodKey), ing.unit, qty, grams),
    };
  });
}

export interface MealContext {
  date?: LocalDate;
  tz?: string;
  ids?: IdFactory;
}

function toPlannedMeal(it: FitItem, ctx: FitContext, shape: DayShape, mc: MealContext): PlannedMeal {
  const ids = mc.ids ?? defaultIds;
  const date = mc.date ?? '';
  const at = shape.slots.find((s) => s.slot === it.slot)?.at;
  const addons: AddonPick[] = ctx.addon && it.addonUnits > 0 ? [{ addonKey: ctx.addon.key, qty: it.addonUnits }] : [];
  return {
    id: ids('meal', date, it.slot),
    date,
    slot: it.slot,
    plannedAt: mc.date && mc.tz && at ? toInstant(mc.date, at, mc.tz) : '',
    kind: 'recipe',
    recipeSlug: it.recipe.slug,
    multiplier: it.m,
    portions: recipePortions(it.recipe, ctx.foods, it.m),
    addons,
    nutrition: roundNutrition(itemNutrition(it, ctx)),
    status: 'planned',
    version: 1,
  };
}

export interface ScaleDayResult {
  items: PlannedMeal[];
  totals: Nutrition;
  ok: boolean;
  reason?: string;
}

/**
 * 1. Multipliers start at 1.0; the add-on is the eligible one with the lowest kcal per gram of protein (the caller
 *    passes eligible add-ons: diet-compatible and in the pantry). Caps: 2 units per slot, 3 per day.
 * 2. Slot minimums. 3. Loop (≤ 80): add protein → shrink the least protein-dense item (never below a slot minimum)
 *    → grow the most protein-dense item → stop. 4. ok = kcal within ±5%, protein ≥ 95%, every slot minimum met.
 * Pass `date` and `tz` (and `ids`) when the meals will be stored: they set ids and plannedAt.
 */
export function scaleDay(
  p: {
    items: Array<{ recipe: RecipeRow; slot: Slot }>;
    targets: { kcal: number; proteinG: number };
    addons: ProteinAddon[];
    shape: DayShape;
    foods: FoodIndex;
  } & MealContext,
): ScaleDayResult {
  const addon = bestAddon(p.addons, p.foods);
  const ctx: FitContext = {
    foods: p.foods,
    addon,
    addonN: addon ? addonNutrition(addon, p.foods) : { ...ZERO_NUTRITION },
    usedToday: 0,
  };
  const items = makeFitItems(p.items, p.shape, p.foods);
  fit(items, p.targets, ctx);
  const e = evaluate(items, p.targets, ctx);
  const result: ScaleDayResult = {
    items: items.map((it) => toPlannedMeal(it, ctx, p.shape, p)),
    totals: roundNutrition(e.totals),
    ok: e.ok,
  };
  if (e.reason) result.reason = e.reason;
  return result;
}

/** How far a fitted day is from ok: kcal beyond ±5% / target + protein shortfall below 95% / target. */
export function violation(t: Nutrition, target: { kcal: number; proteinG: number }): number {
  return (
    Math.max(0, Math.abs(t.kcal - target.kcal) - 0.05 * target.kcal) / target.kcal +
    Math.max(0, 0.95 * target.proteinG - t.proteinG) / target.proteinG
  );
}

/** Internal fitting API shared with planDays and rebalanceDay (exact totals, no rounding). */
export function fitDay(p: {
  items: ReadonlyArray<{ recipe: RecipeRow; slot: Slot }>;
  targets: { kcal: number; proteinG: number };
  addon: ProteinAddon | null;
  shape: DayShape;
  foods: FoodIndex;
  bounds?: { min: number; max: number };
  usedToday?: number;
}): {
  slots: Array<{ slot: Slot; recipe: RecipeRow; multiplier: number; addonUnits: number; nutrition: Nutrition }>;
  totals: Nutrition;
  ok: boolean;
  reason?: string;
} {
  const ctx: FitContext = {
    foods: p.foods,
    addon: p.addon,
    addonN: p.addon ? addonNutrition(p.addon, p.foods) : { ...ZERO_NUTRITION },
    usedToday: p.usedToday ?? 0,
  };
  const items = makeFitItems(p.items, p.shape, p.foods, p.bounds);
  fit(items, p.targets, ctx);
  const e = evaluate(items, p.targets, ctx);
  const out = {
    slots: items.map((it) => ({
      slot: it.slot,
      recipe: it.recipe,
      multiplier: it.m,
      addonUnits: it.addonUnits,
      nutrition: itemNutrition(it, ctx),
    })),
    totals: e.totals,
    ok: e.ok,
  };
  return e.reason ? { ...out, reason: e.reason } : out;
}
