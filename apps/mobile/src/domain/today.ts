// What the Today screen shows, computed from the engine (signals-and-pings.md §1). Exactly one next step, always.
import type { BundleLib } from '@fitg/contracts';
import {
  buildPingSchedule,
  COPY_BANK,
  daysBetween,
  deriveUserState,
  localDateOf,
  msOf,
  pn,
  type Instant,
  type LocalDate,
  type NextStep,
  type Permissions,
  type PlannedMeal,
  type PlanNumber,
  type ScheduledPing,
  type SessionPlan,
  type Slot,
  type UserState,
  type WeekPlan,
} from '@fitg/engine';
import type { Snapshot } from './backend';
import { dayLabel, partOfDay, timeLabel } from './format';
import { mergeWeeks } from './planner';

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  post_workout: 'After gym',
  dinner: 'Dinner',
  snack: 'Snack',
};

export interface LocalContext {
  permissions: Permissions;
  seenComebackIds: string[];
  doneTaskKeys: string[];
}

export const NO_PERMISSIONS: Permissions = { notifications: 'undetermined', location: 'undetermined' };

export type TimelineStatus = 'done' | 'now' | 'upcoming' | 'past' | 'skipped';

export interface TimelineItem {
  key: string;
  kind: 'meal' | 'workout' | 'prep';
  refId: string;
  at: Instant;
  time: string;
  title: string;
  detail?: string;
  status: TimelineStatus;
}

export interface ProteinProgress {
  consumed: PlanNumber;
  target: PlanNumber;
  /** The next open meal and the protein it brings ("dinner covers 40"). */
  next?: { slot: string; protein: PlanNumber };
}

export interface TodayView {
  date: LocalDate;
  dateLabel: string;
  greeting: string;
  journeyDay: PlanNumber;
  isGymDay: boolean;
  habitOnly: boolean;
  next: NextStep;
  timeline: TimelineItem[];
  /** Full mode: the protein bar. */
  protein?: ProteinProgress;
  /** Habit-only mode: one dot per protein-rich meal, no food numbers. */
  proteinFoods?: Array<{ name: string; done: boolean }>;
  state: UserState;
  schedule: ScheduledPing[];
}

export interface EngineViews {
  plan: WeekPlan;
  state: UserState;
  schedule: ScheduledPing[];
}

/** The live state (events replayed over the plan) and the ping schedule, computed together. */
export function engineViews(snapshot: Snapshot, lib: BundleLib, now: Instant, local: LocalContext): EngineViews {
  const { profile } = snapshot;
  const plan = mergeWeeks(snapshot.weeks);
  const derive = (schedule: ScheduledPing[]) =>
    deriveUserState({
      plan,
      sets: plan.sets,
      events: [],
      schedule,
      permissions: local.permissions,
      now,
      tz: profile.tz,
      ctx: {
        recipes: lib.recipes,
        exercises: lib.exercises,
        cookTimePref: profile.cookTimePref,
        seenComebackIds: local.seenComebackIds,
        doneTaskKeys: local.doneTaskKeys,
        sleep: profile.sleep,
      },
    });
  const pings = (state: UserState) =>
    buildPingSchedule({
      plan,
      prefs: profile.notificationPrefs,
      learned: profile.learnedTiming,
      copy: COPY_BANK,
      state,
      mealTimes: profile.mealTimes,
      cookTimePref: profile.cookTimePref,
      wake: profile.wake,
      sleep: profile.sleep,
      now,
      tz: profile.tz,
      lib: { recipes: lib.recipes, exercises: lib.exercises },
      weightKg: profile.weightKg,
      eatingMode: profile.eatingMode,
    });
  // The state needs the schedule (the pre-gym time) and the schedule needs the state: two passes settle it.
  const schedule = pings(derive([]));
  return { plan, state: derive(schedule), schedule };
}

const DONE_MEAL = new Set(['eaten', 'half', 'replaced']);
const DONE_SESSION = new Set(['finished', 'partial']);
const GONE_SESSION = new Set(['skipped', 'moved', 'abandoned']);

export function mealTitle(m: PlannedMeal, lib: BundleLib): string {
  const name = m.recipeSlug
    ? (lib.recipes.get(m.recipeSlug)?.name ?? 'Your meal')
    : m.kind === 'home_food'
      ? 'Home food'
      : 'Eating out';
  return `${SLOT_LABEL[m.slot]}: ${name}`;
}

function sessionDetail(s: SessionPlan, plan: WeekPlan): string {
  const exercises = new Set(plan.sets.filter((x) => x.sessionId === s.id).map((x) => x.exerciseOrder)).size;
  return `${exercises} exercises · about ${s.plannedDurationMin} min`;
}

export function todayView(snapshot: Snapshot, lib: BundleLib, now: Instant, local: LocalContext): TodayView {
  const { profile, targets } = snapshot;
  const tz = profile.tz;
  const { plan, state, schedule } = engineViews(snapshot, lib, now, local);
  const date = localDateOf(now, tz);
  const nowMs = msOf(now);
  const next = state.nextStep;
  const habitOnly = targets.displayMode === 'habit_only';

  const mealStatus = new Map(state.meals.map((m) => [m.itemId, m.status]));
  const statusOf = (refId: string, at: Instant, raw: 'done' | 'skipped' | 'open'): TimelineStatus => {
    if (refId === next.refId) return 'now';
    if (raw === 'done') return 'done';
    if (raw === 'skipped') return 'skipped';
    return msOf(at) < nowMs ? 'past' : 'upcoming';
  };

  const timeline: TimelineItem[] = [];
  for (const m of plan.meals.filter((x) => x.date === date)) {
    const st = mealStatus.get(m.id) ?? m.status;
    const raw = DONE_MEAL.has(st) ? 'done' : st === 'skipped' ? 'skipped' : 'open';
    timeline.push({
      key: `meal:${m.id}`,
      kind: 'meal',
      refId: m.id,
      at: m.plannedAt,
      time: timeLabel(m.plannedAt, tz),
      title: mealTitle(m, lib),
      status: statusOf(m.id, m.plannedAt, raw),
    });
  }
  const session = plan.sessions.find((s) => s.date === date && s.status !== 'moved');
  if (session) {
    const st = state.day.sessionId === session.id ? state.workout.status : session.status;
    const raw = DONE_SESSION.has(st) ? 'done' : GONE_SESSION.has(st) ? 'skipped' : 'open';
    timeline.push({
      key: `workout:${session.id}`,
      kind: 'workout',
      refId: session.id,
      at: session.plannedStart,
      time: timeLabel(session.plannedStart, tz),
      title: session.name,
      detail: sessionDetail(session, plan),
      status: statusOf(session.id, session.plannedStart, raw),
    });
  }
  const day = plan.days.find((d) => d.date === date);
  const doneTasks = new Set(local.doneTaskKeys);
  for (const t of day?.prepTasks ?? []) {
    const refId = `${t.forDate}:${t.recipeSlug}`;
    timeline.push({
      key: `prep:${refId}`,
      kind: 'prep',
      refId,
      at: t.at,
      time: timeLabel(t.at, tz),
      title: t.text,
      status: statusOf(refId, t.at, doneTasks.has(refId) ? 'done' : 'open'),
    });
  }
  timeline.sort((a, b) => msOf(a.at) - msOf(b.at));

  const todayMeals = plan.meals.filter((m) => m.date === date);
  const open = (m: PlannedMeal) => (mealStatus.get(m.id) ?? m.status) === 'planned';
  const nextMeal = todayMeals
    .filter((m) => open(m) && msOf(m.plannedAt) > nowMs)
    .sort((a, b) => msOf(a.plannedAt) - msOf(b.plannedAt))[0];

  const view: TodayView = {
    date,
    dateLabel: dayLabel(date),
    greeting: `${partOfDay(now, tz)}${profile.firstName ? `, ${profile.firstName}` : ''}.`,
    journeyDay: pn(profile.journeyStartedAt ? daysBetween(profile.journeyStartedAt, date) + 1 : 1),
    isGymDay: state.day.isGymDay,
    habitOnly,
    next,
    timeline,
    state,
    schedule,
  };
  if (habitOnly) {
    view.proteinFoods = todayMeals
      .filter((m) => m.nutrition.proteinG >= PROTEIN_RICH_G)
      .map((m) => ({ name: mealTitle(m, lib), done: DONE_MEAL.has(mealStatus.get(m.id) ?? m.status) }));
  } else if (day) {
    view.protein = {
      consumed: pn(Math.round(state.consumed.proteinG)),
      target: pn(day.proteinTarget),
      ...(nextMeal
        ? {
            next: {
              slot: SLOT_LABEL[nextMeal.slot].toLowerCase(),
              protein: pn(Math.round(nextMeal.nutrition.proteinG)),
            },
          }
        : {}),
    };
  }
  return view;
}

/** A meal with at least this much protein counts as a "protein food" in habit-only mode. */
export const PROTEIN_RICH_G = 15;
