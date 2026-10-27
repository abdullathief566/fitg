// Ping scheduling (signals-and-pings.md §3). All rules are enforced here and unit-tested:
// ≤ 4 sounding pings per local day, priority pre_gym > post_gym > pre_dinner > night_before, the 20-minute gap merge,
// quiet hours, never in the past, never for a session already under way or over, copy from the bank.
import type { EatingMode, Instant, LocalDate, LocalTime, PingType, Slot } from '../types/enums.ts';
import type { LearnedTiming, MealTimes, NotificationPrefs } from '../types/profile.ts';
import type { PlanDay, PlannedMeal, PlannedSet, SessionPlan, WeekPlan } from '../types/plan.ts';
import type {
  CopyBank,
  CopyTemplate,
  CopyVariant,
  DayKind,
  PingEventRow,
  ScheduledPing,
  UserState,
} from '../types/pings.ts';
import type { ExerciseLib, RecipeIndex } from '../types/reference.ts';
import { hash32 } from '../util/hash.ts';
import { capitalize, fillTemplate, fmtNum, fmtQty, humanizeSlug, plural, tidy } from '../util/format.ts';
import { labelQty } from '../units/units.ts';
import {
  addDays,
  addMinutes,
  inQuietHours,
  localDateOf,
  localMinutesOf,
  localTimeOf,
  minutesBetween,
  minutesOf,
  msOf,
  to12h,
  toInstant,
  toInstantMinutes,
  weekdayName,
} from '../util/time.ts';
import { postWorkoutProteinMin } from '../meal/shape.ts';
import { mealWindow } from './windows.ts';
import { ASK_LINES } from './copy-bank.ts';

export const MAX_SOUNDING_PER_DAY = 4;
export const MERGE_GAP_MIN = 20;
export const POST_GYM_FALLBACK_MIN = 45;
export const WINDOW_DAYS = 3; // today … today+2

/** Lower number = higher priority. */
export const PING_PRIORITY: Record<PingType, number> = {
  pre_gym: 0,
  post_gym: 1,
  pre_dinner: 2,
  night_before: 3,
  trial_reminder: 9,
  checkin: 9,
};

const ACTIVE_SESSION_STATUSES = new Set(['planned', 'reminded', 'ready']);

const ASK_SLOT_WORDS: Record<Slot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  post_workout: 'your post-workout meal',
  dinner: 'dinner',
  snack: 'your snack',
};

export interface BuildPingScheduleInput {
  /** Covers today … today+3 (night_before for today+2 needs today+3). */
  plan: WeekPlan;
  prefs: NotificationPrefs;
  learned: LearnedTiming;
  copy: CopyBank;
  state: UserState;
  mealTimes: MealTimes;
  cookTimePref: number;
  wake: LocalTime;
  sleep: LocalTime;
  now: Instant;
  tz: string;
  /** Names for the copy (recipe and exercise names). */
  lib: { recipes: RecipeIndex; exercises: ExerciseLib };
  /** For {protein}: the post-workout protein minimum is round(0.4 · weightKg, 5). */
  weightKg: number;
  /** Home Food dinners ping at dinner − 15 min. Default 'cook'. */
  eatingMode?: EatingMode;
  /** Last session's weight per exercise, for {deltaClause} ("2.5 kg more than Monday"). */
  lastWeights?: Record<string, { weightKg: number; date: LocalDate }>;
  /** learnTiming just changed this ping's shift: its first upcoming ping uses the `late` wording once. */
  announceShift?: Partial<Record<'pre_gym' | 'pre_dinner', boolean>>;
  /** Meals already asked about by pings that have fired (each meal is asked at most once). */
  askedMealIds?: string[];
}

interface Candidate {
  type: PingType;
  fireAt: Instant;
  fireDate: LocalDate;
  aboutDate: LocalDate;
  session?: SessionPlan;
  meal?: PlannedMeal;
  /** The moment the ping is about (a session start or a meal time) — for quiet-hours moves. */
  about?: Instant;
  variant: CopyVariant;
  dayKind: DayKind;
  vars: Record<string, string | number | undefined>;
  askMeal?: PlannedMeal;
  merged: string[];
}

function shortExerciseName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

function mealName(m: PlannedMeal | undefined, recipes: RecipeIndex): string {
  if (!m) return '';
  if (m.kind === 'home_food') return 'home food';
  if (m.kind === 'eat_out') return 'eating out';
  const r = m.recipeSlug ? recipes.get(m.recipeSlug) : undefined;
  return r ? r.name : m.recipeSlug ? humanizeSlug(m.recipeSlug) : '';
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

/** "1 tsp oil, not 3." when oil ≤ 2 tsp; "3 tsp oil." above that; nothing when there's no oil. */
export function oilLine(oilTsp: number): string {
  if (oilTsp <= 0) return '';
  const q = fmtQty(Math.round(oilTsp * 2) / 2);
  return oilTsp <= 2 ? `${q} tsp oil, not 3.` : `${q} tsp oil.`;
}

/** "Rice: 1 katori" / "2 rotis" from a meal's carb portion, or ''. */
export function carbPortion(meal: PlannedMeal | undefined, recipes: RecipeIndex): string {
  if (!meal?.recipeSlug) return '';
  const r = recipes.get(meal.recipeSlug);
  if (!r) return '';
  const carbs = r.ingredients.filter((i) => i.role === 'carb');
  const pick = carbs.find((i) => i.unit !== 'g' && i.unit !== 'ml') ?? carbs[0];
  if (!pick) return '';
  const portion = meal.portions.find((p) => p.foodKey === pick.foodKey);
  if (!portion) return '';
  const q = labelQty(portion.unit, portion.qty);
  if (portion.unit === 'roti') return `${fmtQty(q)} ${plural('roti', q)}`;
  const name = capitalize(portion.label.replace(/^[\d½¼¾]+\s+\S+\s+/, '').replace(/\s*\(.*\)$/, ''));
  return portion.unit === 'g' || portion.unit === 'ml'
    ? `${name}: ${fmtNum(q)} ${portion.unit}`
    : `${name}: ${fmtQty(q)} ${portion.unit}`;
}

/** The rebalanced dinner portions, for the "smaller dinner" wording. */
function dinnerPortions(meal: PlannedMeal | undefined, recipes: RecipeIndex): string {
  if (!meal?.recipeSlug) return '';
  const r = recipes.get(meal.recipeSlug);
  if (!r) return '';
  const main = r.ingredients.filter((i) => i.role === 'protein' || i.role === 'carb').map((i) => i.foodKey);
  const parts = meal.portions.filter((p) => main.includes(p.foodKey)).map((p) => p.label);
  for (const a of meal.addons) parts.push(`${a.qty} ${a.addonKey.replace(/_/g, ' ')}${a.qty > 1 ? 's' : ''}`);
  return capitalize(parts.join(', '));
}

function sessionSets(sets: readonly PlannedSet[], sessionId: string): PlannedSet[] {
  return sets
    .filter((s) => s.sessionId === sessionId)
    .sort((a, b) => a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex);
}

function exerciseIds(sets: readonly PlannedSet[]): string[] {
  const ids: string[] = [];
  for (const s of sets) if (!ids.includes(s.exerciseId)) ids.push(s.exerciseId);
  return ids;
}

/** A session is a comeback when it was moved, or the session before it was skipped or moved. */
export function isComebackSession(session: SessionPlan, sessions: readonly SessionPlan[]): boolean {
  if (session.movedFromDate) return true;
  const before = sessions
    .filter((s) => s.id !== session.id && s.date < session.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return !!before && (before.status === 'skipped' || before.status === 'moved');
}

function sessionVars(session: SessionPlan, p: BuildPingScheduleInput): Record<string, string | number | undefined> {
  const sets = sessionSets(p.plan.sets, session.id);
  const ids = exerciseIds(sets);
  const names = ids.map((id) => shortExerciseName(p.lib.exercises.byId.get(id)?.name ?? humanizeSlug(id)));
  const firstId = ids[0];
  const firstSets = sets.filter((s) => s.exerciseId === firstId);
  const first = firstSets[0];
  let deltaClause = '';
  if (firstId && first) {
    const last = p.lastWeights?.[firstId];
    if (last && first.targetWeightKg > last.weightKg) {
      deltaClause = `, ${fmtNum(first.targetWeightKg - last.weightKg)} kg more than ${weekdayName(last.date)}`;
    }
  }
  return {
    session: session.name,
    time: to12h(localTimeOf(session.plannedStart, p.tz)),
    exerciseList: names.slice(0, 4).join(', '),
    offset: p.prefs.preGymOffsetMin,
    n: ids.length,
    min: session.plannedDurationMin,
    firstLift: firstId ? shortExerciseName(p.lib.exercises.byId.get(firstId)?.name ?? humanizeSlug(firstId)) : '',
    sets: firstSets.length,
    reps: first?.targetReps,
    kg: first && first.targetWeightKg > 0 ? fmtNum(first.targetWeightKg) : undefined,
    deltaClause,
  };
}

function pickTemplate(
  bank: CopyBank,
  type: PingType,
  dayKind: DayKind,
  variant: CopyVariant,
  fireDate: LocalDate,
): { template: CopyTemplate; variant: CopyVariant } {
  const byDay = bank[type];
  const tryGet = (d: DayKind, v: CopyVariant): CopyTemplate[] | undefined => {
    const list = byDay[d]?.[v];
    return list && list.length > 0 ? list : undefined;
  };
  const other: DayKind = dayKind === 'gym' ? 'rest' : 'gym';
  const order: Array<[DayKind, CopyVariant]> = [
    [dayKind, variant],
    [dayKind, 'standard'],
    [other, variant],
    [other, 'standard'],
  ];
  for (const [d, v] of order) {
    const list = tryGet(d, v);
    if (list) return { template: list[hash32(fireDate + type) % list.length]!, variant: v };
  }
  throw new Error(`Copy bank has no template for ${type}`);
}

function render(text: string, vars: Record<string, string | number | undefined>): string {
  const t = vars.kg === undefined ? text.replace(/ at \{kg\} kg/g, '') : text;
  return tidy(fillTemplate(t, vars));
}

/** Day-of-week rule for the post-gym fallback and dinner: which meal does a ping talk about? */
function mealFor(meals: readonly PlannedMeal[], date: LocalDate, slot: Slot): PlannedMeal | undefined {
  return meals.find((m) => m.date === date && m.slot === slot);
}

/**
 * Builds the sounding pings for today … today+2. Rules (signals-and-pings.md §3):
 * 1. ≤ 4 sounding per local day (minus the ones that already sounded today). 2. Priority
 * pre_gym > post_gym > pre_dinner > night_before. 3. A lower-priority ping < 20 min from a higher one is dropped and
 * its short line appended to the higher one's body (exactly 20 min apart is fine). 4. Quiet hours (sleep → wake): moved
 * to wake + 15 min if what it's about hasn't happened by then, else dropped. 5. Never in the past; never for a session
 * already in progress, finished, partial, skipped or moved. 6. Copy from the bank: variant by rule, wording by
 * hash32(fireDate + type) % n, numbers by code.
 */
export function buildPingSchedule(p: BuildPingScheduleInput): ScheduledPing[] {
  const today = localDateOf(p.now, p.tz);
  const days = new Map<LocalDate, PlanDay>(p.plan.days.map((d) => [d.date, d]));
  // Today's truth is the UserState (events replayed over the plan): a session started or finished, or a meal tapped,
  // changes today's pings even before any plan row is rewritten.
  const live = p.state.day.date === today;
  const liveStatus = (s: SessionPlan): SessionPlan['status'] =>
    live && p.state.day.sessionId === s.id ? p.state.workout.status : s.status;
  const liveMeals = new Map(live ? p.state.meals.map((m) => [m.itemId, m.status]) : []);
  const sessionsByDate = new Map<LocalDate, SessionPlan>();
  for (const s of p.plan.sessions)
    if (s.status !== 'skipped') sessionsByDate.set(s.date, { ...s, status: liveStatus(s) });
  const meals = p.plan.meals.map((m) => {
    const st = liveMeals.get(m.id);
    return st && st !== m.status ? { ...m, status: st } : m;
  });
  const eatingMode = p.eatingMode ?? 'cook';
  const proteinMin = postWorkoutProteinMin(p.weightKg);
  const sleepMin = minutesOf(p.sleep);
  const wakeMin = minutesOf(p.wake);
  const sleepAbs = sleepMin < wakeMin ? sleepMin + 1440 : sleepMin;
  const nightBeforeMin = Math.min(minutesOf(p.prefs.nightBefore), sleepAbs - 30);

  const candidates: Candidate[] = [];
  for (let k = 0; k < WINDOW_DAYS; k++) {
    const date = addDays(today, k);
    const day = days.get(date);
    const session = sessionsByDate.get(date);
    const isGymDay = day?.isGymDay ?? !!session;

    // pre_gym + post_gym (fallback)
    if (session && ACTIVE_SESSION_STATUSES.has(session.status)) {
      const vars = sessionVars(session, p);
      const comeback = isComebackSession(session, p.plan.sessions);
      candidates.push({
        type: 'pre_gym',
        fireAt: addMinutes(session.plannedStart, -p.prefs.preGymOffsetMin + p.learned.preGymShiftMin),
        fireDate: date,
        aboutDate: date,
        session,
        about: session.plannedStart,
        variant: comeback ? 'comeback' : 'standard',
        dayKind: 'gym',
        vars,
        merged: [],
      });
      const pw = mealFor(meals, date, 'post_workout');
      candidates.push({
        type: 'post_gym',
        fireAt: addMinutes(session.plannedStart, session.plannedDurationMin + POST_GYM_FALLBACK_MIN),
        fireDate: date,
        aboutDate: date,
        session,
        ...(pw ? { meal: pw } : {}),
        about: addMinutes(session.plannedStart, session.plannedDurationMin),
        variant: comeback ? 'comeback' : 'late',
        dayKind: 'gym',
        vars: {
          protein: proteinMin,
          meal: lowerFirst(mealName(pw, p.lib.recipes)),
          mealMin: pw?.recipeSlug ? p.lib.recipes.get(pw.recipeSlug)?.cookTimeMin : undefined,
        },
        merged: [],
      });
    }

    // pre_dinner
    const dinner = mealFor(meals, date, 'dinner');
    if (dinner && dinner.status === 'planned') {
      const dinnerAt = dinner.plannedAt || toInstant(date, p.mealTimes.dinner, p.tz);
      const homeFood = dinner?.kind === 'home_food' || eatingMode === 'family' || eatingMode === 'mix';
      const fireAt = homeFood
        ? addMinutes(dinnerAt, -15)
        : addMinutes(dinnerAt, -(p.cookTimePref + 10) + p.learned.dinnerShiftMin);
      const recipe = dinner?.recipeSlug ? p.lib.recipes.get(dinner.recipeSlug) : undefined;
      const lunch = mealFor(meals, date, 'lunch');
      // Quickest alternative: the fastest recipe among this window's other planned lunches/dinners.
      const quick = meals
        .filter((m) => m.id !== dinner?.id && (m.slot === 'dinner' || m.slot === 'lunch') && m.recipeSlug)
        .map((m) => p.lib.recipes.get(m.recipeSlug!))
        .filter((r): r is NonNullable<typeof r> => !!r && (!recipe || r.cookTimeMin < recipe.cookTimeMin))
        .sort((a, b) => a.cookTimeMin - b.cookTimeMin || a.slug.localeCompare(b.slug))[0];
      const offPlanLunch = lunch?.status === 'replaced';
      candidates.push({
        type: 'pre_dinner',
        fireAt,
        fireDate: date,
        aboutDate: date,
        ...(dinner ? { meal: dinner } : {}),
        about: dinnerAt,
        variant: offPlanLunch ? 'comeback' : 'standard',
        dayKind: isGymDay ? 'gym' : 'rest',
        vars: {
          meal: mealName(dinner, p.lib.recipes),
          mealMin: recipe?.cookTimeMin,
          oilLine: oilLine(recipe ? recipe.oilTsp : 0),
          carbPortion: carbPortion(dinner, p.lib.recipes),
          quickMeal: quick ? lowerFirst(quick.name) : undefined,
          quickMin: quick?.cookTimeMin,
          dinnerPortions: dinnerPortions(dinner, p.lib.recipes),
        },
        merged: [],
      });
    }

    // night_before (about tomorrow; only when tomorrow's plan exists)
    const tomorrow = addDays(date, 1);
    const tDay = days.get(tomorrow);
    const tSession = sessionsByDate.get(tomorrow);
    if (tDay || tSession) {
      const prep = (day?.prepTasks ?? []).map((t) => t.text).join(' ');
      const tGym = tDay?.isGymDay ?? !!tSession;
      let vars: Record<string, string | number | undefined>;
      let variant: CopyVariant = 'standard';
      if (tGym && tSession) {
        vars = { ...sessionVars(tSession, p), prepTask: prep };
        if (isComebackSession(tSession, p.plan.sessions)) variant = 'comeback';
      } else {
        const bf = mealFor(meals, tomorrow, 'breakfast');
        const lu = mealFor(meals, tomorrow, 'lunch');
        vars = {
          breakfast: mealName(bf, p.lib.recipes) || 'Breakfast',
          breakfastTime: to12h(bf?.plannedAt ? localTimeOf(bf.plannedAt, p.tz) : p.mealTimes.breakfast),
          lunch: mealName(lu, p.lib.recipes) || 'Lunch',
          prepTask: prep,
        };
      }
      candidates.push({
        type: 'night_before',
        fireAt: toInstantMinutes(date, nightBeforeMin, p.tz),
        fireDate: date,
        aboutDate: tomorrow,
        ...(tSession ? { session: tSession } : {}),
        variant,
        dayKind: tGym && tSession ? 'gym' : 'rest',
        vars,
        merged: [],
      });
    }
  }

  // 4. Quiet hours.
  const afterQuiet: Candidate[] = [];
  for (const c of candidates) {
    const local = localMinutesOf(c.fireAt, p.tz);
    if (!inQuietHours(local, p.sleep, p.wake)) {
      afterQuiet.push(c);
      continue;
    }
    if (c.type === 'night_before' || !c.about) continue;
    // The next wake after the ping's time.
    const localDate = localDateOf(c.fireAt, p.tz);
    let wakeAt = toInstant(localDate, p.wake, p.tz);
    if (msOf(wakeAt) <= msOf(c.fireAt)) wakeAt = toInstant(addDays(localDate, 1), p.wake, p.tz);
    const moved = addMinutes(wakeAt, 15);
    if (msOf(c.about) > msOf(moved)) afterQuiet.push({ ...c, fireAt: moved, fireDate: localDateOf(moved, p.tz) });
  }

  // 3. Gap merge per local fire day — over ALL candidates, past ones included, so a ping that already fired still
  // absorbs a lower-priority one < 20 min after it (rescheduling at 20:31 must not resurrect a merged 20:40 ping).
  const byDay = new Map<LocalDate, Candidate[]>();
  for (const c of afterQuiet) byDay.set(c.fireDate, [...(byDay.get(c.fireDate) ?? []), c]);
  const kept: Candidate[] = [];
  for (const [date, list] of byDay) {
    const sorted = [...list].sort((a, b) => PING_PRIORITY[a.type] - PING_PRIORITY[b.type]);
    const dayKept: Candidate[] = [];
    for (const c of sorted) {
      const near = dayKept
        .filter((h) => Math.abs(minutesBetween(h.fireAt, c.fireAt)) < MERGE_GAP_MIN)
        .sort((a, b) => Math.abs(minutesBetween(a.fireAt, c.fireAt)) - Math.abs(minutesBetween(b.fireAt, c.fireAt)))[0];
      if (near) {
        const tpl = pickTemplate(p.copy, c.type, c.dayKind, c.variant, c.fireDate).template;
        near.merged.push(render(tpl.short, c.vars));
        continue;
      }
      dayKept.push(c);
    }
    // 5. Never in the past. 1–2. Cap by priority: today, what already sounded (UserState) counts.
    const upcoming = dayKept.filter((c) => msOf(c.fireAt) > msOf(p.now));
    const allowed =
      date === today ? Math.max(0, MAX_SOUNDING_PER_DAY - p.state.pings.soundsToday) : MAX_SOUNDING_PER_DAY;
    kept.push(...upcoming.slice(0, allowed));
  }
  kept.sort((a, b) => msOf(a.fireAt) - msOf(b.fireAt));

  // Asks: each ping asks about the earliest untapped meal of its day whose window has closed (once per meal).
  const asked = new Set(p.askedMealIds ?? []);
  for (const c of kept) {
    const dayMeals = meals.filter((m) => m.date === c.fireDate);
    const candidate = dayMeals
      .filter((m) => m.status === 'planned' && m.plannedAt !== '' && !asked.has(m.id))
      .filter((m) => msOf(mealWindow(m, dayMeals, p.cookTimePref).closes) <= msOf(c.fireAt))
      .sort((a, b) => msOf(a.plannedAt) - msOf(b.plannedAt))[0];
    if (candidate) {
      c.askMeal = candidate;
      asked.add(candidate.id);
    }
  }

  // 'late' wording once, for the first upcoming ping whose shift just changed.
  for (const type of ['pre_gym', 'pre_dinner'] as const) {
    if (!p.announceShift?.[type]) continue;
    const first = kept.find((c) => c.type === type && c.variant === 'standard');
    if (first && (type === 'pre_gym' || first.vars.quickMeal !== undefined)) {
      first.variant = 'late';
      first.vars.newTime = to12h(localTimeOf(first.fireAt, p.tz));
    }
  }

  return kept.map((c) => toScheduledPing(c, p));
}

function categoryOf(c: Candidate, ask: boolean): string {
  const base = c.type === 'post_gym' ? 'post_gym_fallback' : c.type;
  return ask ? `${base}_ask` : base;
}

function toScheduledPing(c: Candidate, p: BuildPingScheduleInput): ScheduledPing {
  const ask = !!c.askMeal;
  const vars = { ...c.vars, askSlot: c.askMeal ? ASK_SLOT_WORDS[c.askMeal.slot] : undefined };
  // The ask variant keeps the normal wording and ADDS the question (copy.md §3).
  const { template } = pickTemplate(p.copy, c.type, c.dayKind, c.variant, c.fireDate);
  let body = render(template.body, vars);
  if (c.merged.length > 0) body = tidy(`${body} ${c.merged.join(' ')}`);
  if (ask) {
    const line = ASK_LINES[hash32(`${c.fireDate}${c.type}ask`) % ASK_LINES.length] ?? ASK_LINES[0]!;
    body = tidy(`${body} ${render(line, vars)}`);
  }
  const data: ScheduledPing['data'] = { fireDate: c.fireDate, aboutDate: c.aboutDate };
  const planItemId = c.type === 'night_before' ? undefined : (c.meal?.id ?? c.session?.id);
  if (planItemId) data.planItemId = planItemId;
  if (c.session) data.sessionId = c.session.id;
  if (c.askMeal) data.askMealItemId = c.askMeal.id;
  return {
    id: `ping:${c.fireDate}:${c.type}`,
    type: c.type,
    fireAt: c.fireAt,
    title: render(template.title, vars),
    body,
    categoryId: categoryOf(c, ask),
    channelId: c.type === 'pre_gym' ? 'pings_high' : 'pings',
    sound: true,
    interruption: c.type === 'pre_gym' && p.prefs.timeSensitive ? 'timeSensitive' : 'active',
    data,
  };
}

/** Stable fingerprint of what a scheduled notification shows and when. */
export function pingFingerprint(p: Partial<ScheduledPing>): string | null {
  if (p.fireAt === undefined || p.title === undefined || p.body === undefined) return null;
  return JSON.stringify([p.fireAt, p.title, p.body, p.categoryId, p.channelId, p.sound, p.interruption, p.data]);
}

/**
 * Cancels and schedules by stable id, only for ids it owns (`ping:`). Unchanged pings are not rescheduled; changed
 * ones are cancelled and scheduled again; removed ones are cancelled. Never cancel-all.
 */
export function diffSchedule(
  existing: ReadonlyArray<{ id: string } & Partial<ScheduledPing>>,
  desired: readonly ScheduledPing[],
): { cancel: string[]; schedule: ScheduledPing[] } {
  const owned = existing.filter((e) => e.id.startsWith('ping:'));
  const desiredById = new Map(desired.map((d) => [d.id, d]));
  const cancel: string[] = [];
  const schedule: ScheduledPing[] = [];
  for (const e of owned) {
    const d = desiredById.get(e.id);
    if (!d) cancel.push(e.id);
    else if (pingFingerprint(e) !== pingFingerprint(d)) cancel.push(e.id);
  }
  const existingById = new Map(owned.map((e) => [e.id, e]));
  for (const d of desired) {
    const e = existingById.get(d.id);
    if (!e || pingFingerprint(e) !== pingFingerprint(d)) schedule.push(d);
  }
  return { cancel, schedule };
}

/**
 * Learned timing: the last 3 acted events of the type. Lateness for pre_gym = startedAt − plannedStart; for
 * pre_dinner = the "Start cooking" tap − (dinner − cookTimePref). All 3 ≥ 20 min late → min(median, 30);
 * all 3 < 10 min late → 0; otherwise keep the current shift.
 */
export function learnTiming(p: {
  events: PingEventRow[];
  sessions: SessionPlan[];
  meals: PlannedMeal[];
  type: 'pre_gym' | 'pre_dinner';
  currentShiftMin: number;
  /** For pre_dinner lateness (default 20). */
  cookTimePref?: number;
}): { shiftMin: number; samples: number } {
  const lateness: number[] = [];
  const acted = p.events
    .filter((e) => e.type === p.type && e.actedAt)
    .sort((a, b) => msOf(b.scheduledFor) - msOf(a.scheduledFor));
  for (const e of acted) {
    const fireDate = e.pingId.split(':')[1];
    if (p.type === 'pre_gym') {
      const s = p.sessions.find((x) => x.date === fireDate && x.startedAt);
      if (!s?.startedAt) continue;
      lateness.push(minutesBetween(s.plannedStart, s.startedAt));
    } else {
      if (e.action !== 'cook') continue;
      const dinner = p.meals.find((m) => m.date === fireDate && m.slot === 'dinner');
      if (!dinner?.plannedAt || !e.actedAt) continue;
      lateness.push(minutesBetween(addMinutes(dinner.plannedAt, -(p.cookTimePref ?? 20)), e.actedAt));
    }
    if (lateness.length === 3) break;
  }
  if (lateness.length < 3) return { shiftMin: p.currentShiftMin, samples: lateness.length };
  if (lateness.every((l) => l >= 20)) {
    const sorted = [...lateness].sort((a, b) => a - b);
    return { shiftMin: Math.min(Math.round(sorted[1]!), 30), samples: 3 };
  }
  if (lateness.every((l) => l < 10)) return { shiftMin: 0, samples: 3 };
  return { shiftMin: p.currentShiftMin, samples: 3 };
}

/** Validated nightly AI copy replaces wording only (ids must match; numbers were checked upstream). */
export function overlayCopy(
  pings: readonly ScheduledPing[],
  overlay: ReadonlyArray<{ id: string; title: string; body: string }>,
): ScheduledPing[] {
  const byId = new Map(overlay.map((o) => [o.id, o]));
  return pings.map((p) => {
    const o = byId.get(p.id);
    return o ? { ...p, title: o.title, body: o.body } : p;
  });
}

/** The immediate after-gym ping (session finished or the gym zone left): standard wording, fires now. */
export function postGymNow(p: {
  session: SessionPlan;
  plan: WeekPlan;
  copy: CopyBank;
  lib: { recipes: RecipeIndex };
  weightKg: number;
  now: Instant;
  tz: string;
}): ScheduledPing {
  const date = localDateOf(p.now, p.tz);
  const pw = p.plan.meals.find((m) => m.date === p.session.date && m.slot === 'post_workout');
  const comeback = isComebackSession(p.session, p.plan.sessions);
  const variant: CopyVariant = comeback ? 'comeback' : 'standard';
  const vars = {
    protein: postWorkoutProteinMin(p.weightKg),
    meal: lowerFirst(mealName(pw, p.lib.recipes)),
    mealMin: pw?.recipeSlug ? p.lib.recipes.get(pw.recipeSlug)?.cookTimeMin : undefined,
  };
  const { template } = pickTemplate(p.copy, 'post_gym', 'gym', variant, date);
  const data: ScheduledPing['data'] = { fireDate: date, aboutDate: p.session.date, sessionId: p.session.id };
  if (pw) data.planItemId = pw.id;
  return {
    id: `ping:${date}:post_gym`,
    type: 'post_gym',
    fireAt: p.now,
    title: render(template.title, vars),
    body: render(template.body, vars),
    categoryId: 'post_gym',
    channelId: 'pings',
    sound: true,
    interruption: 'active',
    data,
  };
}
