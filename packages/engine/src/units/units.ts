// Household units and labels (engines.md §3.1, types.md §3).
// Labels: quantity snapped to 0.5 (min 0.5; rotis and eggs whole). For foods with a yield factor ≠ 1,
// bowl-type units also show COOKED grams ("1 katori rice (150 g)"). Nutrition always uses exact raw grams.
import type { Unit } from '../types/enums.ts';
import type { FoodRow, FoodUnit } from '../types/reference.ts';
import { ceilTo, round } from '../util/round.ts';
import { fmtNum, fmtQty, plural } from '../util/format.ts';

const WHOLE_UNITS: ReadonlySet<Unit> = new Set<Unit>(['roti', 'egg']);
const COOKED_GRAMS_UNITS: ReadonlySet<Unit> = new Set<Unit>(['katori', 'cup', 'plate']);
const MASS_UNITS: ReadonlySet<Unit> = new Set<Unit>(['g', 'ml']);

/** Grams for `qty` of `unit`. 'g' and 'ml' are 1:1 even when not listed. */
export function gramsForUnit(units: readonly FoodUnit[], foodKey: string, unit: Unit, qty: number): number {
  if (unit === 'g' || unit === 'ml') {
    const listed = units.find((u) => u.foodKey === foodKey && u.unit === unit);
    return (listed?.grams ?? 1) * qty;
  }
  const u = units.find((x) => x.foodKey === foodKey && x.unit === unit);
  if (!u) throw new Error(`No '${unit}' unit for food ${foodKey}`);
  return u.grams * qty;
}

/** Rounds a quantity for a label: whole rotis/eggs (min 1), mass units to 5 (min 5), otherwise 0.5 (min 0.5). */
export function labelQty(unit: Unit, qty: number): number {
  if (WHOLE_UNITS.has(unit)) return Math.max(1, Math.round(qty));
  if (MASS_UNITS.has(unit)) return Math.max(5, round(qty, 5));
  return Math.max(0.5, round(qty, 0.5));
}

const UNIT_WORD: Record<Unit, string> = {
  g: 'g',
  ml: 'ml',
  piece: 'piece',
  katori: 'katori',
  roti: 'roti',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  slice: 'slice',
  scoop: 'scoop',
  egg: 'egg',
  plate: 'plate',
};

/** Short lower-case name for labels: "White rice (raw)" → "white rice", "Curd / dahi (whole milk)" → "curd". */
export function labelName(food: Pick<FoodRow, 'name'>): string {
  const base = food.name.replace(/\s*\([^)]*\)/g, '').split(/\s*[/,]\s*/)[0] ?? food.name;
  const trimmed = base.trim();
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function lowerName(food: FoodRow): string {
  return labelName(food);
}

/**
 * The label for a portion of a food in a household unit, e.g. "2 rotis", "2 eggs", "1 tsp oil",
 * "1 katori rice (150 g)", "150 g chicken breast (raw)".
 */
export function portionLabel(food: FoodRow, unit: Unit, qty: number, rawGrams: number): string {
  const q = labelQty(unit, qty);
  const name = lowerName(food);
  if (unit === 'roti' || unit === 'egg') return `${fmtQty(q)} ${plural(UNIT_WORD[unit], q)}`;
  if (MASS_UNITS.has(unit)) {
    const raw = food.isRaw && food.yieldFactor !== 1 ? ' (raw)' : '';
    return `${fmtNum(q)} ${unit} ${name}${raw}`;
  }
  const word = unit === 'tsp' || unit === 'tbsp' ? UNIT_WORD[unit] : plural(UNIT_WORD[unit], q);
  let label = `${fmtQty(q)} ${word} ${name}`;
  if (food.yieldFactor !== 1 && COOKED_GRAMS_UNITS.has(unit)) {
    label += ` (${fmtNum(Math.max(5, round(rawGrams * food.yieldFactor, 5)))} g)`;
  }
  return label;
}

/**
 * Picks a household unit for `grams` of a food: the food's first non-mass unit, else grams.
 * Returns the rounded label quantity and the label.
 */
export function toHousehold(
  units: readonly FoodUnit[],
  food: FoodRow,
  grams: number,
): { unit: Unit; qty: number; label: string } {
  const own = units.filter((u) => u.foodKey === food.key);
  const household = own.find((u) => !MASS_UNITS.has(u.unit));
  if (household) {
    const qty = labelQty(household.unit, grams / household.grams);
    return { unit: household.unit, qty, label: portionLabel(food, household.unit, grams / household.grams, grams) };
  }
  const unit: Unit = own.some((u) => u.unit === 'ml') && !own.some((u) => u.unit === 'g') ? 'ml' : 'g';
  return { unit, qty: labelQty(unit, grams), label: portionLabel(food, unit, grams, grams) };
}

/** Rounds grams up for shopping (grocery list): to 50 g/ml. */
export function shoppingGrams(grams: number): number {
  return Math.max(50, ceilTo(grams, 50));
}
