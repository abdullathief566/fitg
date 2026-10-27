// Grocery list and prep tasks (engines.md §3.8).
import type { LocalDate } from '../types/enums.ts';
import type { NotificationPrefs } from '../types/profile.ts';
import type { GroceryItem, PlannedMeal, PrepTask } from '../types/plan.ts';
import type { FoodIndex, ProteinAddon, RecipeIndex } from '../types/reference.ts';
import { ingredientAmount } from '../nutrition/nutrition.ts';
import { ceilTo } from '../util/round.ts';
import { addDays, addMinutes, localDateOf, minutesBetween, toInstant } from '../util/time.ts';

const COUNTED_PIECE_CATEGORIES = new Set(['fruit', 'vegetable']);

/**
 * Sums raw grams of every ingredient and add-on across the week's meals (× multipliers for scalable ingredients),
 * excludes staples and ticked items, groups by food category, and rounds for shopping: eggs and rotis as counts,
 * fruit/vegetables with a piece unit as pieces, liquids in ml, everything else up to 50 g.
 */
export function groceryList(
  meals: readonly PlannedMeal[],
  pantry: { staples: ReadonlySet<string>; ticked: ReadonlySet<string> },
  lib: RecipeIndex,
  foods: FoodIndex,
  addons: readonly ProteinAddon[] = [],
): GroceryItem[] {
  const grams = new Map<string, number>();
  const add = (key: string, g: number): void => {
    grams.set(key, (grams.get(key) ?? 0) + g);
  };
  for (const m of meals) {
    if (m.status === 'skipped') continue;
    const recipe = m.kind === 'recipe' && m.recipeSlug ? lib.get(m.recipeSlug) : undefined;
    if (recipe) for (const ing of recipe.ingredients) add(ing.foodKey, ingredientAmount(ing, m.multiplier).grams);
    for (const pick of m.addons) {
      const a = addons.find((x) => x.key === pick.addonKey);
      if (a) add(a.foodKey, a.gramsPerUnit * pick.qty);
    }
  }
  const items: GroceryItem[] = [];
  for (const [key, g] of grams) {
    if (pantry.staples.has(key) || pantry.ticked.has(key)) continue;
    const entry = foods.get(key);
    if (!entry) continue;
    const { food, units } = entry;
    const unitOf = (u: string) => units.find((x) => x.unit === u);
    let item: GroceryItem;
    const egg = unitOf('egg');
    const roti = unitOf('roti');
    const piece = unitOf('piece');
    const ml = unitOf('ml');
    if (egg)
      item = {
        foodKey: key,
        name: food.name,
        qty: Math.ceil(g / egg.grams - 1e-9),
        unit: 'egg',
        group: food.category,
        checked: false,
      };
    else if (roti)
      item = {
        foodKey: key,
        name: food.name,
        qty: Math.ceil(g / roti.grams - 1e-9),
        unit: 'roti',
        group: food.category,
        checked: false,
      };
    else if (piece && COUNTED_PIECE_CATEGORIES.has(food.category))
      item = {
        foodKey: key,
        name: food.name,
        qty: Math.max(1, Math.ceil(g / piece.grams - 1e-9)),
        unit: 'piece',
        group: food.category,
        checked: false,
      };
    else if (ml && !unitOf('g'))
      item = {
        foodKey: key,
        name: food.name,
        qty: Math.max(50, ceilTo(g / ml.grams, 50)),
        unit: 'ml',
        group: food.category,
        checked: false,
      };
    else
      item = {
        foodKey: key,
        name: food.name,
        qty: Math.max(50, ceilTo(g, 50)),
        unit: 'g',
        group: food.category,
        checked: false,
      };
    items.push(item);
  }
  return items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

/**
 * For each planned meal whose recipe has `prep`, a task `leadHours` before the meal. `forDate` = the date of the latest
 * night-before ping (at prefs.nightBefore) that comes before the prep time — that ping announces it
 * ("Soak the rajma tonight").
 */
export function prepTasks(
  meals: readonly PlannedMeal[],
  lib: RecipeIndex,
  prefs: Pick<NotificationPrefs, 'nightBefore'>,
  tz: string,
): PrepTask[] {
  const tasks: PrepTask[] = [];
  for (const m of meals) {
    if (m.status !== 'planned' || m.kind !== 'recipe' || !m.recipeSlug || !m.plannedAt) continue;
    const recipe = lib.get(m.recipeSlug);
    if (!recipe?.prep) continue;
    const at = addMinutes(m.plannedAt, -recipe.prep.leadHours * 60);
    let forDate: LocalDate = localDateOf(at, tz);
    // The latest night-before ping at or before the prep time.
    while (minutesBetween(toInstant(forDate, prefs.nightBefore, tz), at) < 0) forDate = addDays(forDate, -1);
    tasks.push({ forDate, text: recipe.prep.text, at, recipeSlug: recipe.slug });
  }
  return tasks.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Food keys of a week's grocery list that count as "in the kitchen" once ticked. */
export function tickedKeys(items: readonly GroceryItem[]): Set<string> {
  return new Set(items.filter((i) => i.checked).map((i) => i.foodKey));
}
