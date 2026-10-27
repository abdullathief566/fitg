// Meal "next-step windows" (signals-and-pings.md §1 rules 4–5, §2 "Meals the user doesn't tap").
// Shared by nextStep (what Today shows) and the ping scheduler (which untapped meal a ping asks about).
import type { Instant } from '../types/enums.ts';
import type { PlannedMeal } from '../types/plan.ts';
import { addMinutes, msOf } from '../util/time.ts';

export const MEAL_WINDOW_BEFORE_MIN = 90;
export const MEAL_WINDOW_AFTER_MIN = 60;
export const POST_WORKOUT_MAX_MIN = 120;

/** The next meal after `meal` the same day (by time), if any. */
export function nextMealAfter(meal: PlannedMeal, dayMeals: readonly PlannedMeal[]): PlannedMeal | undefined {
  return dayMeals
    .filter((m) => m.id !== meal.id && m.plannedAt !== '' && msOf(m.plannedAt) > msOf(meal.plannedAt))
    .sort((a, b) => msOf(a.plannedAt) - msOf(b.plannedAt))[0];
}

/** Cook-start of a meal: its planned time − cooking time − 10 min (the same moment as its pre-meal ping). */
export function cookStartOf(meal: PlannedMeal, cookTimePref: number): Instant {
  return addMinutes(meal.plannedAt, -(cookTimePref + 10));
}

/**
 * When a meal is the next step on Today.
 * - Most meals: from 90 min before their planned time until 60 min after it (rule 5).
 * - The post-workout meal: from the session's end (or its planned time) until the next meal's cook-start, and for at
 *   most 2 h after the session ended (rule 4).
 * Past `closes`, an untapped meal is never the next step: it counts as eaten and is asked about once in the next ping.
 */
export function mealWindow(
  meal: PlannedMeal,
  dayMeals: readonly PlannedMeal[],
  cookTimePref: number,
  sessionEndedAt?: Instant,
): { opens: Instant; closes: Instant } {
  if (meal.slot === 'post_workout') {
    const start = sessionEndedAt ?? meal.plannedAt;
    let closes = addMinutes(start, POST_WORKOUT_MAX_MIN);
    const next = nextMealAfter(meal, dayMeals);
    if (next) {
      const cookStart = cookStartOf(next, cookTimePref);
      if (msOf(cookStart) < msOf(closes)) closes = cookStart;
    }
    if (msOf(closes) < msOf(start)) closes = start;
    return { opens: start, closes };
  }
  return {
    opens: addMinutes(meal.plannedAt, -MEAL_WINDOW_BEFORE_MIN),
    closes: addMinutes(meal.plannedAt, MEAL_WINDOW_AFTER_MIN),
  };
}
