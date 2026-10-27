import { describe, expect, it } from 'vitest';
import {
  containsBannedWords,
  COPY_BANK,
  diffSchedule,
  learnTiming,
  localTimeOf,
  NOTIFICATION_CATEGORIES,
  PING_TYPES,
  prepTasks,
  type CopyTemplate,
  type PingEventRow,
  type ScheduledPing,
  type SessionPlan,
} from '../src/mod.ts';
import { loadLib } from './helpers/lib.ts';
import { at, buildWeek, scheduleAt } from './helpers/plan.ts';
import { TZ } from './helpers/t1.ts';

const MON = '2026-11-02';
const TUE = '2026-11-03';
const sounding = (pings: ScheduledPing[], date: string) => pings.filter((p) => p.sound && p.data.fireDate === date);
const times = (pings: ScheduledPing[]) => pings.map((p) => localTimeOf(p.fireAt, TZ));

describe('buildPingSchedule — P1/P2 (T1, now = Monday 08:00)', () => {
  const week = buildWeek();
  const pings = scheduleAt(week, at(MON, '08:00'));

  it('P1 gym day: exactly 4 sounding pings at 18:15 · 20:15 · 20:45 · 21:30', () => {
    const mon = sounding(pings, MON);
    expect(mon.map((p) => p.type)).toEqual(['pre_gym', 'post_gym', 'pre_dinner', 'night_before']);
    expect(times(mon)).toEqual(['18:15', '20:15', '20:45', '21:30']);
    const pre = mon[0]!;
    expect(pre.interruption).toBe('timeSensitive');
    expect(pre.channelId).toBe('pings_high');
    expect(mon[1]!.categoryId.startsWith('post_gym_fallback')).toBe(true);
  });

  it('P2 rest day: exactly 2 — pre_dinner 20:45, night_before 21:30', () => {
    const tue = sounding(pings, TUE);
    expect(tue.map((p) => p.type)).toEqual(['pre_dinner', 'night_before']);
    expect(times(tue)).toEqual(['20:45', '21:30']);
  });

  it('ids are ping:<fireDate>:<type>; the night-before ping about Tuesday fires Monday', () => {
    const nb = pings.find((p) => p.type === 'night_before' && p.data.fireDate === MON)!;
    expect(nb.id).toBe(`ping:${MON}:night_before`);
    expect(nb.data.aboutDate).toBe(TUE);
    for (const p of pings) expect(p.id).toBe(`ping:${p.data.fireDate}:${p.type}`);
  });

  it('never more than 4 sounding pings per local day; every ping has a category with 1–3 actions', () => {
    const byDay = new Map<string, number>();
    for (const p of pings) byDay.set(p.data.fireDate, (byDay.get(p.data.fireDate) ?? 0) + (p.sound ? 1 : 0));
    for (const n of byDay.values()) expect(n).toBeLessThanOrEqual(4);
    for (const p of pings) {
      const actions = NOTIFICATION_CATEGORIES[p.categoryId];
      expect(actions, p.categoryId).toBeDefined();
      expect(actions!.length).toBeGreaterThanOrEqual(1);
      expect(actions!.length).toBeLessThanOrEqual(3);
    }
  });

  it('copy: numbers filled by code, no leftover placeholders, no banned words', () => {
    const pre = pings.find((p) => p.type === 'pre_gym' && p.data.fireDate === MON)!;
    expect(pre.title).toMatch(/^Gym in 15\. Full body A\.$|Full body A/);
    for (const p of pings) {
      expect(`${p.title} ${p.body}`).not.toMatch(/\{\w+\}/);
      expect(containsBannedWords(`${p.title} ${p.body}`)).toEqual([]);
    }
  });

  it('a ping asks once about an untapped meal whose window has closed ("Did breakfast happen?")', () => {
    const pre = pings.find((p) => p.type === 'pre_gym' && p.data.fireDate === MON)!;
    expect(pre.data.askMealItemId).toBe(week.plan.meals.find((m) => m.date === MON && m.slot === 'breakfast')!.id);
    expect(pre.categoryId).toBe('pre_gym_ask');
    expect(pre.body.toLowerCase()).toContain('did breakfast happen?');
    // The ask is added to the normal wording, so the useful part stays.
    expect(pre.body).toMatch(/Leg press 3×8 at 45 kg/);
    const asked = pings.map((p) => p.data.askMealItemId).filter(Boolean);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('tapping the meals removes the asks', () => {
    const tapped = buildWeek();
    tapped.plan.meals = tapped.plan.meals.map((m) => (m.date === MON ? { ...m, status: 'eaten' as const } : m));
    const p2 = scheduleAt(tapped, at(MON, '08:00'));
    expect(sounding(p2, MON).every((p) => !p.data.askMealItemId)).toBe(true);
    expect(sounding(p2, MON)[0]!.categoryId).toBe('pre_gym');
  });
});

describe('P3 — learnTiming', () => {
  const sessions = (lateness: number[]): { events: PingEventRow[]; sessions: SessionPlan[] } => {
    const dates = ['2026-11-02', '2026-11-04', '2026-11-06'];
    return {
      events: dates.map((d, i) => ({
        id: `e${i}`,
        pingId: `ping:${d}:pre_gym`,
        type: 'pre_gym' as const,
        scheduledFor: at(d, '18:15'),
        actedAt: at(d, '18:20'),
        action: 'start',
      })),
      sessions: dates.map((d, i) => ({
        id: `s${i}`,
        date: d,
        templateKey: 'A' as const,
        name: 'Full body A',
        plannedStart: at(d, '18:30'),
        plannedDurationMin: 60 as const,
        status: 'finished' as const,
        startedAt: new Date(Date.parse(at(d, '18:30')) + lateness[i]! * 60_000).toISOString(),
        importance: 3,
        version: 1,
      })),
    };
  };
  it('three starts 25 / 30 / 22 min late → shift 25', () => {
    expect(learnTiming({ ...sessions([25, 30, 22]), meals: [], type: 'pre_gym', currentShiftMin: 0 })).toEqual({
      shiftMin: 25,
      samples: 3,
    });
  });
  it('then three on-time starts → 0', () => {
    expect(learnTiming({ ...sessions([2, 0, 5]), meals: [], type: 'pre_gym', currentShiftMin: 25 }).shiftMin).toBe(0);
  });
  it('mixed lateness keeps the current value; the shift is capped at 30', () => {
    expect(learnTiming({ ...sessions([25, 3, 40]), meals: [], type: 'pre_gym', currentShiftMin: 25 }).shiftMin).toBe(
      25,
    );
    expect(learnTiming({ ...sessions([45, 50, 60]), meals: [], type: 'pre_gym', currentShiftMin: 0 }).shiftMin).toBe(
      30,
    );
  });
  it('a learned shift moves the ping and the next one says so once', () => {
    const week = buildWeek({ learnedTiming: { preGymShiftMin: 25, dinnerShiftMin: 0 } });
    const pings = scheduleAt(week, at(MON, '08:00'), { announceShift: { pre_gym: true } });
    const pre = pings.filter((p) => p.type === 'pre_gym');
    expect(localTimeOf(pre[0]!.fireAt, TZ)).toBe('18:40');
    const lateTexts = pre.filter((p) => p.body.includes('7:40 PM') || p.body.includes('6:40 PM'));
    expect(lateTexts.length).toBeLessThanOrEqual(1);
  });
});

describe('prep tasks ride on the night-before ping', () => {
  it('rajma for Sunday dinner → "Soak the rajma tonight." in Saturday\'s night-before ping', () => {
    const SAT = '2026-11-07';
    const SUN = '2026-11-08';
    const week = buildWeek();
    week.plan.meals = week.plan.meals.map((m) =>
      m.date === SUN && m.slot === 'dinner' ? { ...m, recipeSlug: 'rajma-rice-meal' } : m,
    );
    const tasks = prepTasks(week.plan.meals, loadLib().recipes, week.profile.notificationPrefs, TZ);
    week.plan.days = week.plan.days.map((d) => ({ ...d, prepTasks: tasks.filter((t) => t.forDate === d.date) }));
    const nb = scheduleAt(week, at(SAT, '08:00')).find((p) => p.type === 'night_before' && p.data.fireDate === SAT)!;
    expect(nb.data.aboutDate).toBe(SUN);
    expect(nb.body).toContain('Soak the rajma tonight.');
  });
});

describe('P4 — quiet hours', () => {
  it('dinner 23:40, cook 20 → pre_dinner would be 23:10 (inside quiet hours, dinner passes before wake) → dropped', () => {
    const week = buildWeek({ mealTimes: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '23:40' } });
    const pings = scheduleAt(week, at(MON, '08:00'));
    expect(pings.filter((p) => p.type === 'pre_dinner')).toEqual([]);
    expect(pings.length).toBeLessThanOrEqual(20);
  });
});

describe('P5 — the 20-minute merge', () => {
  it('session 19:00/45 (fallback 20:30), dinner 21:00, cook 10 (pre_dinner 20:40) → merged into post_gym; 3 pings', () => {
    const week = buildWeek({
      gymSchedule: [{ weekday: 0, start: '19:00', durationMin: 45 }],
      mealTimes: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:00' },
      cookTimePref: 10,
    });
    const mon = sounding(scheduleAt(week, at(MON, '08:00')), MON);
    expect(mon.map((p) => p.type)).toEqual(['pre_gym', 'post_gym', 'night_before']);
    expect(times(mon)).toEqual(['18:45', '20:30', '21:30']);
    const post = mon[1]!;
    expect(post.body).toMatch(/Dinner: |Cooking: |Tonight: /);
  });
  it('exactly 20 minutes apart does NOT merge', () => {
    const week = buildWeek({
      gymSchedule: [{ weekday: 0, start: '19:00', durationMin: 45 }],
      mealTimes: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:10' },
      cookTimePref: 10,
    });
    const mon = sounding(scheduleAt(week, at(MON, '08:00')), MON);
    expect(times(mon)).toEqual(['18:45', '20:30', '20:50', '21:30']);
  });
});

describe('diffSchedule', () => {
  const week = buildWeek();
  const a = scheduleAt(week, at(MON, '08:00'));
  it('unchanged pings are not rescheduled; removed ones are cancelled by id; only ping: ids are touched', () => {
    const existing = [...a, { id: 'trial:2026-11-07' }];
    const desired = a.slice(1);
    const d = diffSchedule(existing, desired);
    expect(d.schedule).toEqual([]);
    expect(d.cancel).toEqual([a[0]!.id]);
    expect(d.cancel).not.toContain('trial:2026-11-07');
  });
  it('a changed ping is cancelled and scheduled again', () => {
    const changed = a.map((p, i) => (i === 0 ? { ...p, body: `${p.body} (moved)` } : p));
    const d = diffSchedule(a, changed);
    expect(d.cancel).toEqual([a[0]!.id]);
    expect(d.schedule.map((p) => p.id)).toEqual([a[0]!.id]);
  });
  it('a new ping is scheduled', () => {
    const d = diffSchedule(a.slice(1), a);
    expect(d.schedule.map((p) => p.id)).toEqual([a[0]!.id]);
    expect(d.cancel).toEqual([]);
  });
});

describe('copy bank (copy.md §3)', () => {
  const four = ['night_before', 'pre_gym', 'post_gym', 'pre_dinner'] as const;
  it('≥ 5 standard wordings per ping type and day kind; ≥ 2 for every other variant', () => {
    for (const type of four) {
      for (const [, variants] of Object.entries(COPY_BANK[type])) {
        expect(variants!.standard!.length).toBeGreaterThanOrEqual(5);
        for (const [v, list] of Object.entries(variants!))
          if (v !== 'standard') expect(list!.length).toBeGreaterThanOrEqual(2);
      }
    }
    for (const t of PING_TYPES) expect(COPY_BANK[t]).toBeDefined();
  });
  it('every string passes the banned-words test; short lines ≤ 60 chars before filling', () => {
    const all: CopyTemplate[] = Object.values(COPY_BANK).flatMap((byDay) =>
      Object.values(byDay).flatMap((variants) => Object.values(variants ?? {}).flat() as CopyTemplate[]),
    );
    expect(all.length).toBeGreaterThan(50);
    for (const t of all) {
      for (const s of [t.title, t.body, t.short]) expect(containsBannedWords(s), s).toEqual([]);
      expect(t.short.length).toBeLessThanOrEqual(60);
    }
  });
});
