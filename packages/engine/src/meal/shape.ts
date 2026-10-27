// Day shape (engines.md §3.2): which meals a day has, their calorie shares, times and protein minimums.
import { SLOT_ORDER, type EatingMode, type LocalTime, type MealKind, type Slot } from '../types/enums.ts';
import type { MealTimes } from '../types/profile.ts';
import type { DayShape, DayShapeSlot } from '../types/plan.ts';
import { round } from '../util/round.ts';

const REST_SHARES: Partial<Record<Slot, number>> = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };
const GYM_SHARES: Partial<Record<Slot, number>> = {
  breakfast: 0.22,
  lunch: 0.28,
  post_workout: 0.15,
  dinner: 0.27,
  snack: 0.08,
};

/** Post-workout protein minimum: round(0.4 · weightKg, 5). */
export function postWorkoutProteinMin(weightKg: number): number {
  return round(0.4 * weightKg, 5);
}

/** family → lunch + dinner are Home Food; out → lunch is eat-out; mix → dinner is Home Food. */
export function slotKind(slot: Slot, eatingMode: EatingMode): MealKind {
  if (eatingMode === 'family' && (slot === 'lunch' || slot === 'dinner')) return 'home_food';
  if (eatingMode === 'out' && slot === 'lunch') return 'eat_out';
  if (eatingMode === 'mix' && slot === 'dinner') return 'home_food';
  return 'recipe';
}

export function dayShape(p: {
  isGymDay: boolean;
  mealTimes: MealTimes;
  gymEnd?: LocalTime;
  weightKg: number;
  eatingMode: EatingMode;
}): DayShape {
  const shares: Partial<Record<Slot, number>> = { ...(p.isGymDay ? GYM_SHARES : REST_SHARES) };
  if (!p.mealTimes.snack) {
    // No snack time → no snack slot; its share is spread over the other slots proportionally.
    const s = shares.snack ?? 0;
    delete shares.snack;
    for (const k of Object.keys(shares) as Slot[]) shares[k] = (shares[k] ?? 0) / (1 - s);
  }
  if (p.isGymDay && !p.gymEnd) throw new Error('dayShape: a gym day needs gymEnd (session start + duration)');
  const slots: DayShapeSlot[] = [];
  for (const slot of SLOT_ORDER) {
    const share = shares[slot];
    if (share === undefined) continue;
    const at = slot === 'post_workout' ? (p.gymEnd as LocalTime) : (p.mealTimes[slot as keyof MealTimes] as LocalTime);
    const entry: DayShapeSlot = { slot, kcalShare: share, at };
    if (slot === 'post_workout') entry.proteinMinG = postWorkoutProteinMin(p.weightKg);
    const kind = slotKind(slot, p.eatingMode);
    if (kind !== 'recipe') entry.kind = kind;
    slots.push(entry);
  }
  return { slots };
}

/** The slots the recipe planner fills (Home Food and eat-out slots keep their share and are skipped). */
export function recipeSlots(shape: DayShape): DayShapeSlot[] {
  return shape.slots.filter((s) => (s.kind ?? 'recipe') === 'recipe');
}

export function isGymShape(shape: DayShape): boolean {
  return shape.slots.some((s) => s.slot === 'post_workout');
}
