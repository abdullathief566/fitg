// Onboarding answers (PRD §5, screens.md O1–O12) and how they become the engine's Profile. Pure: no React, no I/O.
import { DEFAULT_NOTIFICATION_PREFS } from '@fitg/contracts';
import {
  ageFromBirthYear,
  localDateOf,
  type Activity,
  type Cuisine,
  type Diet,
  type EatingMode,
  type Equipment,
  type Experience,
  type Goal,
  type Injury,
  type Instant,
  type LocalTime,
  type Profile,
  type Sex,
  type Weekday,
} from '@fitg/engine';

export interface OnboardingAnswers {
  // O1 goal
  goal?: Goal;
  // O2 about you
  firstName?: string;
  sex?: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  goalWeightKg?: number;
  weightUnit: 'kg' | 'lb';
  // O3 day-to-day activity
  activity?: Activity;
  // O4 gym schedule (one start time for every gym day; per-day times live in Settings later)
  gymDays: Weekday[];
  gymStart: LocalTime;
  durationMin: 45 | 60 | 75;
  // O5 experience and injuries
  experience?: Experience;
  injuries: Injury[];
  // O6 equipment and your gym
  equipment?: Equipment;
  homeDumbbellsKg: number[];
  gymPin?: { lat: number; lng: number };
  // O7 food
  diet?: Diet;
  cuisine?: Cuisine;
  allergies: string[];
  dislikes: string[];
  // O8 eating mode
  eatingMode?: EatingMode;
  // O9 your day
  wake: LocalTime;
  sleep: LocalTime;
  breakfast: LocalTime;
  lunch: LocalTime;
  dinner: LocalTime;
  snack: LocalTime | null;
  cookTimePref: 10 | 20 | 30;
  budgetTier: 1 | 2 | 3;
  // O10 kitchen staples (food keys)
  staples: string[];
  // O11 health check
  safety: { pregnant: boolean; diabetes: boolean; glp1: boolean; edHistory: boolean };
  healthChecked: boolean;
  // O12 permissions & privacy
  consent: boolean;
  notifications: 'granted' | 'denied' | 'undetermined';
}

/** Foods every kitchen is assumed to have; they are never shown on the staples checklist. */
export const ALWAYS_IN_KITCHEN = ['oil_sunflower', 'onion', 'tomato', 'potato'] as const;

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  weightUnit: 'kg',
  gymDays: [],
  gymStart: '18:30',
  durationMin: 60,
  injuries: [],
  homeDumbbellsKg: [],
  allergies: [],
  dislikes: [],
  wake: '07:00',
  sleep: '23:00',
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '20:30',
  snack: '17:00',
  cookTimePref: 20,
  budgetTier: 2,
  staples: ['rice_white_raw', 'atta_whole_wheat', 'dal_toor_raw', 'egg_whole', 'milk_whole', 'curd_whole'],
  safety: { pregnant: false, diabetes: false, glp1: false, edHistory: false },
  healthChecked: false,
  consent: false,
  notifications: 'undetermined',
};

export const LIMITS = {
  age: { min: 18, max: 90 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 250 },
} as const;

export const KG_PER_LB = 0.45359237;

export type StepId =
  | 'goal'
  | 'about'
  | 'activity'
  | 'schedule'
  | 'experience'
  | 'equipment'
  | 'food'
  | 'eating'
  | 'day'
  | 'staples'
  | 'health';

/** O1–O11 in order; the route is `/(onboarding)/<index + 1>`. */
export const STEPS: readonly StepId[] = [
  'goal',
  'about',
  'activity',
  'schedule',
  'experience',
  'equipment',
  'food',
  'eating',
  'day',
  'staples',
  'health',
];

/** Total progress-line segments: 11 questions + permissions + reveal. */
export const PROGRESS_TOTAL = STEPS.length + 2;

const inRange = (v: number | undefined, r: { min: number; max: number }): v is number =>
  v !== undefined && Number.isFinite(v) && v >= r.min && v <= r.max;

/** Why the user can't continue yet (null = they can). The words are shown under the Next button. */
export function stepProblem(step: StepId, a: OnboardingAnswers): string | null {
  switch (step) {
    case 'goal':
      return a.goal ? null : 'Pick one to continue.';
    case 'about':
      if (!a.sex) return 'Pick one to continue.';
      if (a.age !== undefined && a.age < LIMITS.age.min) return 'FitG is for adults, 18 and over.';
      if (!inRange(a.age, LIMITS.age)) return 'Add your age.';
      if (!inRange(a.heightCm, LIMITS.heightCm)) return 'Add your height.';
      if (!inRange(a.weightKg, LIMITS.weightKg)) return 'Add your weight.';
      if (a.goalWeightKg !== undefined && !inRange(a.goalWeightKg, LIMITS.weightKg))
        return 'That goal weight looks off.';
      return null;
    case 'activity':
      return a.activity ? null : 'Pick one to continue.';
    case 'schedule':
      if (a.gymDays.length < 2) return 'Pick at least 2 gym days.';
      if (a.gymDays.length > 4) return 'Up to 4 gym days. Rest days are where you grow.';
      return null;
    case 'experience':
      return a.experience ? null : 'Pick one to continue.';
    case 'equipment':
      if (!a.equipment) return 'Pick one to continue.';
      if (a.equipment === 'home_db' && a.homeDumbbellsKg.length === 0) return 'Which dumbbells do you have?';
      return null;
    case 'food':
      if (!a.diet) return 'Pick how you eat.';
      return a.cuisine ? null : 'Pick a cuisine.';
    case 'eating':
      return a.eatingMode ? null : 'Pick one to continue.';
    case 'day':
      return dayProblem(a);
    case 'staples':
      return null;
    case 'health':
      return a.healthChecked ? null : 'Answer each one. They change your plan.';
  }
}

function minutes(t: LocalTime): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dayProblem(a: OnboardingAnswers): string | null {
  const wake = minutes(a.wake);
  const sleep = minutes(a.sleep) <= wake ? minutes(a.sleep) + 1440 : minutes(a.sleep);
  const meals = [a.breakfast, a.lunch, a.dinner].map((t) => {
    const m = minutes(t);
    return m < wake ? m + 1440 : m;
  });
  if (meals.some((m) => m >= sleep)) return 'Meals need to land between waking up and sleep.';
  if (!(meals[0]! < meals[1]! && meals[1]! < meals[2]!)) return 'Breakfast, lunch, then dinner — in that order.';
  return null;
}

/** Fill the profile from the answers. Throws if a required answer is missing (the step guards prevent that). */
export function profileFromAnswers(
  a: OnboardingAnswers,
  ids: { userId: string },
  at: { now: Instant; tz: string },
): Profile {
  const need = <T>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new Error(`Onboarding answer missing: ${what}`);
    return v;
  };
  const today = localDateOf(at.now, at.tz);
  const year = Number(today.slice(0, 4));
  const profile: Profile = {
    userId: ids.userId,
    sex: need(a.sex, 'sex'),
    birthYear: year - need(a.age, 'age'),
    heightCm: need(a.heightCm, 'height'),
    weightKg: need(a.weightKg, 'weight'),
    goal: need(a.goal, 'goal'),
    activity: need(a.activity, 'activity'),
    experience: need(a.experience, 'experience'),
    injuries: [...a.injuries],
    equipment: need(a.equipment, 'equipment'),
    homeDumbbellsKg: a.equipment === 'home_db' ? [...a.homeDumbbellsKg].sort((x, y) => x - y) : [],
    gymSchedule: [...a.gymDays]
      .sort((x, y) => x - y)
      .map((weekday) => ({ weekday, start: a.gymStart, durationMin: a.durationMin })),
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    diet: need(a.diet, 'diet'),
    cuisine: need(a.cuisine, 'cuisine'),
    allergies: [...a.allergies],
    dislikes: [...a.dislikes],
    eatingMode: need(a.eatingMode, 'eating mode'),
    wake: a.wake,
    sleep: a.sleep,
    mealTimes: {
      breakfast: a.breakfast,
      lunch: a.lunch,
      dinner: a.dinner,
      ...(a.snack ? { snack: a.snack } : {}),
    },
    cookTimePref: a.cookTimePref,
    budgetTier: a.budgetTier,
    safetyFlags: {
      ...(a.safety.pregnant ? { pregnant: true } : {}),
      ...(a.safety.diabetes ? { diabetes: true } : {}),
      ...(a.safety.glp1 ? { glp1: true } : {}),
      ...(a.safety.edHistory ? { edHistory: true } : {}),
    },
    tz: at.tz,
    units: a.weightUnit,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    learnedTiming: { preGymShiftMin: 0, dinnerShiftMin: 0 },
    journeyStartedAt: today,
  };
  const name = a.firstName?.trim();
  if (name) profile.firstName = name;
  if (a.goalWeightKg !== undefined) profile.goalWeightKg = a.goalWeightKg;
  // The age the user typed is what the targets use this year.
  if (ageFromBirthYear(profile.birthYear, at.now, at.tz) !== a.age) throw new Error('Age did not round-trip');
  return profile;
}

/** The pantry: ticked staples plus what every kitchen has. */
export function pantryFromAnswers(a: OnboardingAnswers): Set<string> {
  return new Set([...ALWAYS_IN_KITCHEN, ...a.staples]);
}
