// nextStep (signals-and-pings.md §1): exactly one card for Today, first match wins.
import type { Instant, LocalDate, Slot } from '../types/enums.ts';
import type { NextStep, NextStepAction, UserState } from '../types/pings.ts';
import type { PlannedMeal, SessionPlan, WeekPlan } from '../types/plan.ts';
import type { ExerciseLib, RecipeIndex } from '../types/reference.ts';
import { fmtNum, humanizeSlug } from '../util/format.ts';
import {
  addDays,
  localMinutesOf,
  localTimeOf,
  minutesBetween,
  msOf,
  to12h,
  weekdayName,
  weekdayOf,
} from '../util/time.ts';
import { mealWindow } from '../pings/windows.ts';

export interface NextStepContext {
  recipes?: RecipeIndex;
  exercises?: ExerciseLib;
  /** For the post-workout window (default 20). */
  cookTimePref?: number;
  /** Has this week's check-in been done? */
  checkinDone?: boolean;
  /** Sessions whose comeback card was already shown. */
  seenComebackIds?: string[];
  /** Prep tasks the user ticked, as `${forDate}:${recipeSlug}`. */
  doneTaskKeys?: string[];
}

/** A planned or reminded session is the next step from 60 min before its start until its planned end (then the day
 *  moves on; it can still be started from the Week view, and becomes skipped at midnight). */
export const SESSION_CARD_EARLY_MIN = 60;
export const CHECKIN_FROM_MIN = 17 * 60;

const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  post_workout: 'After gym',
  dinner: 'Dinner',
  snack: 'Snack',
};

const a = (id: string, label: string, variant: NextStepAction['variant']): NextStepAction => ({ id, label, variant });

function mealTitle(m: PlannedMeal, recipes?: RecipeIndex): string {
  if (m.kind === 'home_food') return `${SLOT_LABEL[m.slot]}: home food`;
  if (m.kind === 'eat_out') return `${SLOT_LABEL[m.slot]}: eating out`;
  const name = m.recipeSlug ? (recipes?.get(m.recipeSlug)?.name ?? humanizeSlug(m.recipeSlug)) : 'Your meal';
  return `${SLOT_LABEL[m.slot]}: ${name}`;
}

function mealCard(m: PlannedMeal, ctx: NextStepContext): NextStep {
  const actions =
    m.kind === 'home_food'
      ? [
          a('pick_home', 'Pick the dishes', 'primary'),
          a('ate', 'Ate it', 'secondary'),
          a('something_else', 'Something else', 'quiet'),
        ]
      : m.kind === 'eat_out'
        ? [a('menu', 'Pick from the menu', 'primary'), a('ate', 'Ate it', 'secondary'), a('skip', 'Skipped', 'quiet')]
        : [
            a('ate', 'Ate it', 'primary'),
            a('swap', 'Swap', 'secondary'),
            a('something_else', 'Something else', 'quiet'),
          ];
  const step: NextStep = { kind: 'meal', refId: m.id, time: m.plannedAt, title: mealTitle(m, ctx.recipes), actions };
  const subtitle = mainPortions(m, ctx.recipes);
  if (subtitle) step.subtitle = subtitle;
  return step;
}

/** The portions that matter at a glance: protein, carbs and the oil (always written out), plus add-ons. */
function mainPortions(m: PlannedMeal, recipes?: RecipeIndex): string {
  if (m.kind === 'home_food') return m.portions.map((p) => p.label).join(' · ');
  const recipe = m.recipeSlug ? recipes?.get(m.recipeSlug) : undefined;
  const roles = new Map(recipe?.ingredients.map((i) => [i.foodKey, i]) ?? []);
  const labels = m.portions
    .filter((p) => {
      const ing = roles.get(p.foodKey);
      if (!ing) return true;
      return ing.role === 'protein' || ing.role === 'carb' || (ing.role === 'fat' && ing.unit === 'tsp');
    })
    .map((p) => p.label);
  for (const add of m.addons) labels.push(`+ ${add.qty} ${add.addonKey.replace(/_/g, ' ')}${add.qty > 1 ? 's' : ''}`);
  return labels.join(' · ');
}

function sessionDetail(s: SessionPlan, plan: WeekPlan, ctx: NextStepContext): { subtitle: string; detail?: string } {
  const sets = plan.sets
    .filter((x) => x.sessionId === s.id)
    .sort((x, y) => x.exerciseOrder - y.exerciseOrder || x.setIndex - y.setIndex);
  const ids = [...new Set(sets.map((x) => x.exerciseId))];
  const subtitle = `${ids.length} moves · about ${s.plannedDurationMin} min`;
  const first = sets[0];
  if (!first || !ctx.exercises) return { subtitle };
  const name = (ctx.exercises.byId.get(first.exerciseId)?.name ?? humanizeSlug(first.exerciseId)).replace(
    /\s*\([^)]*\)/g,
    '',
  );
  const n = sets.filter((x) => x.exerciseId === first.exerciseId).length;
  const load = first.targetWeightKg > 0 ? ` at ${fmtNum(first.targetWeightKg)} kg` : '';
  return { subtitle, detail: `${name} ${n}×${first.targetReps}${load}` };
}

function workoutCard(
  s: SessionPlan,
  plan: WeekPlan,
  ctx: NextStepContext,
  mode: 'upcoming' | 'resume' | 'ready',
): NextStep {
  const d = sessionDetail(s, plan, ctx);
  const actions =
    mode === 'resume'
      ? [a('resume', 'Resume', 'primary')]
      : mode === 'ready'
        ? [a('start', 'Start', 'primary'), a('not_now', 'Not now', 'quiet')]
        : [a('start', 'Start', 'primary'), a('later_30', 'Later', 'secondary'), a('skip', 'Skip', 'quiet')];
  const step: NextStep = {
    kind: 'workout',
    refId: s.id,
    time: s.plannedStart,
    title: s.name,
    subtitle: d.subtitle,
    actions,
  };
  if (d.detail) step.detail = d.detail;
  return step;
}

function firstItemOn(date: LocalDate, plan: WeekPlan): { title: string; time: Instant } | null {
  const items: Array<{ title: string; time: Instant }> = [];
  for (const s of plan.sessions)
    if (s.date === date && s.status === 'planned') items.push({ title: s.name, time: s.plannedStart });
  for (const m of plan.meals)
    if (m.date === date && m.status === 'planned' && m.plannedAt)
      items.push({ title: SLOT_LABEL[m.slot], time: m.plannedAt });
  items.sort((x, y) => msOf(x.time) - msOf(y.time));
  return items[0] ?? null;
}

/**
 * 1. a workout in_progress or ready → resume gym mode; 2. a session starting within 60 min, or reminded → the workout
 * card (Start · Later · Skip); 3. a missed session moved by reshuffle the user hasn't seen → comeback (once);
 * 4. a finished/partial session without a post-workout meal status → the post-workout meal (until the next meal's
 * cook-start, at most 2 h); 5. an unconfirmed meal from 90 min before to 60 min after its time → that meal;
 * 6. a prep task due before it's needed → prep; 7. Sunday after 17:00 without the check-in → check-in; 8. the next
 * upcoming plan item today; 9. nothing left → tomorrow (gym day) or rest (rest day).
 */
export function nextStep(s: UserState, plan: WeekPlan, now: Instant, ctx: NextStepContext = {}): NextStep {
  const today = s.day.date;
  const tz = s.tz;
  const nowMs = msOf(now);
  const cookTimePref = ctx.cookTimePref ?? 20;
  const session = s.day.sessionId ? plan.sessions.find((x) => x.id === s.day.sessionId) : undefined;
  const status = s.workout.status;

  // 1.
  if (session && (status === 'in_progress' || status === 'ready')) {
    return workoutCard(session, plan, ctx, status === 'in_progress' ? 'resume' : 'ready');
  }
  // 2.
  if (session && (status === 'planned' || status === 'reminded')) {
    const toStart = minutesBetween(now, session.plannedStart);
    const beforeEnd = toStart >= -session.plannedDurationMin;
    if (beforeEnd && (toStart <= SESSION_CARD_EARLY_MIN || status === 'reminded'))
      return workoutCard(session, plan, ctx, 'upcoming');
  }
  // 3.
  const seen = new Set(ctx.seenComebackIds ?? []);
  const comeback = plan.sessions
    .filter((x) => x.movedFromDate && x.status === 'planned' && x.date >= today && !seen.has(x.id))
    .sort((x, y) => (x.date < y.date ? -1 : 1))[0];
  if (comeback) {
    return {
      kind: 'comeback',
      refId: comeback.id,
      time: comeback.plannedStart,
      title: `${comeback.name} moved to ${weekdayName(comeback.date)}`,
      subtitle: 'Same weights as last time. No catching up to do.',
      actions: [a('got_it', 'Got it', 'primary')],
    };
  }

  const todayMeals = plan.meals.filter((m) => m.date === today);
  const statusOf = (m: PlannedMeal) => s.meals.find((x) => x.itemId === m.id)?.status ?? m.status;
  const open = (m: PlannedMeal) => statusOf(m) === 'planned';

  // 4.
  if (session && (status === 'finished' || status === 'partial')) {
    const pw = todayMeals.find((m) => m.slot === 'post_workout');
    if (pw && open(pw)) {
      const w = mealWindow(pw, todayMeals, cookTimePref, s.workout.endedAt);
      if (nowMs <= msOf(w.closes)) return mealCard(pw, ctx);
    }
  }
  // 5.
  const due = todayMeals
    .filter((m) => open(m) && m.plannedAt)
    .filter((m) => {
      const w = mealWindow(m, todayMeals, cookTimePref, m.slot === 'post_workout' ? s.workout.endedAt : undefined);
      return nowMs >= msOf(w.opens) && nowMs <= msOf(w.closes);
    })
    .sort((x, y) => msOf(x.plannedAt) - msOf(y.plannedAt))[0];
  if (due) return mealCard(due, ctx);

  // 6. A prep task is the next step when it's due before the next meal — or once today's meals are done
  // ("Soak the rajma tonight" shows up in the evening, not instead of lunch).
  const done = new Set(ctx.doneTaskKeys ?? []);
  const day = plan.days.find((d) => d.date === today);
  const nextMeal = todayMeals
    .filter((m) => open(m) && m.plannedAt && msOf(m.plannedAt) > nowMs)
    .sort((x, y) => msOf(x.plannedAt) - msOf(y.plannedAt))[0];
  const task = (day?.prepTasks ?? []).find(
    (t) =>
      !done.has(`${t.forDate}:${t.recipeSlug}`) &&
      msOf(t.at) > nowMs &&
      (!nextMeal || msOf(t.at) < msOf(nextMeal.plannedAt)),
  );
  if (task) {
    return {
      kind: 'prep',
      refId: `${task.forDate}:${task.recipeSlug}`,
      time: task.at,
      title: task.text,
      actions: [a('prep_done', 'Done', 'primary')],
    };
  }

  // 7.
  if (weekdayOf(today) === 6 && localMinutesOf(now, tz) >= CHECKIN_FROM_MIN && !ctx.checkinDone) {
    return {
      kind: 'checkin',
      title: 'Sunday check-in',
      subtitle: '30 seconds. Next week builds itself after.',
      actions: [a('checkin', 'Start check-in', 'primary')],
    };
  }

  // 8.
  const upcoming: Array<{ at: number; step: () => NextStep }> = [];
  if (
    session &&
    session.status === 'planned' &&
    (status === 'planned' || status === 'reminded') &&
    msOf(session.plannedStart) > nowMs
  ) {
    upcoming.push({ at: msOf(session.plannedStart), step: () => workoutCard(session, plan, ctx, 'upcoming') });
  }
  for (const m of todayMeals) {
    if (open(m) && m.plannedAt && msOf(m.plannedAt) > nowMs)
      upcoming.push({ at: msOf(m.plannedAt), step: () => mealCard(m, ctx) });
  }
  upcoming.sort((x, y) => x.at - y.at);
  const next = upcoming[0];
  if (next) return next.step();

  // 9.
  const tomorrow = firstItemOn(addDays(today, 1), plan);
  const tomorrowLine = tomorrow ? `Tomorrow: ${tomorrow.title} at ${to12h(localTimeOf(tomorrow.time, tz))}` : undefined;
  if (s.day.isGymDay) {
    const step: NextStep = {
      kind: 'tomorrow',
      title: tomorrowLine ?? "That's today done",
      actions: [a('see_week', 'See the week', 'quiet')],
    };
    if (tomorrow) step.time = tomorrow.time;
    return step;
  }
  const rest: NextStep = {
    kind: 'rest',
    title: 'Rest day. Nothing to do but eat well.',
    actions: [a('see_tomorrow', 'See tomorrow', 'quiet')],
  };
  if (tomorrowLine) rest.subtitle = tomorrowLine;
  return rest;
}

/** Local helper for tests and UI: the card's time as "6:30 PM". */
export function nextStepTimeLabel(step: NextStep, tz: string): string | undefined {
  return step.time ? to12h(localTimeOf(step.time, tz)) : undefined;
}
