// Profile and targets (docs/20-engineering/types.md §4, engines.md §1).
import type {
  Activity,
  Cuisine,
  Diet,
  EatingMode,
  Equipment,
  Experience,
  Goal,
  Injury,
  LocalDate,
  LocalTime,
  Sex,
  Weekday,
} from './enums.ts';

export interface GymSlot {
  weekday: Weekday;
  start: LocalTime;
  durationMin: 45 | 60 | 75;
}

/** No snack time → no snack slot. */
export interface MealTimes {
  breakfast: LocalTime;
  lunch: LocalTime;
  dinner: LocalTime;
  snack?: LocalTime;
}

export interface NotificationPrefs {
  nightBefore: LocalTime;
  preGymOffsetMin: number;
  timeSensitive: boolean;
  haptics: boolean;
}

export interface LearnedTiming {
  preGymShiftMin: number;
  dinnerShiftMin: number;
}

export interface SafetyFlags {
  pregnant?: boolean;
  diabetes?: boolean;
  glp1?: boolean;
  edHistory?: boolean;
}

export interface Profile {
  userId: string;
  firstName?: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  goal: Goal;
  activity: Activity;
  experience: Experience;
  injuries: Injury[];
  equipment: Equipment;
  homeDumbbellsKg: number[];
  gymSchedule: GymSlot[];
  availableDays: Weekday[];
  diet: Diet;
  cuisine: Cuisine;
  allergies: string[];
  dislikes: string[];
  eatingMode: EatingMode;
  wake: LocalTime;
  sleep: LocalTime;
  mealTimes: MealTimes;
  cookTimePref: 10 | 20 | 30;
  budgetTier: 1 | 2 | 3;
  safetyFlags: SafetyFlags;
  tz: string;
  units: 'kg' | 'lb';
  notificationPrefs: NotificationPrefs;
  learnedTiming: LearnedTiming;
  journeyStartedAt?: LocalDate;
}

export interface MealProfile {
  diet: Diet;
  cuisine: Cuisine;
  allergies: string[];
  dislikes: string[];
  eatingMode: EatingMode;
  cookTimePref: number;
  budgetTier: number;
  mealTimes: MealTimes;
  weightKg: number;
  pantry: Set<string>;
  memoryDislikes: string[];
  /** Dev/tests only: allow `isDraft` recipes. */
  allowDrafts?: boolean;
}

export interface TargetInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  goal: Goal;
  activity: Activity;
  gymDaysPerWeek: number;
  safetyFlags: SafetyFlags;
  /** Accumulated weekly adjustments (−450..+450). */
  kcalDelta?: number;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  displayMode: 'full' | 'habit_only';
  basis: {
    bmr: number;
    activityFactor: number;
    tdee: number;
    adjustPct: number;
    bmi: number;
    weightUsedKg: number;
    floorsApplied: boolean;
    notes: string[];
  };
}
