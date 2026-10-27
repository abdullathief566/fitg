// Shared test fixture: the T1 onboarding answers (testing.md T1) and an in-memory snapshot built with the same
// planner the app uses (no database), for UI tests.
import type { BundleLib } from '@fitg/contracts';
import { toInstant, type Instant } from '@fitg/engine';
import type { Snapshot } from '../src/domain/backend';
import {
  DEFAULT_ANSWERS,
  pantryFromAnswers,
  profileFromAnswers,
  type OnboardingAnswers,
} from '../src/domain/onboarding';
import { firstWeek, targetsFor, weekAfter } from '../src/domain/planner';

export const TZ = 'Asia/Kolkata';
export const MON = '2026-11-02';
export const at = (date: string, time: string): Instant => toInstant(date, time, TZ);

/** 75 kg male, 175 cm, 28, desk job, lose fat, gym Mon/Wed/Fri 18:30 → 1,850 kcal / 120 g. */
export const T1_ANSWERS: OnboardingAnswers = {
  ...DEFAULT_ANSWERS,
  goal: 'fat_loss',
  firstName: 'Abdul',
  sex: 'male',
  age: 28,
  heightCm: 175,
  weightKg: 75,
  activity: 'desk',
  gymDays: [0, 2, 4],
  gymStart: '18:30',
  durationMin: 60,
  experience: 'new',
  equipment: 'full',
  diet: 'non_veg',
  cuisine: 'indian',
  eatingMode: 'cook',
  dinner: '21:15',
  healthChecked: true,
  consent: true,
};

export function snapshotFor(answers: OnboardingAnswers, lib: BundleLib, now: Instant): Snapshot {
  const userId = '00000000-0000-4000-8000-0000000000a1';
  const profile = profileFromAnswers(answers, { userId }, { now, tz: TZ });
  const targets = targetsFor(profile, now);
  const pantry = pantryFromAnswers(answers);
  const inputs = { profile, targets, pantry, lib };
  const thisWeek = firstWeek(inputs, now);
  return { userId, profile, targets, pantry, weeks: [thisWeek, weekAfter(inputs, thisWeek)] };
}
