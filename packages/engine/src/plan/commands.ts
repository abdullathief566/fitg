// applyCommand (types.md §9, offline-sync.md §3): devices change plans only through commands. Runs on the device first
// (optimistic) and again on the server (authoritative). Commands that change meals or sessions also rebalance the day.
import type { Instant, LocalDate, TemplateKey } from '../types/enums.ts';
import type {
  ChangedRows,
  CommandContext,
  PlanCommand,
  PlanState,
  ProfilePrefsPatch,
  RejectReason,
} from '../types/commands.ts';
import type { PlanDay, PlannedMeal, PlannedSet, SessionPlan, WeekPlan } from '../types/plan.ts';
import type { Profile } from '../types/profile.ts';
import {
  addDays,
  addMinutes,
  daysBetween,
  isLocalDate,
  isLocalTime,
  localDateOf,
  localTimeOf,
  minutesOf,
  toInstant,
} from '../util/time.ts';
import { makeIds } from '../util/uuid.ts';
import { recipeNutrition, roundNutrition } from '../nutrition/nutrition.ts';
import { eligibleAddons, recipeIneligibility } from '../meal/eligibility.ts';
import { bestAddon, fitDay, recipePortions } from '../meal/scale.ts';
import { consumedSoFar, rebalanceDay, remainingMeals } from '../meal/rebalance.ts';
import { portionHomeMeal } from '../meal/home.ts';
import { deterministicCandidates } from '../meal/candidates.ts';
import { planDays } from '../meal/plan.ts';
import { prepTasks } from '../meal/grocery.ts';
import { isAvailable, isInjurySafe } from '../workout/select.ts';
import { snapWeight, startingWeight, stepsFor } from '../workout/steps.ts';
import { reshuffle } from '../workout/reshuffle.ts';
import { buildSession, normalizeSchedule, scheduleWeek } from '../workout/session.ts';
import { mealProfileOf, shapesFor, weekSeed } from './week.ts';
import { isAtOrPastBedtime } from '../state/transition.ts';

/** `note` = one plain sentence for Today when a command reshuffled the week ("Moved Full body B to Thursday."). */
export type ApplyResult = { state: PlanState; changed: ChangedRows; reject?: RejectReason; note?: string };
type Result = ApplyResult;

const PLANNABLE_SESSION = new Set(['planned', 'reminded', 'ready']);

function clonePlan(plan: WeekPlan): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((d) => ({ ...d, prepTasks: [...d.prepTasks], problems: [...d.problems] })),
    sessions: plan.sessions.map((s) => ({ ...s })),
    sets: plan.sets.map((s) => ({ ...s })),
    meals: plan.meals.map((m) => ({ ...m, portions: [...m.portions], addons: [...m.addons] })),
  };
}

class Changes {
  meals = new Map<string, PlannedMeal>();
  sessions = new Map<string, SessionPlan>();
  sets = new Map<string, PlannedSet>();
  days = new Map<string, PlanDay>();
  removedMeals = new Set<string>();
  removedSets = new Set<string>();
  removedSessions = new Set<string>();
  profile: Partial<Profile> | undefined;

  rows(extra: Partial<ChangedRows> = {}): ChangedRows {
    const out: ChangedRows = { ...extra };
    if (this.days.size) out.days = [...this.days.values()];
    if (this.sessions.size) out.sessions = [...this.sessions.values()];
    if (this.sets.size) out.sets = [...this.sets.values()];
    if (this.meals.size) out.meals = [...this.meals.values()];
    if (this.profile) out.profile = this.profile;
    const removed: NonNullable<ChangedRows['removed']> = {};
    if (this.removedMeals.size) removed.meals = [...this.removedMeals];
    if (this.removedSets.size) removed.sets = [...this.removedSets];
    if (this.removedSessions.size) removed.sessions = [...this.removedSessions];
    if (Object.keys(removed).length) out.removed = removed;
    return out;
  }
}

/** Re-fits the recipe meals of a FUTURE day to its targets (after a swap or a Home Food pick). */
function refitFutureDay(state: PlanState, plan: WeekPlan, date: LocalDate, ch: Changes): void {
  const shape = shapesFor([date], plan.sessions, state.profile, state.profile.tz)[date]!;
  const dayMeals = plan.meals.filter((m) => m.date === date && m.status === 'planned');
  const recipeMeals = dayMeals.filter(
    (m) => m.kind === 'recipe' && m.recipeSlug && state.lib.recipes.get(m.recipeSlug),
  );
  const fixedShare = shape.slots
    .filter((s) => !recipeMeals.some((m) => m.slot === s.slot))
    .reduce((a, s) => a + s.kcalShare, 0);
  const target = { kcal: state.targets.kcal * (1 - fixedShare), proteinG: state.targets.proteinG * (1 - fixedShare) };
  const addon = bestAddon(eligibleAddons(state.lib.addons, state.profile.diet, state.pantry), state.lib.foods);
  const r = fitDay({
    items: recipeMeals.map((m) => ({ slot: m.slot, recipe: state.lib.recipes.get(m.recipeSlug!)! })),
    targets: target,
    addon,
    shape,
    foods: state.lib.foods,
  });
  for (const m of recipeMeals) {
    const f = r.slots.find((s) => s.slot === m.slot);
    if (!f) continue;
    m.multiplier = f.multiplier;
    m.addons = addon && f.addonUnits > 0 ? [{ addonKey: addon.key, qty: f.addonUnits }] : [];
    m.portions = recipePortions(f.recipe, state.lib.foods, f.multiplier);
    m.nutrition = roundNutrition(f.nutrition);
    ch.meals.set(m.id, m);
  }
  const day = plan.days.find((d) => d.date === date);
  if (day) {
    day.ok = r.ok;
    ch.days.set(day.id, day);
  }
}

/** Rebalances TODAY's remaining meals after a status change or a swap. */
function rebalanceToday(state: PlanState, plan: WeekPlan, date: LocalDate, now: Instant, ch: Changes): void {
  const shape = shapesFor([date], plan.sessions, state.profile, state.profile.tz)[date]!;
  const dayMeals = plan.meals.filter((m) => m.date === date);
  const remaining = remainingMeals(dayMeals, now);
  if (remaining.length === 0) return;
  const consumed = consumedSoFar(dayMeals, state.logs ?? new Map(), now);
  const day = plan.days.find((d) => d.date === date);
  const r = rebalanceDay({
    day: {
      day: day ?? ({} as PlanDay),
      shape,
      meals: dayMeals,
      totals: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    },
    consumed,
    remaining,
    targets: { kcal: state.targets.kcal, proteinG: state.targets.proteinG },
    addons: eligibleAddons(state.lib.addons, state.profile.diet, state.pantry),
    foods: state.lib.foods,
    now,
    lib: state.lib.recipes,
  });
  for (const m of r.remaining) {
    const i = plan.meals.findIndex((x) => x.id === m.id);
    if (i >= 0) plan.meals[i] = m;
    ch.meals.set(m.id, m);
  }
  if (day && day.tomorrowDeltaKcal !== r.tomorrowDeltaKcal) {
    day.tomorrowDeltaKcal = r.tomorrowDeltaKcal;
    ch.days.set(day.id, day);
  }
}

function afterMealChange(state: PlanState, plan: WeekPlan, date: LocalDate, ctx: CommandContext, ch: Changes): void {
  const today = localDateOf(ctx.now, ctx.tz);
  if (date === today) rebalanceToday(state, plan, date, ctx.now, ch);
  else if (date > today) refitFutureDay(state, plan, date, ch);
}

/** Re-plans the meals of future dates whose gym-day status (or the profile) changed. */
function replanMealDates(state: PlanState, plan: WeekPlan, dates: LocalDate[], ctx: CommandContext, ch: Changes): void {
  const today = localDateOf(ctx.now, ctx.tz);
  const future = [...new Set(dates)].filter((d) => d > today).sort();
  if (future.length === 0) return;
  const ids = makeIds(state.profile.userId);
  // The bundled library only holds recipes the build allowed (--prod refuses drafts), so drafts in it are usable.
  const profile = mealProfileOf(state.profile, state.pantry, { allowDrafts: true });
  const shapes = shapesFor(future, plan.sessions, state.profile, state.profile.tz);
  const candidates = deterministicCandidates({
    dates: future,
    lib: state.lib.recipes,
    foods: state.lib.foods,
    profile,
    shapes,
    seed: weekSeed(state.profile.userId, plan.weekStart),
  });
  const planned = planDays({
    dates: future,
    targets: state.targets,
    candidates,
    lib: state.lib.recipes,
    foods: state.lib.foods,
    pantry: state.pantry,
    addons: state.lib.addons,
    profile,
    shapes,
    tz: state.profile.tz,
    ids,
    version: plan.version,
  });
  for (const pd of planned.days) {
    const old = plan.meals.filter((m) => m.date === pd.day.date && m.status === 'planned');
    const keepIds = new Set(pd.meals.map((m) => m.id));
    for (const o of old) if (!keepIds.has(o.id)) ch.removedMeals.add(o.id);
    plan.meals = plan.meals.filter((m) => !(m.date === pd.day.date && m.status === 'planned'));
    plan.meals.push(...pd.meals);
    for (const m of pd.meals) ch.meals.set(m.id, m);
    const day = plan.days.find((d) => d.date === pd.day.date);
    if (day) {
      day.isGymDay = pd.day.isGymDay;
      day.ok = pd.day.ok;
      day.problems = pd.day.problems;
      ch.days.set(day.id, day);
    }
  }
  // Prep tasks follow the meals.
  const tasks = prepTasks(plan.meals, state.lib.recipes, state.profile.notificationPrefs, state.profile.tz);
  for (const day of plan.days) {
    const next = tasks.filter((t) => t.forDate === day.date);
    if (JSON.stringify(next) !== JSON.stringify(day.prepTasks)) {
      day.prepTasks = next;
      ch.days.set(day.id, day);
    }
  }
}

function lastCompleted(plan: WeekPlan, before: LocalDate): SessionPlan | undefined {
  return plan.sessions
    .filter((s) => (s.status === 'finished' || s.status === 'partial') && s.date <= before)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/** The post-workout meal follows the session's end. */
function setPostWorkoutTime(plan: WeekPlan, session: SessionPlan, ch: Changes): void {
  const pw = plan.meals.find((m) => m.date === session.date && m.slot === 'post_workout' && m.status === 'planned');
  if (!pw) return;
  pw.plannedAt = addMinutes(session.plannedStart, session.plannedDurationMin);
  ch.meals.set(pw.id, pw);
}

function validPrefs(patch: ProfilePrefsPatch): boolean {
  if (patch.gymSchedule) {
    for (const g of patch.gymSchedule) {
      if (!Number.isInteger(g.weekday) || g.weekday < 0 || g.weekday > 6) return false;
      if (!isLocalTime(g.start) || ![45, 60, 75].includes(g.durationMin)) return false;
    }
    if (normalizeSchedule(patch.gymSchedule).length !== patch.gymSchedule.length) return false;
  }
  if (patch.availableDays && patch.availableDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return false;
  if (patch.mealTimes) {
    const t = patch.mealTimes;
    if (![t.breakfast, t.lunch, t.dinner].every(isLocalTime) || (t.snack !== undefined && !isLocalTime(t.snack)))
      return false;
  }
  if (patch.cookTimePref !== undefined && ![10, 20, 30].includes(patch.cookTimePref)) return false;
  if (patch.budgetTier !== undefined && ![1, 2, 3].includes(patch.budgetTier)) return false;
  if (patch.eatingMode !== undefined && !['cook', 'family', 'out', 'mix'].includes(patch.eatingMode)) return false;
  if (patch.units !== undefined && !['kg', 'lb'].includes(patch.units)) return false;
  if (patch.homeDumbbellsKg && patch.homeDumbbellsKg.some((w) => !(w > 0 && w <= 100))) return false;
  const np = patch.notificationPrefs;
  if (np) {
    if (np.nightBefore !== undefined && !isLocalTime(np.nightBefore)) return false;
    if (
      np.preGymOffsetMin !== undefined &&
      !(Number.isInteger(np.preGymOffsetMin) && np.preGymOffsetMin >= 5 && np.preGymOffsetMin <= 60)
    )
      return false;
  }
  return true;
}

/**
 * Rejections: basePlanVersion ≠ the active plan's version AND the target was replaced by the newer version → stale.
 * Plan edits need the target planned (sessions: planned, reminded or ready — nothing has happened yet) → not_planned.
 * SetMealStatus / SetEatOutPick need planned|unknown → invalid_status. SetSessionFeedback needs finished|partial →
 * invalid_status. Missing target → not_found. Out-of-range values → invalid_value.
 */
export function applyCommand(state: PlanState, cmd: PlanCommand, ctx: CommandContext): Result {
  const reject = (reason: RejectReason): Result => ({ state, changed: {}, reject: reason });
  const newerPlan = cmd.basePlanVersion !== state.plan.version;
  const missing = (): Result => reject(newerPlan && cmd.basePlanVersion < state.plan.version ? 'stale' : 'not_found');
  const staleRow = (version: number): boolean => newerPlan && version > cmd.basePlanVersion;
  const today = localDateOf(ctx.now, ctx.tz);
  const plan = clonePlan(state.plan);
  const ch = new Changes();
  const done = (next: Partial<PlanState> = {}, extra: Partial<ChangedRows> = {}): Result => ({
    state: { ...state, ...next, plan },
    changed: ch.rows(extra),
  });

  switch (cmd.kind) {
    case 'SwapMeal': {
      const meal = plan.meals.find((m) => m.id === cmd.itemId);
      if (!meal) return missing();
      if (staleRow(meal.version)) return reject('stale');
      if (meal.status !== 'planned' || meal.date < today) return reject('not_planned');
      // The bundled library only holds recipes the build allowed (--prod refuses drafts), so drafts in it are usable.
      const profile = mealProfileOf(state.profile, state.pantry, { allowDrafts: true });
      const recipe = state.lib.recipes.get(cmd.recipeSlug);
      if (!recipe) return reject('invalid_value');
      if (recipeIneligibility(cmd.recipeSlug, meal.slot, meal.date, state.lib.recipes, profile) !== null)
        return reject('invalid_value');
      if (plan.meals.some((m) => m.date === meal.date && m.id !== meal.id && m.recipeSlug === cmd.recipeSlug))
        return reject('invalid_value');
      meal.kind = 'recipe';
      meal.recipeSlug = cmd.recipeSlug;
      delete meal.homeDishKeys;
      meal.multiplier = 1;
      meal.addons = [];
      meal.portions = recipePortions(recipe, state.lib.foods, 1);
      meal.nutrition = roundNutrition(recipeNutrition(recipe, state.lib.foods, 1));
      ch.meals.set(meal.id, meal);
      afterMealChange(state, plan, meal.date, ctx, ch);
      return done();
    }

    case 'SetMealStatus': {
      const meal = plan.meals.find((m) => m.id === cmd.itemId);
      if (!meal) return missing();
      if (staleRow(meal.version)) return reject('stale');
      if (meal.status !== 'planned' && meal.status !== 'unknown') return reject('invalid_status');
      if (cmd.status === 'replaced' && !cmd.logId) return reject('invalid_value');
      meal.status = cmd.status;
      meal.statusAt = ctx.now;
      if (cmd.logId) meal.replacedByLogId = cmd.logId;
      ch.meals.set(meal.id, meal);
      if (meal.date === today) rebalanceToday(state, plan, meal.date, ctx.now, ch);
      return done();
    }

    case 'SetHomeMeal': {
      const meal = plan.meals.find((m) => m.id === cmd.itemId);
      if (!meal) return missing();
      if (staleRow(meal.version)) return reject('stale');
      if (meal.status !== 'planned' || meal.date < today) return reject('not_planned');
      const dishes = cmd.homeDishKeys.map((k) => state.lib.homeDishes.get(k));
      if (dishes.length === 0 || dishes.some((d) => !d)) return reject('invalid_value');
      const shape = shapesFor([meal.date], plan.sessions, state.profile, state.profile.tz)[meal.date]!;
      const slot = shape.slots.find((s) => s.slot === meal.slot);
      const r = portionHomeMeal({
        dishes: dishes as NonNullable<(typeof dishes)[number]>[],
        slotTarget: {
          kcal: state.targets.kcal * (slot?.kcalShare ?? 0.3),
          ...(slot?.proteinMinG !== undefined ? { proteinMinG: slot.proteinMinG } : {}),
        },
        addons: eligibleAddons(state.lib.addons, state.profile.diet, state.pantry),
        pantry: state.pantry,
        lib: state.lib.recipes,
        foods: state.lib.foods,
      });
      meal.kind = 'home_food';
      meal.homeDishKeys = [...cmd.homeDishKeys];
      delete meal.recipeSlug;
      meal.multiplier = 1;
      meal.portions = r.portions;
      meal.addons = r.addons;
      meal.nutrition = r.nutrition;
      ch.meals.set(meal.id, meal);
      afterMealChange(state, plan, meal.date, ctx, ch);
      return done();
    }

    case 'SetEatOutPick': {
      const meal = plan.meals.find((m) => m.id === cmd.itemId);
      if (!meal) return missing();
      if (staleRow(meal.version)) return reject('stale');
      if (meal.status !== 'planned' && meal.status !== 'unknown') return reject('invalid_status');
      meal.kind = 'eat_out';
      delete meal.recipeSlug;
      delete meal.homeDishKeys;
      meal.replacedByLogId = cmd.logId;
      meal.portions = [];
      meal.addons = [];
      const log = state.logs?.get(cmd.logId);
      if (log) meal.nutrition = roundNutrition(log);
      ch.meals.set(meal.id, meal);
      afterMealChange(state, plan, meal.date, ctx, ch);
      return done();
    }

    case 'SwapExercise': {
      const session = plan.sessions.find((s) => s.id === cmd.sessionId);
      if (!session) return missing();
      if (staleRow(session.version)) return reject('stale');
      if (!PLANNABLE_SESSION.has(session.status)) return reject('not_planned');
      const sets = plan.sets.filter((s) => s.sessionId === session.id && s.exerciseOrder === cmd.exerciseOrder);
      if (sets.length === 0) return reject('invalid_value');
      const next = state.lib.exercises.byId.get(cmd.exerciseId);
      if (!next || !isAvailable(next, state.profile.equipment) || !isInjurySafe(next, state.profile.injuries)) {
        return reject('invalid_value');
      }
      const old = state.lib.exercises.byId.get(sets[0]!.exerciseId);
      const steps = stepsFor(next, state.profile.equipment === 'home_db' ? state.profile.homeDumbbellsKg : undefined);
      const prog = state.progress?.[next.id];
      const weight =
        prog !== undefined
          ? snapWeight(prog.currentWeightKg, steps)
          : old && old.loadType === next.loadType
            ? snapWeight(sets[0]!.targetWeightKg, steps)
            : startingWeight(next, {
                bodyweightKg: state.profile.weightKg,
                sex: state.profile.sex,
                experience: state.profile.experience,
                steps,
              });
      const ownRange = next.loadType === 'bodyweight' || old?.loadType === 'bodyweight';
      for (const s of sets) {
        s.swappedFromExerciseId = s.swappedFromExerciseId ?? s.exerciseId;
        s.exerciseId = next.id;
        s.targetWeightKg = weight;
        if (ownRange) {
          s.targetRepsMin = next.repMin;
          s.targetRepsMax = next.repMax;
          s.targetReps = next.repMin;
        }
        ch.sets.set(s.id, s);
      }
      return done();
    }

    case 'MoveSession': {
      const session = plan.sessions.find((s) => s.id === cmd.sessionId);
      if (!session) return missing();
      if (staleRow(session.version)) return reject('stale');
      if (!PLANNABLE_SESSION.has(session.status)) return reject('not_planned');
      const offset = isLocalDate(cmd.toDate) ? daysBetween(plan.weekStart, cmd.toDate) : -1;
      const occupied = plan.sessions.some(
        (s) => s.id !== session.id && s.date === cmd.toDate && s.status !== 'skipped' && s.status !== 'moved',
      );
      if (offset < 0 || offset > 6 || cmd.toDate < today || occupied || cmd.toDate === session.date)
        return reject('invalid_value');
      const from = session.date;
      const time = localTimeOf(session.plannedStart, ctx.tz);
      session.date = cmd.toDate;
      session.movedFromDate = from;
      session.plannedStart = toInstant(cmd.toDate, time, ctx.tz);
      session.status = 'planned';
      ch.sessions.set(session.id, session);
      replanMealDates(state, plan, [from, cmd.toDate], ctx, ch);
      return done();
    }

    case 'SetSessionTime': {
      const session = plan.sessions.find((s) => s.id === cmd.sessionId);
      if (!session) return missing();
      if (staleRow(session.version)) return reject('stale');
      if (!PLANNABLE_SESSION.has(session.status)) return reject('not_planned');
      if (!isLocalTime(cmd.start) || minutesOf(cmd.start) % 15 !== 0) return reject('invalid_value');
      session.plannedStart = toInstant(session.date, cmd.start, ctx.tz);
      ch.sessions.set(session.id, session);
      setPostWorkoutTime(plan, session, ch);
      return done();
    }

    case 'SkipSession':
    case 'LaterSession': {
      const session = plan.sessions.find((s) => s.id === cmd.sessionId);
      if (!session) return missing();
      if (staleRow(session.version)) return reject('stale');
      const allowed = cmd.kind === 'SkipSession' ? PLANNABLE_SESSION : new Set(['planned', 'reminded']);
      if (!allowed.has(session.status)) return reject('not_planned');
      if (cmd.kind === 'LaterSession') {
        const minutes = Number(cmd.minutes);
        if (![30, 60, 90].includes(minutes)) return reject('invalid_value');
        const newStart = addMinutes(session.plannedStart, minutes);
        const pastBedtime = isAtOrPastBedtime(newStart, session.date, state.profile.sleep, ctx.tz, state.profile.wake);
        if (!pastBedtime) {
          session.plannedStart = newStart;
          ch.sessions.set(session.id, session);
          setPostWorkoutTime(plan, session, ch);
          return done();
        }
      }
      // Skip (or "later" past bedtime → moved): the week reshuffles; sessions never stack.
      session.status = cmd.kind === 'SkipSession' ? 'skipped' : 'moved';
      const before = new Map(plan.sessions.map((s) => [s.id, s.date]));
      const last = lastCompleted(plan, today);
      const r = reshuffle({
        week: plan.sessions,
        missedSessionId: session.id,
        today,
        availableDays: state.profile.availableDays,
        gymSchedule: state.profile.gymSchedule,
        ...(last ? { lastCompletedDay: last.date } : {}),
        tz: ctx.tz,
      });
      plan.sessions = r.week;
      const affected: LocalDate[] = [];
      for (const s of r.week) {
        const was = before.get(s.id);
        if (was !== s.date || s.id === session.id) {
          ch.sessions.set(s.id, s);
          if (was) affected.push(was);
          affected.push(s.date);
        }
      }
      replanMealDates(state, plan, affected, ctx, ch);
      const result = done();
      if (r.note) result.note = r.note;
      return result;
    }

    case 'SetSessionFeedback': {
      const session = plan.sessions.find((s) => s.id === cmd.sessionId);
      if (!session) return missing();
      if (staleRow(session.version)) return reject('stale');
      if (session.status !== 'finished' && session.status !== 'partial') return reject('invalid_status');
      session.feedback = cmd.feedback;
      ch.sessions.set(session.id, session);
      return done();
    }

    case 'TickGrocery': {
      if (cmd.weekStart !== plan.weekStart || !state.grocery) return reject('not_found');
      const grocery = state.grocery.map((g) => ({ ...g }));
      const item = grocery.find((g) => g.foodKey === cmd.foodKey);
      if (!item) return reject('not_found');
      item.checked = cmd.checked;
      return { state: { ...state, grocery, plan }, changed: { grocery: [item] } };
    }

    case 'UpdatePrefs': {
      if (!validPrefs(cmd.patch)) return reject('invalid_value');
      const patch = cmd.patch;
      const profile: Profile = {
        ...state.profile,
        ...(patch.gymSchedule ? { gymSchedule: patch.gymSchedule.map((g) => ({ ...g })) } : {}),
        ...(patch.availableDays ? { availableDays: [...patch.availableDays] } : {}),
        ...(patch.mealTimes ? { mealTimes: { ...patch.mealTimes } } : {}),
        ...(patch.cookTimePref !== undefined ? { cookTimePref: patch.cookTimePref } : {}),
        ...(patch.budgetTier !== undefined ? { budgetTier: patch.budgetTier } : {}),
        ...(patch.eatingMode !== undefined ? { eatingMode: patch.eatingMode } : {}),
        ...(patch.dislikes ? { dislikes: [...patch.dislikes] } : {}),
        ...(patch.units !== undefined ? { units: patch.units } : {}),
        ...(patch.homeDumbbellsKg ? { homeDumbbellsKg: [...patch.homeDumbbellsKg] } : {}),
        notificationPrefs: { ...state.profile.notificationPrefs, ...(patch.notificationPrefs ?? {}) },
      };
      ch.profile = { ...cmd.patch, notificationPrefs: profile.notificationPrefs } as Partial<Profile>;
      const next: PlanState = { ...state, profile };
      const affected = new Set<LocalDate>();
      if (patch.gymSchedule) reschedule(next, plan, today, ctx, ch, affected);
      const mealsChanged =
        patch.mealTimes ||
        patch.cookTimePref !== undefined ||
        patch.eatingMode !== undefined ||
        patch.dislikes ||
        patch.budgetTier !== undefined;
      if (mealsChanged) for (let i = 0; i < 7; i++) affected.add(addDays(plan.weekStart, i));
      replanMealDates(next, plan, [...affected], ctx, ch);
      return { state: { ...next, plan }, changed: ch.rows() };
    }
  }
}

/** A new gym schedule: future planned sessions are replaced by the new schedule's sessions (max 4 a week). */
function reschedule(
  state: PlanState,
  plan: WeekPlan,
  today: LocalDate,
  ctx: CommandContext,
  ch: Changes,
  affected: Set<LocalDate>,
): void {
  const templates = state.lib.templates;
  const template = templates?.get(plan.templateId);
  if (!template) return;
  const keep = plan.sessions.filter((s) => s.date <= today || !PLANNABLE_SESSION.has(s.status));
  const drop = plan.sessions.filter((s) => !keep.includes(s));
  const lastKey: TemplateKey | undefined = [...keep].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.templateKey;
  const ids = makeIds(state.profile.userId);
  const fresh = scheduleWeek({
    template,
    gymSchedule: state.profile.gymSchedule,
    weekStart: plan.weekStart,
    tz: ctx.tz,
    ...(lastKey ? { lastCompletedKey: lastKey } : {}),
    version: plan.version,
    ids: (kind, ...parts) => ids(kind, ...parts, 'r', ctx.now),
  }).filter((s) => s.date > today && !keep.some((k) => k.date === s.date));
  // Re-key the new sessions so the A/B rotation continues from the last kept session.
  let key = lastKey;
  const keys = template.sessions.map((s) => s.key);
  const room = Math.max(0, 4 - keep.filter((s) => s.status !== 'skipped' && s.status !== 'moved').length);
  const added: SessionPlan[] = [];
  for (const s of fresh.slice(0, room)) {
    const i = key ? keys.indexOf(key) : -1;
    const k = keys[(i + 1) % keys.length] ?? keys[0]!;
    const ts = template.sessions.find((x) => x.key === k)!;
    added.push({ ...s, templateKey: k, name: ts.name, importance: ts.importance });
    key = k;
  }
  for (const s of drop) {
    ch.removedSessions.add(s.id);
    affected.add(s.date);
    for (const set of plan.sets.filter((x) => x.sessionId === s.id)) ch.removedSets.add(set.id);
  }
  plan.sets = plan.sets.filter((x) => !drop.some((d) => d.id === x.sessionId));
  plan.sessions = [...keep, ...added].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const s of added) {
    ch.sessions.set(s.id, s);
    affected.add(s.date);
    const ts = template.sessions.find((x) => x.key === s.templateKey)!;
    const built = buildSession({
      session: ts,
      lib: state.lib.exercises,
      variant: template.variant,
      equipment: state.profile.equipment,
      homeDumbbellsKg: state.profile.homeDumbbellsKg,
      injuries: state.profile.injuries,
      progress: state.progress ?? {},
      bodyweightKg: state.profile.weightKg,
      sex: state.profile.sex,
      experience: state.profile.experience,
      durationMin: s.plannedDurationMin,
      sessionId: s.id,
      ids,
    });
    plan.sets.push(...built.sets);
    for (const set of built.sets) ch.sets.set(set.id, set);
  }
}
