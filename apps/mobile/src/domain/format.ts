// Display formatting for dates and times. Pure; no Intl locale dependence (plain English everywhere in v1).
import {
  addDays,
  localDateOf,
  localTimeOf,
  parseLocalDate,
  to12h,
  weekdayOf,
  type Instant,
  type LocalDate,
} from '@fitg/engine';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function weekdayShort(date: LocalDate): string {
  return WEEKDAY_SHORT[weekdayOf(date)]!;
}

export function weekdayLong(date: LocalDate): string {
  return WEEKDAY_LONG[weekdayOf(date)]!;
}

/** "Tue 27 Oct" */
export function dayLabel(date: LocalDate): string {
  const { m, d } = parseLocalDate(date);
  return `${weekdayShort(date)} ${d} ${MONTH_SHORT[m - 1]}`;
}

/** "6:30 PM" in the user's zone. */
export function timeLabel(at: Instant, tz: string): string {
  return to12h(localTimeOf(at, tz));
}

/** "6:15 PM today" · "9:30 PM tonight" · "6:15 PM tomorrow" · "Fri 6:15 PM". */
export function whenLabel(at: Instant, now: Instant, tz: string): string {
  const day = localDateOf(at, tz);
  const today = localDateOf(now, tz);
  const time = timeLabel(at, tz);
  if (day === today) return Number(localTimeOf(at, tz).slice(0, 2)) >= 18 ? `${time} tonight` : `${time} today`;
  if (day === addDays(today, 1)) return `${time} tomorrow`;
  return `${weekdayShort(day)} ${time}`;
}

/** "Morning" / "Afternoon" / "Evening" by local hour; plain "Hi" in the small hours. */
export function partOfDay(now: Instant, tz: string): 'Morning' | 'Afternoon' | 'Evening' | 'Hi' {
  const h = Number(localTimeOf(now, tz).slice(0, 2));
  if (h < 4) return 'Hi';
  if (h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  return 'Evening';
}
