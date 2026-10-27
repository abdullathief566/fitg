// Test helpers: the real seed files (read-only) and the T1 profile from testing.md.
import { readFileSync } from 'node:fs';
import type { Profile } from '@fitg/engine/types';

const ROOT = new URL('../../../', import.meta.url);

export function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(new URL(relPath, ROOT), 'utf8'));
}

export function readText(relPath: string): string {
  return readFileSync(new URL(relPath, ROOT), 'utf8');
}

/** The six seed files + the sample values, as raw JSON. */
export function seedInput() {
  return {
    foodsMap: readJson('data/seed/foods.map.json'),
    recipes: readJson('data/seed/recipes.seed.json'),
    homeDishes: readJson('data/seed/home_dishes.seed.json'),
    addons: readJson('data/seed/protein_addons.seed.json'),
    exercises: readJson('data/seed/exercises.seed.json'),
    templates: readJson('data/seed/workout_templates.seed.json'),
    sample: readJson('data/sample/foods.sample.json'),
  };
}

/** Deep copy of plain JSON (so a test can break a seed file without touching the others). */
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export const USER_ID = '3b241101-e2bb-4255-8caf-4136c566a962';

/** testing.md "The T1 full profile". */
export const T1_PROFILE: Profile = {
  userId: USER_ID,
  firstName: 'Arjun',
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
  mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '21:15', snack: '17:00' },
  cookTimePref: 20,
  budgetTier: 2,
  safetyFlags: {},
  tz: 'Asia/Kolkata',
  units: 'kg',
  notificationPrefs: { nightBefore: '21:30', preGymOffsetMin: 15, timeSensitive: true, haptics: true },
  learnedTiming: { preGymShiftMin: 0, dinnerShiftMin: 0 },
  journeyStartedAt: '2026-11-02',
};
