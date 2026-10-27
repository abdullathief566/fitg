// The plan reveal (O13, motion.md #1): targets, the next 7 days, tomorrow's meals, the first ping.
import type { BundleLib } from '@fitg/contracts';
import {
  addDays,
  localDateOf,
  msOf,
  pn,
  type Instant,
  type LocalDate,
  type PingType,
  type PlanNumber,
} from '@fitg/engine';
import type { Snapshot } from './backend';
import { timeLabel, weekdayShort, whenLabel } from './format';
import { engineViews, mealTitle, NO_PERMISSIONS } from './today';

export interface RevealDay {
  date: LocalDate;
  label: string;
  /** "Full A" — the session's short name, or undefined on a rest day. */
  session?: string;
  isToday: boolean;
}

export interface RevealView {
  firstName?: string;
  habitOnly: boolean;
  kcal: PlanNumber;
  protein: PlanNumber;
  /** Protein per kg of the weight the targets used, one decimal ("about 1.6 g/kg"). */
  proteinPerKg: PlanNumber;
  days: RevealDay[];
  /** Tomorrow's meals and workout, in order. Portions only (no numbers) in habit-only mode. */
  tomorrow: Array<{ time: string; title: string }>;
  firstPing?: { type: PingType; when: string; title: string; body: string };
}

/** "Full body A" → "Full A"; "Upper body" → "Upper". */
export function shortSessionName(name: string): string {
  return name.replace(/^Full body /, 'Full ').replace(/ body$/, '');
}

export function revealView(snapshot: Snapshot, lib: BundleLib, now: Instant): RevealView {
  const { profile, targets } = snapshot;
  const tz = profile.tz;
  const { plan, schedule } = engineViews(snapshot, lib, now, {
    permissions: NO_PERMISSIONS,
    seenComebackIds: [],
    doneTaskKeys: [],
  });
  const today = localDateOf(now, tz);
  const tomorrow = addDays(today, 1);
  const days: RevealDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const s = plan.sessions.find((x) => x.date === date && x.status !== 'moved' && x.status !== 'skipped');
    return {
      date,
      label: weekdayShort(date).toUpperCase(),
      ...(s ? { session: shortSessionName(s.name) } : {}),
      isToday: i === 0,
    };
  });
  const items = [
    ...plan.meals.filter((m) => m.date === tomorrow).map((m) => ({ at: m.plannedAt, title: mealTitle(m, lib) })),
    ...plan.sessions.filter((s) => s.date === tomorrow).map((s) => ({ at: s.plannedStart, title: s.name })),
  ].sort((a, b) => msOf(a.at) - msOf(b.at));
  const first = schedule
    .filter((p) => p.sound && msOf(p.fireAt) > msOf(now))
    .sort((a, b) => msOf(a.fireAt) - msOf(b.fireAt))[0];

  const view: RevealView = {
    habitOnly: targets.displayMode === 'habit_only',
    kcal: pn(targets.kcal),
    protein: pn(targets.proteinG),
    proteinPerKg: pn(Math.round((targets.proteinG / targets.basis.weightUsedKg) * 10) / 10),
    days,
    tomorrow: items.map((x) => ({ time: timeLabel(x.at, tz), title: x.title })),
  };
  if (profile.firstName) view.firstName = profile.firstName;
  if (first)
    view.firstPing = { type: first.type, when: whenLabel(first.fireAt, now, tz), title: first.title, body: first.body };
  return view;
}
