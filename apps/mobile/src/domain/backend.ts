// The local backend (EXPO_PUBLIC_BACKEND=local, offline-sync.md §7): onboarding answers → engine on device → week
// plans → SQLite. Commands run here first (optimistic) and wait in the outbox for Phase 3's sync-push.
import type { BundleLib } from '@fitg/contracts';
import {
  addDays,
  applyCommand,
  localDateOf,
  missedSessions,
  weekStartOf,
  type Instant,
  type PlanCommandBody,
  type PlanState,
  type Profile,
  type RejectReason,
  type Targets,
  type WeekPlan,
} from '@fitg/engine';
import { refLookupFromLib } from '@fitg/contracts';
import {
  enqueueCommand,
  kvGet,
  kvSet,
  loadPantry,
  loadProfile,
  loadTargets,
  loadWeek,
  saveGymPlace,
  savePantry,
  saveProfile,
  saveTargets,
  saveWeek,
} from '../db/store';
import type { Sql } from '../db/sql';
import { pantryFromAnswers, profileFromAnswers, type OnboardingAnswers } from './onboarding';
import { firstWeek, targetsFor, templateIdFor, weekAfter, weekFrom, type PlanInputs } from './planner';

export interface Snapshot {
  userId: string;
  profile: Profile;
  targets: Targets;
  pantry: Set<string>;
  /** This week and next, oldest first. */
  weeks: WeekPlan[];
}

export interface BackendDeps {
  sql: Sql;
  lib: BundleLib;
  newId: () => string;
}

export const KV = {
  userId: 'user_id',
  onboardedAt: 'onboarded_at',
  draft: 'onboarding_draft',
} as const;

export async function completeOnboarding(
  deps: BackendDeps,
  answers: OnboardingAnswers,
  at: { now: Instant; tz: string },
): Promise<Snapshot> {
  const { sql, lib } = deps;
  const userId = (await kvGet<string>(sql, KV.userId)) ?? deps.newId();
  const profile = profileFromAnswers(answers, { userId }, at);
  const targets = targetsFor(profile, at.now);
  const pantry = pantryFromAnswers(answers);
  const inputs: PlanInputs = { profile, targets, pantry, lib };
  const thisWeek = firstWeek(inputs, at.now);
  const nextWeek = weekAfter(inputs, thisWeek);

  await kvSet(sql, KV.userId, userId);
  await saveProfile(sql, profile, at.now, at.now);
  await saveTargets(sql, userId, targets, {
    effectiveFrom: localDateOf(at.now, profile.tz),
    reason: 'onboarding',
    now: at.now,
  });
  await savePantry(sql, userId, pantry, lib, at.now);
  if (answers.gymPin) await saveGymPlace(sql, userId, answers.gymPin, at.now);
  await saveWeek(sql, userId, thisWeek, lib, at.now);
  await saveWeek(sql, userId, nextWeek, lib, at.now);
  await kvSet(sql, KV.onboardedAt, at.now);
  return { userId, profile, targets, pantry, weeks: [thisWeek, nextWeek] };
}

/**
 * Loads what Today needs and keeps the plan current: plans this week and next if they're missing, and turns
 * sessions that were never started on an earlier day into skips, so the week reshuffles (the Phase 1 decision:
 * "midnight → skipped" runs as a command at the first open of a new day).
 */
export async function loadSnapshot(deps: BackendDeps, now: Instant): Promise<Snapshot | undefined> {
  const { sql, lib } = deps;
  const userId = await kvGet<string>(sql, KV.userId);
  if (!userId || !(await kvGet<string>(sql, KV.onboardedAt))) return undefined;
  const profile = await loadProfile(sql, userId);
  if (!profile) return undefined;
  const today = localDateOf(now, profile.tz);
  const targets = await loadTargets(sql, userId, today);
  if (!targets) return undefined;
  const pantry = await loadPantry(sql, userId, refLookupFromLib(lib));
  const templateId = templateIdFor(profile);
  const inputs: PlanInputs = { profile, targets, pantry, lib };

  const start = weekStartOf(today);
  // null = saved but no longer readable (e.g. a newer bundle retired one of its recipes). It is planned again rather
  // than locking the user out of the app; this week from today on, like a signup week, so days already lived through
  // never come back as "missed" workouts.
  const readWeek = (weekStart: string): Promise<WeekPlan | undefined | null> =>
    loadWeek(sql, userId, weekStart, lib, templateId).catch(() => null);
  let current = await readWeek(start);
  if (current === null) {
    current = firstWeek(inputs, now);
    await saveWeek(sql, userId, current, lib, now);
  } else if (!current) {
    const previous = await readWeek(addDays(start, -7));
    current = previous ? weekAfter(inputs, previous) : weekFrom(inputs, start);
    await saveWeek(sql, userId, current, lib, now);
  }
  let next = await readWeek(addDays(start, 7));
  if (!next) {
    next = weekAfter(inputs, current);
    await saveWeek(sql, userId, next, lib, now);
  }

  let snapshot: Snapshot = { userId, profile, targets, pantry, weeks: [current, next] };
  for (const missed of missedSessions(current, today)) {
    const r = await runCommand(deps, snapshot, { kind: 'SkipSession', sessionId: missed.id }, now);
    snapshot = r.snapshot;
  }
  return snapshot;
}

export interface CommandOutcome {
  snapshot: Snapshot;
  reject?: RejectReason;
}

/** Which saved week holds the row this command targets. */
function weekFor(snapshot: Snapshot, body: PlanCommandBody): WeekPlan | undefined {
  const has = (w: WeekPlan): boolean => {
    switch (body.kind) {
      case 'SwapMeal':
      case 'SetMealStatus':
      case 'SetHomeMeal':
      case 'SetEatOutPick':
        return w.meals.some((m) => m.id === body.itemId);
      case 'SwapExercise':
      case 'MoveSession':
      case 'SetSessionTime':
      case 'SkipSession':
      case 'LaterSession':
      case 'SetSessionFeedback':
        return w.sessions.some((s) => s.id === body.sessionId);
      case 'TickGrocery':
        return w.weekStart === body.weekStart;
      case 'UpdatePrefs':
        return w === snapshot.weeks[0];
    }
  };
  return snapshot.weeks.find(has);
}

export async function runCommand(
  deps: BackendDeps,
  snapshot: Snapshot,
  body: PlanCommandBody,
  now: Instant,
): Promise<CommandOutcome> {
  const week = weekFor(snapshot, body);
  if (!week) return { snapshot, reject: 'not_found' };
  const state: PlanState = {
    profile: snapshot.profile,
    targets: snapshot.targets,
    plan: week,
    pantry: snapshot.pantry,
    lib: deps.lib,
  };
  const cmd = { id: deps.newId(), basePlanVersion: week.version, ...body };
  const result = applyCommand(state, cmd, { now, tz: snapshot.profile.tz });
  if (result.reject) return { snapshot, reject: result.reject };
  await saveWeek(deps.sql, snapshot.userId, result.state.plan, deps.lib, now);
  await enqueueCommand(deps.sql, cmd, now);
  return {
    snapshot: {
      ...snapshot,
      profile: result.state.profile,
      weeks: snapshot.weeks.map((w) => (w === week ? result.state.plan : w)),
    },
  };
}
