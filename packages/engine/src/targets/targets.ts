// Targets (engines.md §1). Exact formulas, in order. Golden cases T1–T11 depend on every detail here.
import type { Goal, Instant, Sex } from '../types/enums.ts';
import type { SafetyFlags, TargetInput, Targets } from '../types/profile.ts';
import { ceilTo, round } from '../util/round.ts';
import { zonedParts, msOf } from '../util/time.ts';

const BASE_AF: Record<TargetInput['activity'], number> = { desk: 1.2, on_feet: 1.4, very_active: 1.6 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { fat_loss: 1.6, muscle: 1.6, both: 1.6, get_fit: 1.4 };
export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
export const KCAL_DELTA_LIMIT = 450;

/** Pregnant, diabetes or GLP-1 → never a calorie deficit. */
export function noDeficit(flags: SafetyFlags): boolean {
  return !!(flags.pregnant || flags.diabetes || flags.glp1);
}

/** `ageYears` = current local year − birth year. */
export function ageFromBirthYear(birthYear: number, now: Instant, tz: string): number {
  return zonedParts(msOf(now), tz).year - birthYear;
}

export function bmiOf(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

/** Mifflin-St Jeor. */
export function bmrOf(i: Pick<TargetInput, 'sex' | 'weightKg' | 'heightCm' | 'ageYears'>): number {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears + (i.sex === 'male' ? 5 : -161);
}

/** min(BASE + 0.05 · min(gymDays, 4), 1.8), rounded to 2 decimals (avoids 1.4 + 0.2 = 1.5999…). */
export function activityFactor(activity: TargetInput['activity'], gymDaysPerWeek: number): number {
  const raw = Math.min(BASE_AF[activity] + 0.05 * Math.min(gymDaysPerWeek, 4), 1.8);
  return Math.round(raw * 100) / 100;
}

export function computeTargets(i: TargetInput): Targets {
  const notes: string[] = [];
  const h = i.heightCm / 100;
  const bmi = bmiOf(i.weightKg, i.heightCm);
  const bmr = bmrOf(i);
  const af = activityFactor(i.activity, i.gymDaysPerWeek);
  const tdee = bmr * af;

  // 4. Goal adjustment.
  let adj: number;
  switch (i.goal) {
    case 'fat_loss':
      adj = -0.2;
      break;
    case 'muscle':
      adj = bmi >= 27 ? 0.05 : 0.1;
      break;
    case 'both':
      adj = bmi >= 25 ? -0.1 : 0;
      break;
    case 'get_fit':
      adj = 0;
      break;
  }
  if (noDeficit(i.safetyFlags) && adj < 0) {
    adj = 0;
    notes.push('no_deficit_medical');
  }

  // 5. Calories + floors.
  let kcal = round(tdee * (1 + adj), 10) + (i.kcalDelta ?? 0);
  let floorsApplied = false;
  const floor = KCAL_FLOOR[i.sex];
  if (kcal < floor) {
    kcal = floor;
    floorsApplied = true;
  }

  // 6. Protein.
  const weightUsedKg = bmi > 30 ? (i.goalWeightKg ?? 25 * h * h) : i.weightKg;
  let proteinG = round(PROTEIN_G_PER_KG[i.goal] * weightUsedKg, 5);
  if (4 * proteinG > 0.4 * kcal) {
    proteinG = round((0.4 * kcal) / 4, 5);
    notes.push('protein_capped');
  }

  // 7. Fat.
  let fatG = round((0.275 * kcal) / 9, 5);
  if (fatG < 0.6 * i.weightKg) {
    fatG = ceilTo(0.6 * i.weightKg, 5);
    notes.push('fat_floor');
  }

  // 8. Carbs.
  let carbsG = round((kcal - 4 * proteinG - 9 * fatG) / 4, 5);
  if (carbsG < 50) {
    fatG = round((0.25 * kcal) / 9, 5);
    carbsG = Math.max(50, round((kcal - 4 * proteinG - 9 * fatG) / 4, 5));
    notes.push('low_carb_floor');
  }

  return {
    kcal,
    proteinG,
    fatG,
    carbsG,
    // 9. Eating-disorder history → habit-only (numbers still computed for portioning, never shown or sent to AI).
    displayMode: i.safetyFlags.edHistory ? 'habit_only' : 'full',
    basis: { bmr, activityFactor: af, tdee, adjustPct: adj, bmi, weightUsedKg, floorsApplied, notes },
  };
}

export interface WeeklyAdjustInput {
  goal: Goal;
  prevWeekAvgKg: number | null;
  thisWeekAvgKg: number | null;
  /** 1-based number of the week being evaluated (journey week 1, 2, 3, …). */
  weeksSinceStart: number;
  consecutiveStallWeeks: number;
  currentDelta: number;
  mealAdherencePct: number;
  safetyFlags: SafetyFlags;
}

export interface WeeklyAdjustResult {
  deltaChange: number;
  newDelta: number;
  stallWeeks: number;
  reason: string;
}

/** Weekly calorie adjustment (engines.md §1). `computeTargets` re-applies the floors after every change. */
export function weeklyAdjust(i: WeeklyAdjustInput): WeeklyAdjustResult {
  if (i.weeksSinceStart <= 2 || i.prevWeekAvgKg == null || i.thisWeekAvgKg == null || i.prevWeekAvgKg <= 0) {
    return {
      deltaChange: 0,
      newDelta: i.currentDelta,
      stallWeeks: i.consecutiveStallWeeks,
      reason: 'too_early_or_no_data',
    };
  }
  let change = 0;
  let stall = i.consecutiveStallWeeks;
  let reason = 'on_track';
  const prev = i.prevWeekAvgKg;
  const cur = i.thisWeekAvgKg;

  if (i.goal === 'fat_loss') {
    const loss = (prev - cur) / prev;
    if (loss > 0.01) {
      change = 150;
      stall = 0;
      reason = 'losing_too_fast';
    } else if (loss <= 0.002 && i.mealAdherencePct >= 0.7) {
      stall += 1;
      reason = 'stall';
      if (stall >= 2) {
        change = -150;
        stall = 0;
        reason = 'stalled_two_weeks';
      }
    } else {
      stall = 0;
    }
  } else if (i.goal === 'muscle') {
    const gain = (cur - prev) / prev;
    if (gain > 0.005) {
      change = -100;
      stall = 0;
      reason = 'gaining_too_fast';
    } else if (gain <= 0 && i.mealAdherencePct >= 0.7) {
      stall += 1;
      reason = 'stall';
      if (stall >= 2) {
        change = 150;
        stall = 0;
        reason = 'no_gain_two_weeks';
      }
    } else {
      stall = 0;
    }
  } else {
    reason = 'no_auto_change';
  }

  if (noDeficit(i.safetyFlags) && change < 0) {
    change = 0;
    reason = 'no_deficit_medical';
  }
  const newDelta = Math.max(-KCAL_DELTA_LIMIT, Math.min(KCAL_DELTA_LIMIT, i.currentDelta + change));
  return { deltaChange: newDelta - i.currentDelta, newDelta, stallWeeks: stall, reason };
}

/** Mean of a week's weigh-ins (null when there are none). */
export function weeklyAverage(weights: readonly number[]): number | null {
  if (weights.length === 0) return null;
  return weights.reduce((a, b) => a + b, 0) / weights.length;
}
