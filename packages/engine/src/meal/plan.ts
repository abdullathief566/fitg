// planDays (engines.md §3.4, exact): search the combinations of each slot's ranked candidates; keep the first ok day.
import type { LocalDate, Slot } from '../types/enums.ts';
import type { AddonPick, Nutrition } from '../types/nutrition.ts';
import type { MealProfile, Targets } from '../types/profile.ts';
import type { Candidates, DayShape, PlanDay, PlannedDay, PlannedMeal, Problem } from '../types/plan.ts';
import type { FoodIndex, ProteinAddon, RecipeIndex, RecipeRow } from '../types/reference.ts';
import { roundNutrition, scaleNutrition, sumNutrition } from '../nutrition/nutrition.ts';
import { toInstant } from '../util/time.ts';
import { defaultIds, type IdFactory } from '../util/uuid.ts';
import { eligibleAddons } from './eligibility.ts';
import { bestAddon, fitDay, recipePortions, violation } from './scale.ts';
import { isGymShape, recipeSlots } from './shape.ts';

/** Placeholder for a Home Food / eat-out slot: it keeps its share of the day's targets until the user picks. */
export function placeholderMeal(p: {
  date: LocalDate;
  slot: Slot;
  kind: 'home_food' | 'eat_out';
  share: number;
  targets: Targets;
  at: string;
  tz: string;
  ids: IdFactory;
}): PlannedMeal {
  return {
    id: p.ids('meal', p.date, p.slot),
    date: p.date,
    slot: p.slot,
    plannedAt: toInstant(p.date, p.at, p.tz),
    kind: p.kind,
    multiplier: 1,
    portions: [],
    addons: [],
    nutrition: roundNutrition(
      scaleNutrition(
        { kcal: p.targets.kcal, proteinG: p.targets.proteinG, carbsG: p.targets.carbsG, fatG: p.targets.fatG },
        p.share,
      ),
    ),
    status: 'planned',
    version: 1,
  };
}

/** All index combinations of the slots' candidate lists, ordered by rank sum, then lexicographically in slot order. */
export function combinations(sizes: readonly number[]): number[][] {
  const out: number[][] = [];
  const rec = (k: number, acc: number[]): void => {
    if (k === sizes.length) {
      out.push(acc);
      return;
    }
    for (let j = 0; j < (sizes[k] ?? 0); j++) rec(k + 1, [...acc, j]);
  };
  rec(0, []);
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  out.sort((a, b) => {
    const d = sum(a) - sum(b);
    if (d !== 0) return d;
    for (let i = 0; i < a.length; i++) {
      const x = (a[i] ?? 0) - (b[i] ?? 0);
      if (x !== 0) return x;
    }
    return 0;
  });
  return out;
}

export interface PlanDaysInput {
  dates: LocalDate[];
  targets: Targets;
  candidates: Candidates;
  lib: RecipeIndex;
  foods: FoodIndex;
  pantry: Set<string>;
  addons: ProteinAddon[];
  profile: MealProfile;
  shapes: Record<LocalDate, DayShape>;
  /** User's time zone (for plannedAt). */
  tz: string;
  ids?: IdFactory;
  version?: number;
}

/**
 * For each date: every combination of the recipe slots' candidates (≤ 3 each → ≤ 243), ordered by rank sum then
 * lexicographically; combinations using a recipe twice are skipped; `scaleDay` runs on each and the first ok one is
 * kept. If none is ok, the smallest violation is kept and the day is marked ok: false with a protein_short or kcal_off
 * problem. Home Food and eat-out slots keep their share and are skipped by the search.
 */
export function planDays(p: PlanDaysInput): { days: PlannedDay[]; problems: Problem[] } {
  const ids = p.ids ?? defaultIds;
  const addon = bestAddon(eligibleAddons(p.addons, p.profile.diet, p.pantry), p.foods);
  const days: PlannedDay[] = [];
  const problems: Problem[] = [];

  for (const date of p.dates) {
    const shape = p.shapes[date];
    if (!shape) continue;
    const dayProblems: Problem[] = [];
    const slotsToFill = recipeSlots(shape);
    const reservedShare = shape.slots
      .filter((s) => (s.kind ?? 'recipe') !== 'recipe')
      .reduce((a, s) => a + s.kcalShare, 0);
    const target = { kcal: p.targets.kcal * (1 - reservedShare), proteinG: p.targets.proteinG * (1 - reservedShare) };

    const lists: Array<{ slot: Slot; recipes: RecipeRow[] }> = [];
    for (const s of slotsToFill) {
      const recipes = (p.candidates[date]?.[s.slot] ?? [])
        .map((slug) => p.lib.get(slug))
        .filter((r): r is RecipeRow => r !== undefined)
        .slice(0, 3);
      if (recipes.length === 0) {
        dayProblems.push({
          code: 'slot_dropped',
          severity: 'warn',
          date,
          slot: s.slot,
          detail: `No usable candidates for ${s.slot}; the slot was left out.`,
        });
        continue;
      }
      lists.push({ slot: s.slot, recipes });
    }

    let chosen: ReturnType<typeof fitDay> | null = null;
    let bestBad: ReturnType<typeof fitDay> | null = null;
    for (const combo of combinations(lists.map((l) => l.recipes.length))) {
      const items = lists.map((l, k) => ({ slot: l.slot, recipe: l.recipes[combo[k] ?? 0]! }));
      if (new Set(items.map((i) => i.recipe.slug)).size < items.length) continue;
      const r = fitDay({ items, targets: target, addon, shape, foods: p.foods });
      if (r.ok) {
        chosen = r;
        break;
      }
      if (!bestBad || violation(r.totals, target) < violation(bestBad.totals, target)) bestBad = r;
    }
    const result = chosen ?? bestBad;
    const ok = chosen !== null && dayProblems.every((x) => x.severity !== 'error');
    if (!chosen && bestBad) {
      dayProblems.push({
        code: bestBad.reason === 'protein_short' || bestBad.reason === 'slot_minimum' ? 'protein_short' : 'kcal_off',
        severity: 'error',
        date,
        detail:
          bestBad.reason === 'protein_short' || bestBad.reason === 'slot_minimum'
            ? 'Protein falls short with these candidates.'
            : 'Calories land outside ±5% with these candidates.',
      });
    }

    const meals: PlannedMeal[] = [];
    for (const s of shape.slots) {
      const kind = s.kind ?? 'recipe';
      if (kind !== 'recipe') {
        meals.push(
          placeholderMeal({
            date,
            slot: s.slot,
            kind,
            share: s.kcalShare,
            targets: p.targets,
            at: s.at,
            tz: p.tz,
            ids,
          }),
        );
        continue;
      }
      const fitted = result?.slots.find((x) => x.slot === s.slot);
      if (!fitted) continue;
      const addons: AddonPick[] =
        addon && fitted.addonUnits > 0 ? [{ addonKey: addon.key, qty: fitted.addonUnits }] : [];
      meals.push({
        id: ids('meal', date, s.slot),
        date,
        slot: s.slot,
        plannedAt: toInstant(date, s.at, p.tz),
        kind: 'recipe',
        recipeSlug: fitted.recipe.slug,
        multiplier: fitted.multiplier,
        portions: recipePortions(fitted.recipe, p.foods, fitted.multiplier),
        addons,
        nutrition: roundNutrition(fitted.nutrition),
        status: 'planned',
        version: p.version ?? 1,
      });
    }

    const totals: Nutrition = roundNutrition(sumNutrition(meals.map((m) => m.nutrition)));
    const day: PlanDay = {
      id: ids('plan_day', date),
      date,
      isGymDay: isGymShape(shape),
      kcalTarget: p.targets.kcal,
      proteinTarget: p.targets.proteinG,
      prepTasks: [],
      tomorrowDeltaKcal: 0,
      ok,
      problems: dayProblems,
    };
    days.push({ day, shape, meals: meals.map((m) => ({ ...m, version: p.version ?? m.version })), totals });
    problems.push(...dayProblems);
  }
  return { days, problems };
}
