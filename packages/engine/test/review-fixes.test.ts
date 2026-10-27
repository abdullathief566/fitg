// Regression tests for the independent engine review (one per confirmed finding, plus the likely ones fixed).
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  deterministicCandidates,
  localTimeOf,
  missedSessions,
  planWeek,
  prepTasks,
  shapesFor,
  toInstant,
  transition,
  weekDates,
  type EventRow,
  type PlanCommand,
  type PlanState,
} from '../src/mod.ts';
import { loadLib } from './helpers/lib.ts';
import { at, buildWeek, scheduleAt, stateAt, targetsFor } from './helpers/plan.ts';
import { T1_PROFILE, TZ, WEEK_START, t1MealProfile } from './helpers/t1.ts';

const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const FRI = '2026-11-06';
const SAT = '2026-11-07';
const SUN = '2026-11-08';

let n = 0;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const cmd = (body: DistributiveOmit<PlanCommand, 'id' | 'basePlanVersion'>, base = 1): PlanCommand =>
  ({ id: `fix-${++n}`, basePlanVersion: base, ...body }) as PlanCommand;
const ev = (type: EventRow['type'], when: string, payload: Record<string, unknown>): EventRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  type,
  at: when,
  deviceId: 'test',
  payload,
});

describe('#1 a replan never duplicates or overwrites a meal with actuals', () => {
  it('Tuesday lunch skipped, then new meal times → one Tuesday lunch, still skipped', () => {
    const week = buildWeek();
    const lunch = week.plan.meals.find((m) => m.date === TUE && m.slot === 'lunch')!;
    const s1 = applyCommand(week.state, cmd({ kind: 'SetMealStatus', itemId: lunch.id, status: 'skipped' }), {
      now: at(MON, '08:00'),
      tz: TZ,
    }).state;
    const r = applyCommand(
      s1,
      cmd({ kind: 'UpdatePrefs', patch: { mealTimes: { ...T1_PROFILE.mealTimes, dinner: '20:30' } } }, s1.plan.version),
      { now: at(MON, '08:00'), tz: TZ },
    );
    const lunches = r.state.plan.meals.filter((m) => m.date === TUE && m.slot === 'lunch');
    expect(lunches).toHaveLength(1);
    expect(lunches[0]!.status).toBe('skipped');
    const ids = r.state.plan.meals.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.changed.meals?.some((m) => m.id === lunch.id)).toBe(false);
  });
});

describe('#2 a session the reshuffle drops is reported as changed', () => {
  it("Mon/Tue/Wed/Fri available, skip Wednesday → B moves to Friday, Friday's A is dropped and reported", () => {
    const week = buildWeek({ availableDays: [0, 1, 2, 4] });
    const wed = week.plan.sessions.find((s) => s.date === WED)!;
    const fri = week.plan.sessions.find((s) => s.date === FRI)!;
    const r = applyCommand(week.state, cmd({ kind: 'SkipSession', sessionId: wed.id }), {
      now: at(WED, '18:16'),
      tz: TZ,
    });
    expect(r.state.plan.sessions.find((s) => s.id === wed.id)).toMatchObject({ date: FRI, status: 'planned' });
    expect(r.changed.sessions?.find((s) => s.id === fri.id)?.status).toBe('skipped');
    const planned = r.state.plan.sessions.filter((s) => s.status === 'planned').map((s) => s.date);
    expect(new Set(planned).size).toBe(planned.length);
  });
});

describe('#3 pings follow the live state (events), not just the plan rows', () => {
  const week = buildWeek();
  const session = week.plan.sessions.find((s) => s.date === MON)!;
  it('a session started at 18:05 → no "Gym in 15" and no fallback post-gym ping', () => {
    const events = [ev('session_started', at(MON, '18:05'), { sessionId: session.id, source: 'manual' })];
    const now = at(MON, '18:06');
    const pings = scheduleAt(week, now, { state: stateAt(week, now, events) });
    expect(pings.filter((p) => p.data.fireDate === MON && (p.type === 'pre_gym' || p.type === 'post_gym'))).toEqual([]);
  });
  it('breakfast tapped through an event → no ping asks about it', () => {
    const breakfast = week.plan.meals.find((m) => m.date === MON && m.slot === 'breakfast')!;
    const events = [ev('meal_status', at(MON, '08:10'), { itemId: breakfast.id, status: 'eaten', source: 'one_tap' })];
    const now = at(MON, '08:15');
    const pings = scheduleAt(week, now, { state: stateAt(week, now, events) });
    expect(pings.some((p) => p.data.askMealItemId === breakfast.id)).toBe(false);
  });
});

describe('#4 a big off-plan dinner still carries into tomorrow when nothing remains', () => {
  it('dinner replaced by a 1,500 kcal log at 21:30 → tomorrowDeltaKcal −200', () => {
    const week = buildWeek();
    const dinner = week.plan.meals.find((m) => m.date === MON && m.slot === 'dinner')!;
    const state: PlanState = {
      ...week.state,
      logs: new Map([['log-d', { kcal: 1500, proteinG: 40, carbsG: 150, fatG: 70 }]]),
    };
    const r = applyCommand(
      state,
      cmd({ kind: 'SetMealStatus', itemId: dinner.id, status: 'replaced', logId: 'log-d' }),
      {
        now: at(MON, '21:30'),
        tz: TZ,
      },
    );
    expect(r.state.plan.days.find((d) => d.date === MON)?.tomorrowDeltaKcal).toBe(-200);
  });
});

describe('#5 a merge holds after the ping it was merged into has fired', () => {
  it('P5 setup, rescheduled at 20:31 → no separate pre_dinner ping at 20:40', () => {
    const week = buildWeek({
      gymSchedule: [{ weekday: 0, start: '19:00', durationMin: 45 }],
      mealTimes: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:00' },
      cookTimePref: 10,
    });
    const morning = scheduleAt(week, at(MON, '08:00'));
    const now = at(MON, '20:31');
    const pings = scheduleAt(week, now, { state: stateAt(week, now, [], morning) });
    expect(pings.filter((p) => p.data.fireDate === MON).map((p) => p.type)).toEqual(['night_before']);
  });
});

describe('#6 "ready" times out after 3 hours', () => {
  // Q3 (2026-10-27): falling out of 'ready' without a Start returns the session to reminded, not abandoned, so it can
  // still be started that day, and midnight turns it into a skip that reshuffles the week.
  it('arrived at the gym 18:20, never tapped Start → back to reminded by 21:25; Today moves on', () => {
    const week = buildWeek();
    const morning = scheduleAt(week, at(MON, '08:00')); // has the 18:15 pre-gym ping
    const events = [ev('geofence_enter', at(MON, '18:20'), { placeId: 'gym', kind: 'gym' })];
    expect(stateAt(week, at(MON, '18:30'), events, morning).workout.status).toBe('ready');
    const later = stateAt(week, at(MON, '21:25'), events, morning);
    expect(later.workout.status).toBe('reminded');
    expect(later.nextStep.kind).not.toBe('workout');
  });

  it('drove past the gym (enter 18:20, exit 18:22) → reminded after the 5-min debounce, and Start still works', () => {
    const week = buildWeek();
    const passBy = [
      ev('geofence_enter', at(MON, '18:20'), { placeId: 'gym', kind: 'gym' }),
      ev('geofence_exit', at(MON, '18:22'), { placeId: 'gym', kind: 'gym' }),
    ];
    const morning = scheduleAt(week, at(MON, '08:00'));
    expect(stateAt(week, at(MON, '18:25'), passBy, morning).workout.status).toBe('ready');
    expect(stateAt(week, at(MON, '18:28'), passBy, morning).workout.status).toBe('reminded');
    const session = week.plan.sessions.find((x) => x.date === MON)!;
    const started = [...passBy, ev('session_started', at(MON, '18:40'), { sessionId: session.id, source: 'manual' })];
    expect(stateAt(week, at(MON, '18:45'), started, morning).workout.status).toBe('in_progress');
  });

  it('a drive-by before the pre-gym ping goes back to planned', () => {
    const ctx = {
      setsDone: 0,
      setsPlanned: 15,
      now: at(MON, '17:00'),
      plannedStart: at(MON, '18:30'),
      sleep: '23:00',
      tz: TZ,
    };
    expect(transition('ready', { type: 'geofence_exit_confirmed' }, ctx)).toBe('planned');
    expect(transition('ready', { type: 'timeout_3h' }, { ...ctx, reminded: true })).toBe('reminded');
    expect(transition('in_progress', { type: 'timeout_3h' }, ctx)).toBe('abandoned');
  });
});

describe('#7 a session moved onto today makes today a gym day', () => {
  it("Tue 08:00: move Wednesday's session to Tuesday → never the rest card on Tuesday", () => {
    const week = buildWeek();
    const wed = week.plan.sessions.find((s) => s.date === WED)!;
    const r = applyCommand(week.state, cmd({ kind: 'MoveSession', sessionId: wed.id, toDate: TUE }), {
      now: at(TUE, '08:00'),
      tz: TZ,
    });
    expect(r.state.plan.days.find((d) => d.date === TUE)?.isGymDay).toBe(true);
    expect(r.state.plan.days.find((d) => d.date === WED)?.isGymDay).toBe(false);
    const moved = { ...week, plan: r.state.plan };
    for (const t of ['19:40', '23:30']) expect(stateAt(moved, at(TUE, t)).nextStep.kind).not.toBe('rest');
  });
});

describe('#8 a prep task shows when it is due before the next meal, not all day', () => {
  it('rajma for Sunday dinner: Saturday morning shows meals; Saturday night shows "Soak the rajma tonight."', () => {
    const week = buildWeek();
    week.plan.meals = week.plan.meals.map((m) =>
      m.date === SUN && m.slot === 'dinner' ? { ...m, recipeSlug: 'rajma-rice-meal' } : m,
    );
    const tasks = prepTasks(week.plan.meals, loadLib().recipes, week.profile.notificationPrefs, TZ);
    week.plan.days = week.plan.days.map((d) => ({ ...d, prepTasks: tasks.filter((t) => t.forDate === d.date) }));
    for (const t of ['09:30', '10:00', '15:00']) expect(stateAt(week, at(SAT, t)).nextStep.kind).not.toBe('prep');
    const night = stateAt(week, at(SAT, '22:30')).nextStep;
    expect(night).toMatchObject({ kind: 'prep', title: 'Soak the rajma tonight.' });
  });
});

describe('#9 prep tasks that belong to the previous week are handed back', () => {
  it('rajma on Monday dinner → the Sunday-before task comes back in earlierPrepTasks', () => {
    const lib = loadLib();
    const profile = { ...T1_PROFILE, cookTimePref: 30 as const };
    const targets = targetsFor(profile);
    const dates = weekDates(WEEK_START);
    const shapes = shapesFor(dates, buildWeek({ cookTimePref: 30 }).plan.sessions, profile, TZ);
    const mp = t1MealProfile({ cookTimePref: 30 });
    const candidates = deterministicCandidates({
      dates,
      lib: lib.recipes,
      foods: lib.foods,
      profile: mp,
      shapes,
      seed: 1,
    });
    candidates[MON]!.dinner = ['rajma-rice-meal'];
    const r = planWeek({
      profile,
      targets,
      weekStart: WEEK_START,
      lib: { ...lib, templates: lib.templates },
      pantry: new Set(lib.staples),
      candidates,
      allowDrafts: true,
    });
    expect(r.usedAi).toBe(true);
    expect(r.earlierPrepTasks).toEqual([
      expect.objectContaining({
        forDate: '2026-11-01',
        recipeSlug: 'rajma-rice-meal',
        text: 'Soak the rajma tonight.',
      }),
    ]);
  });
});

describe('#10 time-zone conversion across clock changes', () => {
  it('New York spring forward: 02:30 (does not exist) → 03:30 EDT; 03:30 stays 03:30; 01:30 stays 01:30', () => {
    expect(toInstant('2026-03-08', '02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    expect(toInstant('2026-03-08', '03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    expect(toInstant('2026-03-08', '01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
  });
  it('New York fall back: 01:30 happens twice → the first one (EDT)', () => {
    expect(toInstant('2026-11-01', '01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });
  it('Berlin spring forward: 02:30 → 03:30 CEST; India never changes', () => {
    expect(toInstant('2026-03-29', '02:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
    expect(toInstant('2026-03-29', '01:30', 'Europe/Berlin')).toBe('2026-03-29T00:30:00.000Z');
    expect(toInstant('2026-11-02', '18:30', 'Asia/Kolkata')).toBe('2026-11-02T13:00:00.000Z');
  });
  it('a midnight that does not exist (Santiago, clocks jump at 00:00) moves forward, never to the day before', () => {
    // Find the September 2026 date whose local midnight is skipped in Santiago.
    for (let d = 1; d <= 30; d++) {
      const date = `2026-09-${String(d).padStart(2, '0')}`;
      const inst = toInstant(date, '00:00', 'America/Santiago');
      const back = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(inst));
      expect(back).toBe(date);
    }
  });
});

describe('likely issues fixed too', () => {
  it('missed sessions (before today, never started) are listed for the day-change SkipSession', () => {
    const week = buildWeek();
    expect(missedSessions(week.plan, TUE).map((s) => s.date)).toEqual([MON]);
    const mon = week.plan.sessions.find((s) => s.date === MON)!;
    const r = applyCommand(week.state, cmd({ kind: 'SkipSession', sessionId: mon.id }), {
      now: at(TUE, '07:00'),
      tz: TZ,
    });
    expect(r.reject).toBeUndefined();
    expect(r.state.plan.sessions.find((s) => s.id === mon.id)?.date).not.toBe(MON);
  });

  it('Home Food lunch/dinner get a protein add-on when the dishes fall short', () => {
    const week = buildWeek({ eatingMode: 'family' });
    const dinner = week.plan.meals.find((m) => m.date === TUE && m.slot === 'dinner')!;
    expect(dinner.kind).toBe('home_food');
    const r = applyCommand(
      week.state,
      cmd({ kind: 'SetHomeMeal', itemId: dinner.id, homeDishKeys: ['dal_tadka', 'roti', 'aloo_gobi'] }),
      {
        now: at(MON, '08:00'),
        tz: TZ,
      },
    );
    const picked = r.state.plan.meals.find((m) => m.id === dinner.id)!;
    expect(picked.addons.length).toBeGreaterThan(0);
  });

  it('skipping a future session keeps the A/B order (Mon evening, skip Friday → B stays Wed, A → Sat)', () => {
    const week = buildWeek();
    const fri = week.plan.sessions.find((s) => s.date === FRI)!;
    const r = applyCommand(week.state, cmd({ kind: 'SkipSession', sessionId: fri.id }), {
      now: at(MON, '20:00'),
      tz: TZ,
    });
    const byKey = r.state.plan.sessions.map((s) => [s.templateKey, s.date, s.status]);
    expect(byKey).toEqual([
      ['A', MON, 'planned'],
      ['B', WED, 'planned'],
      ['A', SAT, 'planned'],
    ]);
  });

  it('a reshuffle bumps the plan version; a command queued against a replaced row comes back stale', () => {
    const week = buildWeek();
    const wed = week.plan.sessions.find((s) => s.date === WED)!;
    const r = applyCommand(week.state, cmd({ kind: 'SkipSession', sessionId: wed.id }), {
      now: at(WED, '18:16'),
      tz: TZ,
    });
    expect(r.state.plan.version).toBe(2);
    for (const s of r.changed.sessions ?? []) expect(s.version).toBe(2);
    const replaced = r.changed.meals?.[0];
    expect(replaced).toBeDefined();
    const queued = applyCommand(r.state, cmd({ kind: 'SetMealStatus', itemId: replaced!.id, status: 'eaten' }, 1), {
      now: at(WED, '18:20'),
      tz: TZ,
    });
    expect(queued.reject).toBe('stale');
    expect(localTimeOf(r.state.plan.sessions.find((s) => s.id === wed.id)!.plannedStart, TZ)).toBe('18:30');
  });
});
