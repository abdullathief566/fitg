// Missed-session reshuffle (engines.md §2.3, exact) and PR detection.
import type { LocalDate, Weekday } from '../types/enums.ts';
import type { GymSlot } from '../types/profile.ts';
import type { PlannedSet, SessionPlan } from '../types/plan.ts';
import type { PR, ProgressState } from '../types/workout.ts';
import { addDays, daysBetween, localTimeOf, weekdayName, weekdayOf, weekStartOf, toInstant } from '../util/time.ts';

export interface ReshuffleResult {
  week: SessionPlan[];
  dropped?: SessionPlan;
  note: string;
}

/**
 * 1. remaining = [missed] + every planned session dated after today, in original order.
 * 2. candidates = days in availableDays from today+1 through the week's Sunday.
 * 3. Greedy: each session goes on the earliest candidate ≥ 2 days after the previously placed one (the first compares
 *    against lastCompletedDay); if none, the earliest ≥ 1 day after; never two sessions on one day.
 * 4. If any can't be placed, drop the lowest-importance session in remaining (tie → the later one) and retry.
 * 5. The same rows are updated: moved → new date, movedFromDate = old date, status planned, time of day kept if the
 *    new weekday is in gymSchedule (else the missed session's time). A dropped session becomes skipped.
 * 7. The note is one sentence, built by code.
 */
export function reshuffle(p: {
  week: SessionPlan[];
  missedSessionId: string;
  today: LocalDate;
  availableDays: Weekday[];
  gymSchedule: GymSlot[];
  lastCompletedDay?: LocalDate;
  tz: string;
}): ReshuffleResult {
  const missed = p.week.find((s) => s.id === p.missedSessionId);
  if (!missed) return { week: p.week, note: '' };

  const byDate = (a: SessionPlan, b: SessionPlan): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const later = p.week.filter((s) => s.id !== missed.id && s.status === 'planned' && s.date > p.today).sort(byDate);
  // A session skipped IN ADVANCE (dated after today) keeps its place in the A/B order, and its own day is off the
  // table — otherwise "skip Friday" on a Monday would pull Friday's session ahead of Wednesday's.
  const skippedAhead = missed.date > p.today;
  const remaining = skippedAhead ? [...later, missed].sort(byDate) : [missed, ...later];

  const sunday = addDays(weekStartOf(p.today), 6);
  const candidates: LocalDate[] = [];
  for (let d = addDays(p.today, 1); d <= sunday; d = addDays(d, 1)) {
    if (skippedAhead && d === missed.date) continue;
    if (p.availableDays.includes(weekdayOf(d))) candidates.push(d);
  }

  const list = [...remaining];
  const dropped: SessionPlan[] = [];
  let placement = new Map<string, LocalDate>();
  for (;;) {
    placement = new Map();
    const used = new Set<LocalDate>();
    let prev = p.lastCompletedDay;
    let ok = true;
    for (const s of list) {
      const gapOk = (d: LocalDate, gap: number): boolean => !used.has(d) && (!prev || daysBetween(prev, d) >= gap);
      const day = candidates.find((d) => gapOk(d, 2)) ?? candidates.find((d) => gapOk(d, 1));
      if (!day) {
        ok = false;
        break;
      }
      placement.set(s.id, day);
      used.add(day);
      prev = day;
    }
    if (ok) break;
    // Drop the lowest-importance session (tie → the later one) and retry.
    let idx = 0;
    for (let i = 1; i < list.length; i++) {
      if ((list[i]?.importance ?? 0) <= (list[idx]?.importance ?? 0)) idx = i;
    }
    const [gone] = list.splice(idx, 1);
    if (gone) dropped.push(gone);
    if (list.length === 0) {
      placement = new Map();
      break;
    }
  }

  const scheduleDays = new Set(p.gymSchedule.map((g) => g.weekday));
  const missedTime = localTimeOf(missed.plannedStart, p.tz);
  const moved: Array<{ s: SessionPlan; to: LocalDate }> = [];
  const week = p.week.map((s) => {
    if (dropped.some((d) => d.id === s.id)) return { ...s, status: 'skipped' as const };
    const to = placement.get(s.id);
    if (!to) return s;
    if (to === s.date && s.id !== missed.id) return s;
    const time = scheduleDays.has(weekdayOf(to)) ? localTimeOf(s.plannedStart, p.tz) : missedTime;
    const updated: SessionPlan = {
      ...s,
      date: to,
      movedFromDate: to === s.date ? s.movedFromDate : s.date,
      plannedStart: toInstant(to, time, p.tz),
      status: 'planned',
    };
    if (to !== s.date) moved.push({ s: updated, to });
    return updated;
  });

  let note = '';
  const firstDrop = dropped[0];
  if (firstDrop) {
    note = `Dropped ${weekdayName(firstDrop.date)}'s ${firstDrop.name} — next week picks up from there.`;
    if (moved.length > 0) note = `${movedSentence(moved).slice(0, -1)}. ${note}`;
  } else if (moved.length > 0) {
    note = movedSentence(moved);
  }
  return firstDrop ? { week, dropped: { ...firstDrop, status: 'skipped' }, note } : { week, note };
}

function movedSentence(moved: Array<{ s: SessionPlan; to: LocalDate }>): string {
  const parts = moved.map((m) => `${m.s.name} to ${weekdayName(m.to)}`);
  if (parts.length === 1) return `Moved ${parts[0]}.`;
  return `Moved ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}

/**
 * Heavier weight at ≥ repMin, or more reps at the same weight (one PR per exercise, weight first).
 * An exercise without a recorded PR yet gets none: its first session is the baseline.
 */
export function detectPRs(sets: PlannedSet[], progress: ProgressState): PR[] {
  const best = new Map<string, PR>();
  for (const s of sets) {
    if (s.status !== 'done' || s.actualReps === undefined) continue;
    const prog = progress[s.exerciseId];
    if (!prog || prog.prWeightKg === undefined) continue;
    const w = s.actualWeightKg ?? s.targetWeightKg;
    let pr: PR | undefined;
    if (w > prog.prWeightKg && s.actualReps >= s.targetRepsMin) {
      pr = { exerciseId: s.exerciseId, kind: 'weight', weightKg: w, reps: s.actualReps };
    } else if (w === prog.prWeightKg && s.actualReps > (prog.prReps ?? 0)) {
      pr = { exerciseId: s.exerciseId, kind: 'reps', weightKg: w, reps: s.actualReps };
    }
    if (!pr) continue;
    const cur = best.get(s.exerciseId);
    const better =
      !cur ||
      (pr.kind === 'weight' && cur.kind === 'reps') ||
      (pr.kind === cur.kind && (pr.weightKg > cur.weightKg || (pr.weightKg === cur.weightKg && pr.reps > cur.reps)));
    if (better) best.set(s.exerciseId, pr);
  }
  return [...best.values()];
}
