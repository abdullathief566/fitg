// The menus the AI chooses from (ai-orchestration.md §4, plan_week input). The AI may only pick ids from these.
import type { Cuisine, Diet, Equipment, Slot } from '../types/enums.ts';
import type { MealProfile } from '../types/profile.ts';
import type { ExerciseLib, FoodIndex, RecipeIndex, WorkoutTemplate } from '../types/reference.ts';
import { proteinDensity, recipeNutrition } from '../nutrition/nutrition.ts';
import { isAvailable, isInjurySafe } from '../workout/select.ts';
import { menuIneligibility } from './eligibility.ts';

export interface RecipeMenuItem {
  slug: string;
  name: string;
  slots: Slot[];
  diet: Diet[];
  cuisine: Cuisine;
  tags: string[];
  cookTimeMin: number;
  costTier: 1 | 2 | 3;
  proteinLevel: 'high' | 'med' | 'low';
  kcalLevel: 'light' | 'medium' | 'hearty';
}

/** g protein per 100 kcal: ≥ 7 high, ≥ 4.5 med, else low. */
export function proteinLevelOf(density: number): RecipeMenuItem['proteinLevel'] {
  return density >= 7 ? 'high' : density >= 4.5 ? 'med' : 'low';
}

/** kcal per serving: < 350 light, < 550 medium, else hearty. */
export function kcalLevelOf(kcal: number): RecipeMenuItem['kcalLevel'] {
  return kcal < 350 ? 'light' : kcal < 550 ? 'medium' : 'hearty';
}

/**
 * Recipes this user may be offered at all (not a component, not a draft unless allowed, diet, allergens, dislikes,
 * required pantry foods). Cooking time depends on the day, so long recipes stay on the menu for weekends;
 * validateCandidates rejects them on weekdays.
 */
export function recipeMenu(lib: RecipeIndex, foods: FoodIndex, profile: MealProfile): RecipeMenuItem[] {
  const out: RecipeMenuItem[] = [];
  for (const r of lib.values()) {
    if (menuIneligibility(r, profile) !== null) continue;
    const n = recipeNutrition(r, foods, 1);
    out.push({
      slug: r.slug,
      name: r.name,
      slots: [...r.mealSlots],
      diet: [...r.dietTags],
      cuisine: r.cuisine,
      tags: [...r.tags],
      cookTimeMin: r.cookTimeMin,
      costTier: r.costTier,
      proteinLevel: proteinLevelOf(proteinDensity(n)),
      kcalLevel: kcalLevelOf(n.kcal),
    });
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export interface ExerciseMenuSlot {
  slotId: string;
  pattern: string;
  options: Array<{ id: string; name: string; equipment: string[]; isMachine: boolean }>;
}

/** Per template slot: the slot's preferred list minus injury-tagged and unavailable exercises. */
export function exerciseMenu(
  template: WorkoutTemplate,
  lib: ExerciseLib,
  injuries: readonly string[],
  equipment: Equipment,
): ExerciseMenuSlot[] {
  const out: ExerciseMenuSlot[] = [];
  for (const session of template.sessions) {
    for (const slot of session.slots) {
      const options = slot.preferred
        .map((id) => lib.byId.get(id))
        .filter((ex): ex is NonNullable<typeof ex> => !!ex && isAvailable(ex, equipment) && isInjurySafe(ex, injuries))
        .map((ex) => ({ id: ex.id, name: ex.name, equipment: [...ex.equipment], isMachine: ex.isMachine }));
      out.push({ slotId: slot.slotId, pattern: slot.pattern, options });
    }
  }
  return out;
}
