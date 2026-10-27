// The T1 full profile (testing.md §1) and shared fixtures for the golden tests.
import type { MealProfile, Profile, TargetInput } from '../../src/mod.ts';
import { loadLib } from './lib.ts';

export const TZ = 'Asia/Kolkata';
/** Monday. */
export const WEEK_START = '2026-11-02';

export const T1_PROFILE: Profile = {
  userId: '00000000-0000-4000-8000-000000000001',
  firstName: 'Abdul',
  sex: 'male',
  birthYear: 1998,
  heightCm: 175,
  weightKg: 75,
  goal: 'fat_loss',
  activity: 'desk',
  experience: 'new',
  injuries: [],
  equipment: 'full',
  homeDumbbellsKg: [],
  gymSchedule: [
    { weekday: 0, start: '18:30', durationMin: 60 },
    { weekday: 2, start: '18:30', durationMin: 60 },
    { weekday: 4, start: '18:30', durationMin: 60 },
  ],
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  diet: 'non_veg',
  cuisine: 'indian',
  allergies: [],
  dislikes: [],
  eatingMode: 'cook',
  wake: '07:00',
  sleep: '23:00',
  mealTimes: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:15' },
  cookTimePref: 20,
  budgetTier: 2,
  safetyFlags: {},
  tz: TZ,
  units: 'kg',
  notificationPrefs: { nightBefore: '21:30', preGymOffsetMin: 15, timeSensitive: true, haptics: true },
  learnedTiming: { preGymShiftMin: 0, dinnerShiftMin: 0 },
};

export const T1_TARGET_INPUT: TargetInput = {
  sex: 'male',
  ageYears: 28,
  heightCm: 175,
  weightKg: 75,
  goal: 'fat_loss',
  activity: 'desk',
  gymDaysPerWeek: 3,
  safetyFlags: {},
};

export function t1MealProfile(overrides: Partial<MealProfile> = {}): MealProfile {
  return {
    diet: 'non_veg',
    cuisine: 'indian',
    allergies: [],
    dislikes: [],
    eatingMode: 'cook',
    cookTimePref: 20,
    budgetTier: 2,
    mealTimes: T1_PROFILE.mealTimes,
    weightKg: 75,
    pantry: new Set(loadLib().staples),
    memoryDislikes: [],
    allowDrafts: true,
    ...overrides,
  };
}
