// Dates and times (engines.md §0): Intl.DateTimeFormat with timeZone only — no date library.
// Instant = ISO UTC string; LocalDate = 'YYYY-MM-DD'; LocalTime = 'HH:MM'; Weekday 0 = Monday.
import type { Instant, LocalDate, LocalTime, Weekday } from '../types/enums.ts';

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `tz` from UTC at the given UTC instant, in ms (IST → +19 800 000). */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function msOf(instant: Instant): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${instant}`);
  return ms;
}

export function instantOf(ms: number): Instant {
  return new Date(ms).toISOString();
}

export function parseLocalDate(date: LocalDate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isLocalDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseLocalDate(s);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

export function isLocalTime(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Minutes since local midnight for 'HH:MM'. */
export function minutesOf(time: LocalTime): number {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Invalid local time: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 'HH:MM' for minutes since midnight (wraps around the day). */
export function timeOfMinutes(min: number): LocalTime {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

export function addMinutesToTime(time: LocalTime, min: number): LocalTime {
  return timeOfMinutes(minutesOf(time) + min);
}

function utcMsOfDate(date: LocalDate): number {
  const { y, m, d } = parseLocalDate(date);
  return Date.UTC(y, m - 1, d);
}

function dateOfUtcMs(ms: number): LocalDate {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  return dateOfUtcMs(utcMsOfDate(date) + n * DAY_MS);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utcMsOfDate(b) - utcMsOfDate(a)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: LocalDate): Weekday {
  return ((new Date(utcMsOfDate(date)).getUTCDay() + 6) % 7) as Weekday;
}

/** The Monday of the week containing `date`. */
export function weekStartOf(date: LocalDate): LocalDate {
  return addDays(date, -weekdayOf(date));
}

export function isWeekend(date: LocalDate): boolean {
  return weekdayOf(date) >= 5;
}

/** The 7 dates Monday … Sunday starting at `weekStart`. */
export function weekDates(weekStart: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function localDateOf(instant: Instant, tz: string): LocalDate {
  const p = zonedParts(msOf(instant), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function localTimeOf(instant: Instant, tz: string): LocalTime {
  const p = zonedParts(msOf(instant), tz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Minutes since local midnight of an instant in `tz`. */
export function localMinutesOf(instant: Instant, tz: string): number {
  const p = zonedParts(msOf(instant), tz);
  return p.hour * 60 + p.minute;
}

/** The instant of a local wall-clock time. In a DST gap the time is pushed forward; in an overlap the first one wins. */
export function toInstant(date: LocalDate, time: LocalTime, tz: string): Instant {
  const { y, m, d } = parseLocalDate(date);
  const min = minutesOf(time);
  const guess = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  const off1 = tzOffsetMs(guess, tz);
  let ts = guess - off1;
  const off2 = tzOffsetMs(ts, tz);
  if (off2 !== off1) ts = guess - off2;
  return instantOf(ts);
}

/** Local date + minutes since that date's midnight (may exceed 1440 or be negative). */
export function toInstantMinutes(date: LocalDate, minutes: number, tz: string): Instant {
  const dayShift = Math.floor(minutes / 1440);
  return toInstant(addDays(date, dayShift), timeOfMinutes(minutes - dayShift * 1440), tz);
}

export function addMinutes(instant: Instant, min: number): Instant {
  return instantOf(msOf(instant) + min * MIN_MS);
}

/** b − a in minutes. */
export function minutesBetween(a: Instant, b: Instant): number {
  return (msOf(b) - msOf(a)) / MIN_MS;
}

export function isBefore(a: Instant, b: Instant): boolean {
  return msOf(a) < msOf(b);
}

/** '18:30' → '6:30 PM'; '19:00' → '7 PM'. */
export function to12h(time: LocalTime): string {
  const min = minutesOf(time);
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${pad2(mm)} ${suffix}`;
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function weekdayName(date: LocalDate): string {
  return WEEKDAY_NAMES[weekdayOf(date)];
}

/** Is a local time inside quiet hours `sleep → wake` (the window may cross midnight)? */
export function inQuietHours(minutes: number, sleep: LocalTime, wake: LocalTime): boolean {
  const s = minutesOf(sleep);
  const w = minutesOf(wake);
  const t = ((minutes % 1440) + 1440) % 1440;
  if (s === w) return false;
  return s > w ? t >= s || t < w : t >= s && t < w;
}
