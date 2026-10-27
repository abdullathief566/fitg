// Weight steps, starting weights, calibration and double progression (engines.md §2.2, types.md §6).
import type { Experience, Sex } from '../types/enums.ts';
import type { ExerciseRow } from '../types/reference.ts';
import type { WeightSteps } from '../types/workout.ts';
import { round, snapToLadder } from '../util/round.ts';

export const DEFAULT_DUMBBELL_LADDER: readonly number[] = [
  2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 35, 40,
];
export const BARBELL_MIN_KG = 20;
/** Coach-tunable default: female starting loads are 0.6 × the male ratio. */
export const SEX_FACTOR: Record<Sex, number> = { male: 1, female: 0.6 };

function ladderOf(values: readonly number[]): number[] {
  return [...new Set(values.filter((v) => v > 0))].sort((a, b) => a - b);
}

/** barbell → linear(step = increment, min 20); machine/cable → linear(step = increment, min = increment);
 *  dumbbell → ladder (home dumbbells if given, else the default ladder); bodyweight → none. */
export function stepsFor(ex: ExerciseRow, homeDumbbellsKg?: readonly number[]): WeightSteps {
  switch (ex.loadType) {
    case 'barbell':
      return { kind: 'linear', step: ex.incrementKg || 2.5, min: BARBELL_MIN_KG };
    case 'machine':
    case 'cable':
      return { kind: 'linear', step: ex.incrementKg || 5, min: ex.incrementKg || 5 };
    case 'dumbbell': {
      const home = homeDumbbellsKg ? ladderOf(homeDumbbellsKg) : [];
      return { kind: 'ladder', values: home.length > 0 ? home : [...DEFAULT_DUMBBELL_LADDER] };
    }
    case 'bodyweight':
      return { kind: 'none' };
  }
}

export function minWeight(steps: WeightSteps): number {
  if (steps.kind === 'linear') return steps.min;
  if (steps.kind === 'ladder') return Math.min(...steps.values);
  return 0;
}

/** Snaps any weight onto the steps (never below the minimum). */
export function snapWeight(x: number, steps: WeightSteps): number {
  if (steps.kind === 'none') return 0;
  if (steps.kind === 'ladder') return snapToLadder(Math.max(x, minWeight(steps)), steps.values);
  return Math.max(steps.min, round(x, steps.step));
}

/** One step up: linear + step; ladder → the next value (stays at the top). */
export function stepUp(w: number, steps: WeightSteps): number {
  if (steps.kind === 'none') return 0;
  if (steps.kind === 'ladder') {
    const ladder = ladderOf(steps.values);
    return ladder.find((v) => v > w + 1e-9) ?? ladder[ladder.length - 1] ?? w;
  }
  return snapWeight(w + steps.step, steps);
}

/** One step down, never below the minimum. */
export function stepDown(w: number, steps: WeightSteps): number {
  if (steps.kind === 'none') return 0;
  if (steps.kind === 'ladder') {
    const ladder = ladderOf(steps.values);
    const lower = ladder.filter((v) => v < w - 1e-9);
    return lower[lower.length - 1] ?? ladder[0] ?? w;
  }
  return Math.max(steps.min, snapWeight(w - steps.step, steps));
}

/**
 * Conservative on purpose — calibrate() corrects it after the first set.
 * barbell: 20 kg (empty bar) for new/lt6m; otherwise max(20, snap(ratio · bw · sexFactor)).
 * dumbbell / machine / cable: snap(ratio · bw · sexFactor); never below the lowest step. bodyweight: 0.
 */
export function startingWeight(
  ex: ExerciseRow,
  p: { bodyweightKg: number; sex: Sex; experience: Experience; steps: WeightSteps },
): number {
  if (ex.loadType === 'bodyweight' || p.steps.kind === 'none') return 0;
  const raw = ex.startLoadRatio * p.bodyweightKg * SEX_FACTOR[p.sex];
  if (ex.loadType === 'barbell') {
    if (p.experience === 'new' || p.experience === 'lt6m') return BARBELL_MIN_KG;
    return Math.max(BARBELL_MIN_KG, snapWeight(raw, p.steps));
  }
  return snapWeight(raw, p.steps);
}

/**
 * Only after set 1 of an exercise's FIRST-EVER session:
 * too_easy → snap(current · 1.25), at least +1 step; too_heavy → snap(current · 0.8), at least −1 step,
 * never below the minimum; right → unchanged.
 */
export function calibrate(currentKg: number, answer: 'too_easy' | 'right' | 'too_heavy', steps: WeightSteps): number {
  if (steps.kind === 'none' || answer === 'right') return currentKg;
  if (answer === 'too_easy') return Math.max(snapWeight(currentKg * 1.25, steps), stepUp(currentKg, steps));
  return Math.max(minWeight(steps), Math.min(snapWeight(currentKg * 0.8, steps), stepDown(currentKg, steps)));
}

/**
 * Double progression: every set ≥ repMax → one step up ('up', miss 0).
 * Any set < repMin → missStreak + 1; at 2 → snap(weight · 0.9) ('down', miss 0); else hold.
 * Otherwise hold (missStreak unchanged). Bodyweight: weight stays 0; reps carry the progression.
 */
export function progress(
  prev: { weightKg: number; actualReps: number[]; repMin: number; repMax: number },
  state: { missStreak: number },
  steps: WeightSteps,
): { nextWeightKg: number; missStreak: number; message: 'up' | 'hold' | 'down' } {
  const reps = prev.actualReps;
  if (reps.length === 0) return { nextWeightKg: prev.weightKg, missStreak: state.missStreak, message: 'hold' };
  if (reps.every((r) => r >= prev.repMax)) {
    return { nextWeightKg: steps.kind === 'none' ? 0 : stepUp(prev.weightKg, steps), missStreak: 0, message: 'up' };
  }
  if (reps.some((r) => r < prev.repMin)) {
    const miss = state.missStreak + 1;
    if (miss >= 2) {
      const down = steps.kind === 'none' ? 0 : snapWeight(prev.weightKg * 0.9, steps);
      return { nextWeightKg: down, missStreak: 0, message: 'down' };
    }
    return { nextWeightKg: prev.weightKg, missStreak: miss, message: 'hold' };
  }
  return { nextWeightKg: prev.weightKg, missStreak: state.missStreak, message: 'hold' };
}

/** Session-level feedback: too_easy → +1 step next time; too_hard → −1 step; ok → unchanged. */
export function applyFeedback(
  nextWeightKg: number,
  feedback: 'too_easy' | 'ok' | 'too_hard',
  steps: WeightSteps,
): number {
  if (feedback === 'too_easy') return stepUp(nextWeightKg, steps);
  if (feedback === 'too_hard') return stepDown(nextWeightKg, steps);
  return nextWeightKg;
}
