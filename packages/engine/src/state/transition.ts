// The gym-day state machine (signals-and-pings.md §2). Invalid transitions leave the status unchanged.
import type { Instant, LocalDate, LocalTime, SessionStatus } from '../types/enums.ts';
import type { SessionEvent } from '../types/pings.ts';
import { addMinutes, daysBetween, localDateOf, localMinutesOf, minutesBetween, minutesOf } from '../util/time.ts';

export const GEOFENCE_EARLY_MIN = 120;
export const GEOFENCE_LATE_MIN = 180;
export const LATER_STEP_MIN = 30;

export interface TransitionContext {
  setsDone: number;
  setsPlanned: number;
  now: Instant;
  startedAt?: Instant;
  plannedStart: Instant;
  sleep: LocalTime;
  tz: string;
  /** The pre-gym ping's time has passed (a session that falls out of 'ready' goes back to 'reminded', not 'planned'). */
  reminded?: boolean;
}

/**
 * Would a session starting at `start` begin at or after bedtime on its day? Bedtimes after midnight count as the
 * next day (`wake` decides; without it, a bedtime before 05:00 is taken to be after midnight).
 */
export function isAtOrPastBedtime(
  start: Instant,
  day: LocalDate,
  sleep: LocalTime,
  tz: string,
  wake?: LocalTime,
): boolean {
  const s = minutesOf(sleep);
  const afterMidnight = wake !== undefined ? s < minutesOf(wake) : s < 300;
  const sleepAbs = afterMidnight ? s + 1440 : s;
  const startAbs = localMinutesOf(start, tz) + 1440 * daysBetween(day, localDateOf(start, tz));
  return startAbs >= sleepAbs;
}

function pastSleep(start: Instant, plannedStart: Instant, sleep: LocalTime, tz: string): boolean {
  return isAtOrPastBedtime(start, localDateOf(plannedStart, tz), sleep, tz);
}

export function transition(s: SessionStatus, e: SessionEvent, ctx: TransitionContext): SessionStatus {
  switch (e.type) {
    case 'pre_gym_time_passed':
      return s === 'planned' ? 'reminded' : s;
    case 'geofence_enter': {
      if (s !== 'planned' && s !== 'reminded') return s;
      const delta = minutesBetween(ctx.plannedStart, ctx.now);
      return delta >= -GEOFENCE_EARLY_MIN && delta <= GEOFENCE_LATE_MIN ? 'ready' : s;
    }
    case 'start':
      return s === 'planned' || s === 'reminded' || s === 'ready' ? 'in_progress' : s;
    case 'set_done':
      return s === 'in_progress' && ctx.setsPlanned > 0 && ctx.setsDone >= ctx.setsPlanned ? 'finished' : s;
    case 'finish':
      if (s !== 'in_progress') return s;
      return ctx.setsPlanned > 0 && ctx.setsDone >= ctx.setsPlanned ? 'finished' : 'partial';
    case 'geofence_exit_confirmed':
    case 'timeout_3h':
      if (s === 'in_progress') return ctx.setsDone >= 1 ? 'partial' : 'abandoned';
      // Arrived but never tapped Start (drove past, or the gym is next door): the workout isn't written off.
      if (s === 'ready') return ctx.reminded ? 'reminded' : 'planned';
      return s;
    case 'skip':
    case 'midnight':
      return s === 'planned' || s === 'reminded' || s === 'ready' ? 'skipped' : s;
    case 'later': {
      if (s !== 'planned' && s !== 'reminded') return s;
      const newStart = addMinutes(ctx.plannedStart, LATER_STEP_MIN);
      return e.laterCount >= 2 && pastSleep(newStart, ctx.plannedStart, ctx.sleep, ctx.tz) ? 'moved' : s;
    }
  }
}

export function isTerminal(s: SessionStatus): boolean {
  return s === 'finished' || s === 'partial' || s === 'abandoned' || s === 'skipped' || s === 'moved';
}
