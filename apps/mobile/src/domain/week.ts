// T2 Week: this week and next, one row per day — the workout (or rest) and the meals, with "moved" labels.
import type { BundleLib } from '@fitg/contracts';
import { localDateOf, type Instant, type LocalDate, type SessionStatus } from '@fitg/engine';
import type { Snapshot } from './backend';
import { dayLabel, weekdayLong, weekdayShort } from './format';
import { shortSessionName } from './reveal';
import { SLOT_LABEL } from './today';

export interface WeekDayRow {
  date: LocalDate;
  label: string;
  isToday: boolean;
  isPast: boolean;
  session?: { id: string; name: string; status: SessionStatus; movedFrom?: string };
  meals: string[];
}

export interface WeekSection {
  weekStart: LocalDate;
  title: string;
  days: WeekDayRow[];
}

export function weekView(snapshot: Snapshot, lib: BundleLib, now: Instant): WeekSection[] {
  const today = localDateOf(now, snapshot.profile.tz);
  return snapshot.weeks.map((w, i) => ({
    weekStart: w.weekStart,
    title: i === 0 ? 'This week' : 'Next week',
    days: w.days.map((d) => {
      const s = w.sessions.find((x) => x.date === d.date && x.status !== 'moved');
      const meals = w.meals
        .filter((m) => m.date === d.date)
        .map((m) => (m.recipeSlug ? (lib.recipes.get(m.recipeSlug)?.name ?? SLOT_LABEL[m.slot]) : SLOT_LABEL[m.slot]));
      const row: WeekDayRow = {
        date: d.date,
        label: `${weekdayShort(d.date)} · ${dayLabel(d.date).split(' ').slice(1).join(' ')}`,
        isToday: d.date === today,
        isPast: d.date < today,
        meals,
      };
      if (s) {
        row.session = {
          id: s.id,
          name: shortSessionName(s.name),
          status: s.status,
          ...(s.movedFromDate ? { movedFrom: weekdayLong(s.movedFromDate) } : {}),
        };
      }
      return row;
    }),
  }));
}
