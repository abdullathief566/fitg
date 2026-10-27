// The on-device planner (EXPO_PUBLIC_BACKEND=local): profile → targets → week plans, all through packages/engine.
// The server runs the same engine from Phase 3; nothing here computes a number itself.
import type { BundleLib } from '@fitg/contracts';
import {
  addDays,
  ageFromBirthYear,
  computeTargets,
  localDateOf,
  msOf,
  normalizeSchedule,
  planWeek,
  selectTemplate,
  weekStartOf,
  type Instant,
  type LocalDate,
  type PlannedMeal,
  type Profile,
  type Targets,
  type TemplateKey,
  type WeekPlan,
} from '@fitg/engine';

export function targetsFor(profile: Profile, now: Instant): Targets {
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

export function templateIdFor(profile: Profile): string {
  return selectTemplate({
    gymDays: normalizeSchedule(profile.gymSchedule).length,
    equipment: profile.equipment,
    experience: profile.experience,
  }).templateId;
}

export interface PlanInputs {
  profile: Profile;
  targets: Targets;
  pantry: Set<string>;
  lib: BundleLib;
}

function plan(inputs: PlanInputs, weekStart: LocalDate, lastCompletedKey?: TemplateKey): WeekPlan {
  const { plan: week } = planWeek({
    profile: inputs.profile,
    targets: inputs.targets,
    weekStart,
    lib: inputs.lib,
    pantry: inputs.pantry,
    // A sample bundle (development) only has draft recipes; a production bundle never plans with drafts.
    allowDrafts: inputs.lib.mode === 'sample',
    ...(lastCompletedKey ? { lastCompletedKey } : {}),
  });
  return week;
}

/**
 * The week the user signs up in. Days before today are dropped (nothing happened before FitG), today's session is
 * dropped once its planned end has passed (it can no longer be done, so it must never come back as a "missed"
 * workout), and today's meals that are already behind us are `unknown`: counted as eaten for the day's math,
 * never asked about.
 */
export function firstWeek(inputs: PlanInputs, now: Instant): WeekPlan {
  const tz = inputs.profile.tz;
  const today = localDateOf(now, tz);
  const week = plan(inputs, weekStartOf(today));
  const nowMs = msOf(now);
  const sessionOver = (s: WeekPlan['sessions'][number]) =>
    msOf(s.plannedStart) + s.plannedDurationMin * 60_000 <= nowMs;
  const dropped = new Set(
    week.sessions.filter((s) => s.date < today || (s.date === today && sessionOver(s))).map((s) => s.id),
  );
  const droppedGymDays = new Set(week.sessions.filter((s) => dropped.has(s.id)).map((s) => s.date));
  const meals: PlannedMeal[] = [];
  for (const m of week.meals) {
    if (m.date < today) continue;
    if (m.slot === 'post_workout' && droppedGymDays.has(m.date)) continue;
    meals.push(m.date === today && msOf(m.plannedAt) <= nowMs ? { ...m, status: 'unknown' } : m);
  }
  return {
    ...week,
    days: week.days
      .filter((d) => d.date >= today)
      .map((d) => (droppedGymDays.has(d.date) ? { ...d, isGymDay: false } : d)),
    sessions: week.sessions.filter((s) => !dropped.has(s.id)),
    sets: week.sets.filter((s) => !dropped.has(s.sessionId)),
    meals,
  };
}

/** The key of the last session in a week: the next week continues the A/B (or upper/lower) rotation from it. */
export function lastKeyOf(week: WeekPlan | undefined): TemplateKey | undefined {
  const sessions = (week?.sessions ?? []).filter((s) => s.status !== 'skipped' && s.status !== 'moved');
  return sessions.sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)?.templateKey;
}

export function weekAfter(inputs: PlanInputs, previous: WeekPlan): WeekPlan {
  return plan(inputs, addDays(previous.weekStart, 7), lastKeyOf(previous));
}

/** A fresh week with no previous plan to continue from (e.g. the app was closed for a fortnight). */
export function weekFrom(inputs: PlanInputs, weekStart: LocalDate, lastKey?: TemplateKey): WeekPlan {
  return plan(inputs, weekStart, lastKey);
}

/**
 * The engine's state and ping functions look rows up by date, and pings look 3 days ahead, so on a Sunday they need
 * this week and the next as one plan. Rows never overlap (different dates and ids).
 */
export function mergeWeeks(weeks: readonly WeekPlan[]): WeekPlan {
  const sorted = [...weeks].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const first = sorted[0];
  if (!first) throw new Error('mergeWeeks needs at least one week');
  return {
    ...first,
    days: sorted.flatMap((w) => w.days),
    sessions: sorted.flatMap((w) => w.sessions),
    sets: sorted.flatMap((w) => w.sets),
    meals: sorted.flatMap((w) => w.meals),
  };
}
