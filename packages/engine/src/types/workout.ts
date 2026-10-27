// Workouts (docs/20-engineering/types.md §6).

export type ProgressEntry = {
  currentWeightKg: number;
  missStreak: number;
  hitTopLast: boolean;
  /** Reps of the last session at `currentWeightKg`. Cleared whenever the weight changes. */
  lastReps?: number[];
  prWeightKg?: number;
  prReps?: number;
  calibrated: boolean;
};

export type ProgressState = Record<string, ProgressEntry>;

export interface PR {
  exerciseId: string;
  kind: 'weight' | 'reps';
  weightKg: number;
  reps: number;
}

// derived per exercise: barbell → linear(step = incrementKg, min 20); machine/cable → linear(step = incrementKg, min = incrementKg);
// dumbbell → ladder (profile.homeDumbbellsKg for home_db, else the default ladder); bodyweight → none (progress by reps only)
export type WeightSteps =
  { kind: 'linear'; step: number; min: number } | { kind: 'ladder'; values: number[] } | { kind: 'none' };
