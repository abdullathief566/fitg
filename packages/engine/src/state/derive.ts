// UserState: a projection of the append-only events log over the plan (signals-and-pings.md §1).
// The same function runs on the device and on the server.
import type { Instant, LocalTime, MealStatus, SessionStatus } from '../types/enums.ts';
import type { EventRow } from '../types/events.ts';
import type { Nutrition } from '../types/nutrition.ts';
import type { Permissions, ScheduledPing, SessionEvent, UserState } from '../types/pings.ts';
import type { PlannedMeal, PlannedSet, SessionPlan, WeekPlan } from '../types/plan.ts';
import { consumedSoFar, remainingMeals } from '../meal/rebalance.ts';
import { sumNutrition } from '../nutrition/nutrition.ts';
import { addDays, addMinutes, localDateOf, msOf, toInstant } from '../util/time.ts';
import { mealWindow } from '../pings/windows.ts';
import { isTerminal, transition } from './transition.ts';
import { nextStep, type NextStepContext } from './next-step.ts';

export const GEOFENCE_EXIT_DEBOUNCE_MIN = 5;
export const SESSION_TIMEOUT_MIN = 180;

export interface DeriveContext extends NextStepContext {
  /** Off-plan log nutrition by log id (replaced meals). */
  logs?: ReadonlyMap<string, Nutrition>;
  /** For the "Later → moved" rule (default 23:00). */
  sleep?: LocalTime;
}

interface TimedEvent {
  at: number;
  event: SessionEvent;
  endStatus?: 'finished' | 'partial' | 'abandoned';
  /** set_done: `${exerciseOrder}:${setIndex}` so a set counts once. */
  setKey?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function sessionTimeline(
  session: SessionPlan,
  events: readonly EventRow[],
  schedule: readonly ScheduledPing[],
  now: Instant,
  tz: string,
): { timeline: TimedEvent[]; gymRegion: EventRow[] } {
  const nowMs = msOf(now);
  const timeline: TimedEvent[] = [];
  const gymRegion: EventRow[] = [];
  for (const e of events) {
    const at = msOf(e.at);
    if (at > nowMs) continue;
    const p = e.payload;
    switch (e.type) {
      case 'session_started':
        if (p.sessionId === session.id) {
          const src = str(p.source);
          timeline.push({
            at,
            event: { type: 'start', source: src === 'geofence' || src === 'ping_action' ? src : 'manual' },
          });
        }
        break;
      case 'set_done':
        if (p.sessionId === session.id) {
          timeline.push({
            at,
            event: { type: 'set_done' },
            setKey: `${String(p.exerciseOrder)}:${String(p.setIndex)}`,
          });
        }
        break;
      case 'session_ended':
        if (p.sessionId === session.id) {
          const st = str(p.status);
          timeline.push({
            at,
            event: { type: 'finish' },
            ...(st === 'finished' || st === 'partial' || st === 'abandoned' ? { endStatus: st } : {}),
          });
        }
        break;
      case 'ping_action': {
        const pingId = str(p.pingId) ?? '';
        if (p.type !== 'pre_gym' || !pingId.startsWith(`ping:${session.date}:`)) break;
        const action = str(p.action);
        if (action === 'start') timeline.push({ at, event: { type: 'start', source: 'ping_action' } });
        else if (action === 'skip') timeline.push({ at, event: { type: 'skip' } });
        else if (action === 'later_30') timeline.push({ at, event: { type: 'later', laterCount: 0 } });
        break;
      }
      case 'geofence_enter':
      case 'geofence_exit':
        if (p.kind === 'gym') gymRegion.push(e);
        break;
      default:
        break;
    }
  }
  // Derived: the pre-gym ping's time has passed.
  const pre = schedule.find((s) => s.type === 'pre_gym' && s.data.sessionId === session.id);
  if (pre && msOf(pre.fireAt) <= nowMs) timeline.push({ at: msOf(pre.fireAt), event: { type: 'pre_gym_time_passed' } });
  // Geofence: enter is a hint; exit only counts after a 5-minute debounce with no re-entry.
  const sortedRegion = [...gymRegion].sort((x, y) => msOf(x.at) - msOf(y.at));
  sortedRegion.forEach((e, i) => {
    if (e.type === 'geofence_enter') {
      timeline.push({ at: msOf(e.at), event: { type: 'geofence_enter' } });
      return;
    }
    const confirmAt = msOf(addMinutes(e.at, GEOFENCE_EXIT_DEBOUNCE_MIN));
    const reentered = sortedRegion.slice(i + 1).some((x) => x.type === 'geofence_enter' && msOf(x.at) <= confirmAt);
    if (!reentered && confirmAt <= nowMs) timeline.push({ at: confirmAt, event: { type: 'geofence_exit_confirmed' } });
  });
  // Midnight with no start → skipped (for a session on an earlier date).
  const midnight = msOf(toInstant(addDays(session.date, 1), '00:00', tz));
  if (midnight <= nowMs) timeline.push({ at: midnight, event: { type: 'midnight' } });
  timeline.sort((x, y) => x.at - y.at);
  return { timeline, gymRegion: sortedRegion };
}

function replaySession(
  session: SessionPlan,
  sets: readonly PlannedSet[],
  events: readonly EventRow[],
  schedule: readonly ScheduledPing[],
  now: Instant,
  tz: string,
  sleep: LocalTime,
): UserState['workout'] {
  const mine = sets.filter((s) => s.sessionId === session.id);
  const skipped = new Set(
    events
      .filter((e) => e.type === 'set_skipped')
      .map((e) => str(e.payload.setId))
      .filter((x): x is string => !!x),
  );
  const setsPlanned = mine.filter((s) => s.status !== 'skipped' && !skipped.has(s.id)).length;
  const doneKeys = new Set(mine.filter((s) => s.status === 'done').map((s) => `${s.exerciseOrder}:${s.setIndex}`));

  let status: SessionStatus = isTerminal(session.status) ? session.status : 'planned';
  let startedAt = session.startedAt;
  let endedAt = session.endedAt;
  let startSource = session.startSource;
  let laterCount = 0;
  let reminded = false;
  const nowMs = msOf(now);

  if (!isTerminal(session.status)) {
    const { timeline } = sessionTimeline(session, events, schedule, now, tz);
    // When 'ready' began (geofence arrival): ready also times out after 3 h (signals-and-pings.md §2).
    let readyAt: Instant | undefined;
    const timeoutAt = (): number | null => {
      const since = status === 'in_progress' ? startedAt : status === 'ready' ? readyAt : undefined;
      return since ? msOf(since) + SESSION_TIMEOUT_MIN * 60_000 : null;
    };
    const applyTimeout = (atMs: number): void => {
      const due = timeoutAt();
      if (due === null || due > atMs) return;
      const wasActive = status === 'in_progress';
      status = transition(status, { type: 'timeout_3h' }, ctxOf(doneKeys.size, new Date(due).toISOString()));
      if (wasActive && startedAt) endedAt = addMinutes(startedAt, SESSION_TIMEOUT_MIN);
    };
    // Replay; timeouts are checked between events.
    for (const t of timeline) {
      applyTimeout(t.at);
      const atIso = new Date(t.at).toISOString();
      const before = status;
      if (t.event.type === 'set_done' && t.setKey) doneKeys.add(t.setKey);
      if (t.event.type === 'pre_gym_time_passed') reminded = true;
      if (t.event.type === 'later') {
        laterCount++;
        status = transition(status, { type: 'later', laterCount }, ctxOf(doneKeys.size, atIso));
      } else if (t.event.type === 'finish' && t.endStatus && status === 'in_progress') {
        status = t.endStatus;
      } else {
        status = transition(status, t.event, ctxOf(doneKeys.size, atIso));
      }
      if (before !== 'in_progress' && status === 'in_progress') {
        startedAt = atIso;
        if (t.event.type === 'start') startSource = t.event.source;
      }
      if (before !== 'ready' && status === 'ready') readyAt = atIso;
      if (before === 'in_progress' && status !== 'in_progress') endedAt = atIso;
    }
    applyTimeout(nowMs);
  }

  function ctxOf(done: number, at: Instant = now) {
    return {
      setsDone: done,
      setsPlanned,
      now: at,
      plannedStart: session.plannedStart,
      sleep,
      tz,
      reminded,
      ...(startedAt ? { startedAt } : {}),
    };
  }

  const ordered = [...mine].sort((x, y) => x.exerciseOrder - y.exerciseOrder || x.setIndex - y.setIndex);
  const nextSet = ordered.find(
    (s) => !doneKeys.has(`${s.exerciseOrder}:${s.setIndex}`) && s.status !== 'skipped' && !skipped.has(s.id),
  );
  const workout: UserState['workout'] = {
    status,
    exerciseIdx: nextSet ? nextSet.exerciseOrder : (ordered[ordered.length - 1]?.exerciseOrder ?? 0) + 1,
    setIdx: nextSet ? nextSet.setIndex : 0,
    setsDone: doneKeys.size,
    setsPlanned,
    laterCount,
  };
  if (startedAt) workout.startedAt = startedAt;
  if (endedAt) workout.endedAt = endedAt;
  if (startSource) workout.startSource = startSource;
  return workout;
}

/** Latest meal_status event per meal overrides the plan row's status. */
function mealStatuses(meals: readonly PlannedMeal[], events: readonly EventRow[], now: Instant): PlannedMeal[] {
  const nowMs = msOf(now);
  const latest = new Map<string, { at: number; status: MealStatus; logId?: string }>();
  for (const e of events) {
    if (e.type !== 'meal_status' || msOf(e.at) > nowMs) continue;
    const itemId = str(e.payload.itemId);
    const status = str(e.payload.status) as MealStatus | undefined;
    if (!itemId || !status) continue;
    const prev = latest.get(itemId);
    if (!prev || msOf(e.at) >= prev.at) {
      const logId = str(e.payload.logId);
      latest.set(itemId, { at: msOf(e.at), status, ...(logId ? { logId } : {}) });
    }
  }
  return meals.map((m) => {
    const l = latest.get(m.id);
    if (!l) return m;
    const out: PlannedMeal = { ...m, status: l.status, statusAt: new Date(l.at).toISOString() };
    if (l.logId) out.replacedByLogId = l.logId;
    return out;
  });
}

export function deriveUserState(p: {
  plan: WeekPlan;
  sets: PlannedSet[];
  events: EventRow[];
  schedule: ScheduledPing[];
  permissions: Permissions;
  now: Instant;
  tz: string;
  ctx?: DeriveContext;
}): UserState {
  const ctx = p.ctx ?? {};
  const today = localDateOf(p.now, p.tz);
  const nowMs = msOf(p.now);
  const day = p.plan.days.find((d) => d.date === today);
  const session = p.plan.sessions.find((s) => s.date === today && s.status !== 'moved');
  const workout: UserState['workout'] = session
    ? replaySession(session, p.sets, p.events, p.schedule, p.now, p.tz, ctx.sleep ?? '23:00')
    : { status: 'planned', exerciseIdx: 0, setIdx: 0, setsDone: 0, setsPlanned: 0, laterCount: 0 };

  // Location.
  const region = p.events
    .filter((e) => (e.type === 'geofence_enter' || e.type === 'geofence_exit') && msOf(e.at) <= nowMs)
    .sort((a, b) => msOf(a.at) - msOf(b.at));
  const lastRegion = region[region.length - 1];
  const lastGym = [...region].reverse().find((e) => e.payload.kind === 'gym');
  const location: UserState['location'] = { permission: p.permissions.location };
  if (lastGym) location.inGymZone = lastGym.type === 'geofence_enter';
  if (lastRegion) {
    location.lastRegionEvent = {
      kind: lastRegion.payload.kind === 'home' ? 'home' : 'gym',
      type: lastRegion.type === 'geofence_enter' ? 'enter' : 'exit',
      at: lastRegion.at,
    };
  }

  // Meals.
  const todayMeals = mealStatuses(
    p.plan.meals.filter((m) => m.date === today),
    p.events,
    p.now,
  );
  const consumed = consumedSoFar(todayMeals, ctx.logs ?? new Map(), p.now);
  const remaining = sumNutrition(remainingMeals(todayMeals, p.now).map((m) => m.nutrition));

  // Pings.
  const fired = p.schedule.filter((s) => s.data.fireDate === today && s.sound && msOf(s.fireAt) <= nowMs);
  const askedByFired = new Set(
    p.schedule.filter((s) => msOf(s.fireAt) <= nowMs && s.data.askMealItemId).map((s) => s.data.askMealItemId!),
  );
  const lastAction = p.events
    .filter((e) => e.type === 'ping_action' && msOf(e.at) <= nowMs)
    .sort((a, b) => msOf(b.at) - msOf(a.at))[0];
  const unanswered = todayMeals
    .filter((m) => m.status === 'planned' && m.plannedAt && !askedByFired.has(m.id))
    .filter(
      (m) =>
        msOf(
          mealWindow(m, todayMeals, ctx.cookTimePref ?? 20, m.slot === 'post_workout' ? workout.endedAt : undefined)
            .closes,
        ) <= nowMs,
    )
    .sort((a, b) => msOf(a.plannedAt) - msOf(b.plannedAt))[0];
  const pings: UserState['pings'] = { soundsToday: fired.length };
  if (lastAction) {
    const t = str(lastAction.payload.type);
    const action = str(lastAction.payload.action);
    if (
      t === 'night_before' ||
      t === 'pre_gym' ||
      t === 'post_gym' ||
      t === 'pre_dinner' ||
      t === 'trial_reminder' ||
      t === 'checkin'
    ) {
      pings.last = { type: t, at: lastAction.at, ...(action ? { action } : {}) };
    }
  }
  if (unanswered) pings.unansweredMealItemId = unanswered.id;

  // A day with a session on it is a gym day, whatever the stored flag says (a session can be moved onto today).
  const dayInfo: UserState['day'] = { date: today, isGymDay: !!session || (day?.isGymDay ?? false) };
  if (session) dayInfo.sessionId = session.id;

  const state: UserState = {
    asOf: p.now,
    tz: p.tz,
    day: dayInfo,
    workout,
    location,
    meals: todayMeals.map((m) => ({ itemId: m.id, slot: m.slot, plannedAt: m.plannedAt, status: m.status })),
    consumed,
    remaining,
    pings,
    nextStep: { kind: 'rest', title: '', actions: [] },
  };
  const planForCard: WeekPlan = {
    ...p.plan,
    meals: p.plan.meals.map((m) => todayMeals.find((t) => t.id === m.id) ?? m),
  };
  state.nextStep = nextStep(state, planForCard, p.now, ctx);
  return state;
}
