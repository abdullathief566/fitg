// Candidates and validation (engines.md §3.3): the no-AI planner, the AI fallback, and the check every AI plan passes.
import type { LocalDate, Slot } from '../types/enums.ts';
import type { MealProfile } from '../types/profile.ts';
import type { Candidates, DayShape, Problem } from '../types/plan.ts';
import type { FoodIndex, RecipeIndex, RecipeRow } from '../types/reference.ts';
import { isOilFood, proteinDensity, recipeNutrition } from '../nutrition/nutrition.ts';
import { mulberry32 } from '../util/hash.ts';
import { addDays } from '../util/time.ts';
import { recipeIneligibility } from './eligibility.ts';
import { recipeSlots } from './shape.ts';

const PROTEIN_SCORED_SLOTS: ReadonlySet<Slot> = new Set<Slot>(['breakfast', 'lunch', 'post_workout', 'dinner']);

/** Share of a recipe's non-oil ingredient foods that are in the pantry. */
export function pantryCoverage(recipe: RecipeRow, foods: FoodIndex, pantry: ReadonlySet<string>): number {
  const keys = recipe.ingredients.filter((i) => !isOilFood(foods, i.foodKey)).map((i) => i.foodKey);
  if (keys.length === 0) return 1;
  return keys.filter((k) => pantry.has(k)).length / keys.length;
}

export function cuisineMatches(recipe: RecipeRow, profile: Pick<MealProfile, 'cuisine'>): boolean {
  return profile.cuisine === 'mixed' || recipe.cuisine === 'mixed' || recipe.cuisine === profile.cuisine;
}

/**
 * 2 × pantryCoverage + (cuisine match ? 1 : 0) + (costTier ≤ budgetTier ? 1 : 0) + proteinDensity / 5
 * (density = g protein per 100 kcal at multiplier 1; the term applies to breakfast, lunch, post_workout and dinner).
 */
export function candidateScore(recipe: RecipeRow, slot: Slot, foods: FoodIndex, profile: MealProfile): number {
  const density = PROTEIN_SCORED_SLOTS.has(slot) ? proteinDensity(recipeNutrition(recipe, foods, 1)) / 5 : 0;
  return (
    2 * pantryCoverage(recipe, foods, profile.pantry) +
    (cuisineMatches(recipe, profile) ? 1 : 0) +
    (recipe.costTier <= profile.budgetTier ? 1 : 0) +
    density
  );
}

/** Eligible recipes for a slot on a date, best first (score desc, ties by slug). */
export function rankedEligible(
  slot: Slot,
  date: LocalDate,
  lib: RecipeIndex,
  foods: FoodIndex,
  profile: MealProfile,
): string[] {
  const scored: Array<{ slug: string; score: number }> = [];
  for (const recipe of lib.values()) {
    if (recipeIneligibility(recipe.slug, slot, date, lib, profile) !== null) continue;
    scored.push({ slug: recipe.slug, score: candidateScore(recipe, slot, foods, profile) });
  }
  scored.sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return scored.map((s) => s.slug);
}

function rotate<T>(xs: readonly T[], k: number): T[] {
  if (xs.length === 0) return [];
  const n = ((k % xs.length) + xs.length) % xs.length;
  return [...xs.slice(n), ...xs.slice(0, n)];
}

/**
 * The no-AI planner and the AI fallback. Per date and recipe slot (slot order): rank eligible recipes, then
 * - lunch: when cookTimePref ≤ 20 and yesterday's first-choice dinner is eligible, it goes first (cook once, eat twice);
 * - breakfast: once 3 distinct first-choice breakfasts are used, only those 3 are allowed;
 * - a recipe at most once a day: recipes already first choice in an earlier slot that day are excluded;
 * - breakfast rotates among its top 3 by day ((dayIndex + seed offset) % 3);
 * then the top 3 are kept. `seed` only moves the breakfast rotation, so the same seed always gives the same plan.
 */
export function deterministicCandidates(p: {
  dates: LocalDate[];
  lib: RecipeIndex;
  foods: FoodIndex;
  profile: MealProfile;
  shapes: Record<LocalDate, DayShape>;
  seed: number;
}): Candidates {
  const offset = Math.floor(mulberry32(p.seed)() * 3);
  const out: Candidates = {};
  const usedBreakfasts: string[] = [];
  let prevDinner: string | undefined;
  p.dates.forEach((date, dayIndex) => {
    const shape = p.shapes[date];
    if (!shape) return;
    const day: Partial<Record<Slot, string[]>> = {};
    const firstChoices: string[] = [];
    let dinnerFirst: string | undefined;
    for (const { slot } of recipeSlots(shape)) {
      let list = rankedEligible(slot, date, p.lib, p.foods, p.profile);
      if (slot === 'lunch' && p.profile.cookTimePref <= 20 && prevDinner && list.includes(prevDinner)) {
        list = [prevDinner, ...list.filter((x) => x !== prevDinner)];
      }
      if (slot === 'breakfast' && usedBreakfasts.length >= 3) {
        const allowed = list.filter((x) => usedBreakfasts.includes(x));
        if (allowed.length > 0) list = allowed;
      }
      const unique = list.filter((x) => !firstChoices.includes(x));
      if (unique.length > 0) list = unique;
      if (slot === 'breakfast') list = [...rotate(list.slice(0, 3), dayIndex + offset), ...list.slice(3)];
      const top = list.slice(0, 3);
      if (top.length === 0) continue;
      day[slot] = top;
      firstChoices.push(top[0]!);
      if (slot === 'breakfast' && !usedBreakfasts.includes(top[0]!)) usedBreakfasts.push(top[0]!);
      if (slot === 'dinner') dinnerFirst = top[0];
    }
    prevDinner = dinnerFirst;
    out[date] = day;
  });
  return out;
}

/**
 * Errors reject an AI plan; warnings are logged.
 * error: unknown slug, ineligible recipe (component, draft, wrong slot, diet, allergen, dislike, requires_missing,
 *   cook_time), a recipe slot in the shape with no candidates, duplicate slugs in one slot's list,
 *   more than 3 distinct first-choice breakfasts in the week;
 * warn: cookTimePref ≤ 20 and fewer than 3 "cook once, eat twice" pairs (first-choice dinner(d) = lunch(d+1)).
 */
export function validateCandidates(
  c: Candidates,
  lib: RecipeIndex,
  profile: MealProfile,
  shapes: Record<LocalDate, DayShape>,
): Problem[] {
  const problems: Problem[] = [];
  const dates = Object.keys(shapes).sort();
  for (const date of dates) {
    const shape = shapes[date];
    if (!shape) continue;
    for (const { slot } of recipeSlots(shape)) {
      const list = c[date]?.[slot] ?? [];
      if (list.length === 0) {
        problems.push({ code: 'no_candidates', severity: 'error', date, slot, detail: `No candidates for ${slot}.` });
        continue;
      }
      if (new Set(list).size !== list.length) {
        problems.push({
          code: 'duplicate_in_day',
          severity: 'error',
          date,
          slot,
          detail: `The same recipe is listed twice for ${slot}.`,
        });
      }
      for (const slug of list) {
        const code = recipeIneligibility(slug, slot, date, lib, profile);
        if (code)
          problems.push({ code, severity: 'error', date, slot, slug, detail: `${slug} can't be ${slot}: ${code}.` });
      }
    }
  }

  const first = (date: LocalDate, slot: Slot): string | undefined => c[date]?.[slot]?.[0];
  const breakfasts = new Set(dates.map((d) => first(d, 'breakfast')).filter((x): x is string => x !== undefined));
  if (breakfasts.size > 3) {
    problems.push({
      code: 'too_many_breakfasts',
      severity: 'error',
      detail: `${breakfasts.size} different breakfasts this week; the limit is 3.`,
    });
  }

  if (profile.cookTimePref <= 20) {
    let pairs = 0;
    for (const date of dates) {
      const next = addDays(date, 1);
      if (!shapes[next]) continue;
      const dinner = first(date, 'dinner');
      if (dinner && dinner === first(next, 'lunch')) pairs++;
    }
    if (pairs < 3) {
      problems.push({
        code: 'cook_once_pairs',
        severity: 'warn',
        detail: `Only ${pairs} cook-once-eat-twice pairs this week.`,
      });
    }
  }
  return problems;
}

export function hasErrors(problems: readonly Problem[]): boolean {
  return problems.some((p) => p.severity === 'error');
}
