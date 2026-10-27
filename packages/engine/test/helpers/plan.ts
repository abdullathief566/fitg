// Builds T1-style weeks and ping schedules for the golden tests.
import {
  ageFromBirthYear,
  buildPingSchedule,
  COPY_BANK,
  computeTargets,
  deriveUserState,
  normalizeSchedule,
  planWeek,
  toInstant,
  type EventRow,
  type Instant,
  type LocalDate,
  type PlanState,
  type Profile,
  type ScheduledPing,
  type Targets,
  type UserState,
  type WeekPlan,
} from '../../src/mod.ts';
import { loadLib } from './lib.ts';
import { T1_PROFILE, TZ, WEEK_START } from './t1.ts';

export const PERMISSIONS = { notifications: 'granted', location: 'denied' } as const;

export function targetsFor(profile: Profile, now: Instant = toInstant(WEEK_START, '08:00', TZ)): Targets {
  return computeTargets({
    sex: profile.sex,
    ageYears: ageFromBirthYear(profile.birthYear, now, profile.tz),
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    ...(profile.goalWeightKg !== undefined ? { goalWeightKg: profile.goalWeightKg } : {}),
    goal: profile.goal,
    activity: profile.activity,
    gymDaysPerWeek: normalizeSchedule(profile.gymSchedule).length,
    safetyFlags: profile.safetyFlags,
  });
}

export interface Week {
  profile: Profile;
  targets: Targets;
  plan: WeekPlan;
  state: PlanState;
}

export function buildWeek(overrides: Partial<Profile> = {}, weekStart: LocalDate = WEEK_START): Week {
  const lib = loadLib();
  const profile: Profile = { ...T1_PROFILE, ...overrides };
  const targets = targetsFor(profile);
  const { plan } = planWeek({
    profile,
    targets,
    weekStart,
    lib: { ...lib, templates: lib.templates },
    pantry: new Set(lib.staples),
    allowDrafts: true,
  });
  const state: PlanState = {
    profile,
    targets,
    plan,
    pantry: new Set(lib.staples),
    lib: {
      recipes: lib.recipes,
      foods: lib.foods,
      exercises: lib.exercises,
      homeDishes: lib.homeDishes,
      addons: lib.addons,
      templates: lib.templates,
    },
  };
  return { profile, targets, plan, state };
}

export function stateAt(week: Week, now: Instant, events: EventRow[] = [], schedule: ScheduledPing[] = []): UserState {
  return deriveUserState({
    plan: week.plan,
    sets: week.plan.sets,
    events,
    schedule,
    permissions: PERMISSIONS,
    now,
    tz: week.profile.tz,
    ctx: {
      recipes: loadLib().recipes,
      exercises: loadLib().exercises,
      cookTimePref: week.profile.cookTimePref,
      sleep: week.profile.sleep,
    },
  });
}

export function scheduleAt(
  week: Week,
  now: Instant,
  extra: Partial<Parameters<typeof buildPingSchedule>[0]> = {},
): ScheduledPing[] {
  const lib = loadLib();
  return buildPingSchedule({
    plan: week.plan,
    prefs: week.profile.notificationPrefs,
    learned: week.profile.learnedTiming,
    copy: COPY_BANK,
    state: stateAt(week, now),
    mealTimes: week.profile.mealTimes,
    cookTimePref: week.profile.cookTimePref,
    wake: week.profile.wake,
    sleep: week.profile.sleep,
    now,
    tz: week.profile.tz,
    lib: { recipes: lib.recipes, exercises: lib.exercises },
    weightKg: week.profile.weightKg,
    eatingMode: week.profile.eatingMode,
    ...extra,
  });
}

export const at = (date: LocalDate, time: string): Instant => toInstant(date, time, TZ);
