// Recipe and add-on eligibility (engines.md §3.3).
import type { Diet, LocalDate, Slot } from '../types/enums.ts';
import type { MealProfile } from '../types/profile.ts';
import type { ProblemCode } from '../types/plan.ts';
import type { ProteinAddon, RecipeIndex, RecipeRow } from '../types/reference.ts';
import { weekdayOf } from '../util/time.ts';

/** Which recipe diet tags each user diet may eat. */
export const DIET_ALLOWS: Record<Diet, readonly Diet[]> = {
  vegan: ['vegan'],
  veg: ['vegan', 'veg'],
  eggetarian: ['vegan', 'veg', 'eggetarian'],
  non_veg: ['vegan', 'veg', 'eggetarian', 'non_veg'],
};

export function dietAllows(userDiet: Diet, tags: readonly Diet[]): boolean {
  const allowed = DIET_ALLOWS[userDiet];
  return tags.some((t) => allowed.includes(t));
}

export function isComponent(recipe: RecipeRow): boolean {
  return recipe.tags.includes('component');
}

const lower = (xs: readonly string[]): string[] => xs.map((x) => x.toLowerCase());

/** Profile-level eligibility (independent of slot and date): what may appear on this user's menu at all. */
export function menuIneligibility(recipe: RecipeRow, profile: MealProfile): ProblemCode | null {
  if (isComponent(recipe)) return 'component';
  if (recipe.isDraft && !profile.allowDrafts) return 'draft';
  if (!dietAllows(profile.diet, recipe.dietTags)) return 'diet';
  const allergies = lower(profile.allergies);
  if (recipe.allergens.some((a) => allergies.includes(a.toLowerCase()))) return 'allergen';
  const dislikes = new Set(lower([...profile.dislikes, ...profile.memoryDislikes]));
  if (dislikes.has(recipe.slug.toLowerCase()) || recipe.ingredients.some((i) => dislikes.has(i.foodKey.toLowerCase())))
    return 'dislike';
  if (!recipe.requires.every((k) => profile.pantry.has(k))) return 'requires_missing';
  return null;
}

/** Weekday (Mon–Fri) lunch/dinner must be quick: cookTimeMin ≤ cookTimePref + 10. */
export function cookTimeOk(recipe: RecipeRow, slot: Slot, date: LocalDate, profile: MealProfile): boolean {
  const weekday = weekdayOf(date) <= 4;
  if (!weekday || (slot !== 'lunch' && slot !== 'dinner')) return true;
  return recipe.cookTimeMin <= profile.cookTimePref + 10;
}

/**
 * Why a recipe can't go in a slot on a date, or null when it is eligible. Order: unknown → component → draft →
 * wrong slot → diet → allergen → dislike → requires_missing → cook_time.
 */
export function recipeIneligibility(
  slug: string,
  slot: Slot,
  date: LocalDate,
  lib: RecipeIndex,
  profile: MealProfile,
): ProblemCode | null {
  const recipe = lib.get(slug);
  if (!recipe) return 'unknown_slug';
  if (isComponent(recipe)) return 'component';
  if (recipe.isDraft && !profile.allowDrafts) return 'draft';
  if (!recipe.mealSlots.includes(slot)) return 'wrong_slot';
  const why = menuIneligibility(recipe, profile);
  if (why) return why;
  if (!cookTimeOk(recipe, slot, date, profile)) return 'cook_time';
  return null;
}

export function isEligible(slug: string, slot: Slot, date: LocalDate, lib: RecipeIndex, profile: MealProfile): boolean {
  return recipeIneligibility(slug, slot, date, lib, profile) === null;
}

/** Diet-compatible add-ons whose pantry food is in the kitchen. */
export function eligibleAddons(
  addons: readonly ProteinAddon[],
  diet: Diet,
  pantry: ReadonlySet<string>,
): ProteinAddon[] {
  return addons.filter((a) => dietAllows(diet, a.dietTags) && pantry.has(a.pantryFoodKey));
}
