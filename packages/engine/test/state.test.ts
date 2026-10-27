import { describe, expect, it } from 'vitest';
import { addMinutes, applyCommand, transition, type EventRow, type TransitionContext } from '../src/mod.ts';
import { at, buildWeek, scheduleAt, stateAt } from './helpers/plan.ts';
import { TZ } from './helpers/t1.ts';

const MON = '2026-11-02';
const TUE = '2026-11-03';

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  setsDone: 0,
  setsPlanned: 15,
  now: at(MON, '18:00'),
  plannedStart: at(MON, '18:30'),
  sleep: '23:00',
  tz: TZ,
  ...over,
});

describe('transition — S1', () => {
  it('planned → reminded → in_progress → (geofence exit, 3 of 15 sets) partial', () => {
    let s = transition('planned', { type: 'pre_gym_time_passed' }, ctx());
    expect(s).toBe('reminded');
    s = transition(s, { type: 'start', source: 'ping_action' }, ctx());
    expect(s).toBe('in_progress');
    s = transition(s, { type: 'geofence_exit_confirmed' }, ctx({ setsDone: 3 }));
    expect(s).toBe('partial');
  });
  it('timeout_3h with 0 sets → abandoned; skip → skipped; finishing every set → finished', () => {
    expect(transition('in_progress', { type: 'timeout_3h' }, ctx())).toBe('abandoned');
    expect(transition('reminded', { type: 'skip' }, ctx())).toBe('skipped');
    expect(transition('in_progress', { type: 'set_done' }, ctx({ setsDone: 15 }))).toBe('finished');
    expect(transition('in_progress', { type: 'finish' }, ctx({ setsDone: 9 }))).toBe('partial');
  });
  it('geofence enter is a hint: ready only within −2 h…+3 h of the planned start, never in_progress', () => {
    expect(transition('reminded', { type: 'geofence_enter' }, ctx({ now: at(MON, '18:20') }))).toBe('ready');
    expect(transition('planned', { type: 'geofence_enter' }, ctx({ now: at(MON, '13:00') }))).toBe('planned');
  });
  it('later twice past bedtime → moved; midnight with no start → skipped', () => {
    expect(transition('reminded', { type: 'later', laterCount: 2 }, ctx({ plannedStart: at(MON, '22:45') }))).toBe(
      'moved',
    );
    expect(transition('reminded', { type: 'later', laterCount: 1 }, ctx({ plannedStart: at(MON, '22:45') }))).toBe(
      'reminded',
    );
    expect(transition('planned', { type: 'midnight' }, ctx())).toBe('skipped');
  });
});

describe('deriveUserState — events → state', () => {
  const week = buildWeek();
  const session = week.plan.sessions.find((s) => s.date === MON)!;
  const schedule = scheduleAt(week, at(MON, '08:00'));
  let n = 0;
  const ev = (type: EventRow['type'], time: string, payload: Record<string, unknown>): EventRow => ({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    type,
    at: at(MON, time),
    deviceId: 'test-device',
    payload,
  });
  const started = ev('session_started', '18:35', { sessionId: session.id, source: 'ping_action' });
  const sets = week.plan.sets.filter((s) => s.sessionId === session.id);
  const done3 = sets.slice(0, 3).map((s, i) =>
    ev('set_done', `18:4${i}`, {
      sessionId: session.id,
      exerciseOrder: s.exerciseOrder,
      setIndex: s.setIndex,
      weightKg: s.targetWeightKg,
      reps: 8,
      via: 'app',
    }),
  );

  it('S1 via events: pre-gym time passes → reminded; start → in_progress; exit (5-min debounce) with 3 sets → partial', () => {
    expect(stateAt(week, at(MON, '18:20'), [], schedule).workout.status).toBe('reminded');
    expect(stateAt(week, at(MON, '18:50'), [started, ...done3], schedule).workout).toMatchObject({
      status: 'in_progress',
      setsDone: 3,
    });
    const exit = ev('geofence_exit', '19:00', { placeId: 'gym-1', kind: 'gym' });
    expect(stateAt(week, at(MON, '19:03'), [started, ...done3, exit], schedule).workout.status).toBe('in_progress');
    expect(stateAt(week, at(MON, '19:06'), [started, ...done3, exit], schedule).workout.status).toBe('partial');
  });

  it('exit then re-enter within 5 min → still in_progress', () => {
    const exit = ev('geofence_exit', '19:00', { placeId: 'gym-1', kind: 'gym' });
    const back = ev('geofence_enter', '19:03', { placeId: 'gym-1', kind: 'gym' });
    const s = stateAt(week, at(MON, '19:20'), [started, ...done3, exit, back], schedule);
    expect(s.workout.status).toBe('in_progress');
    expect(s.location.inGymZone).toBe(true);
  });

  it('timeout_3h with 0 sets → abandoned', () => {
    expect(stateAt(week, at(MON, '21:40'), [started], schedule).workout.status).toBe('abandoned');
  });

  it('skip from the ping → skipped, and SkipSession reshuffles the week', () => {
    const skip = ev('ping_action', '18:16', { pingId: `ping:${MON}:pre_gym`, type: 'pre_gym', action: 'skip' });
    expect(stateAt(week, at(MON, '18:20'), [skip], schedule).workout.status).toBe('skipped');
    const r = applyCommand(
      week.state,
      { kind: 'SkipSession', id: 'c1', basePlanVersion: 1, sessionId: session.id },
      { now: at(MON, '18:16'), tz: TZ },
    );
    expect(r.reject).toBeUndefined();
    expect(r.changed.sessions?.find((s) => s.id === session.id)).toMatchObject({
      date: '2026-11-03',
      status: 'planned',
      movedFromDate: MON,
    });
    expect(r.note).toMatch(/^Moved Full body A to Tuesday/);
  });

  it('meal taps, consumption and the one-ask rule', () => {
    const breakfast = week.plan.meals.find((m) => m.date === MON && m.slot === 'breakfast')!;
    const s = stateAt(week, at(MON, '09:30'));
    expect(s.pings.unansweredMealItemId).toBe(breakfast.id);
    expect(s.consumed.kcal).toBeCloseTo(breakfast.nutrition.kcal, 5);
    const tapped = stateAt(week, at(MON, '09:30'), [
      ev('meal_status', '08:10', { itemId: breakfast.id, status: 'eaten', source: 'one_tap' }),
    ]);
    expect(tapped.pings.unansweredMealItemId).toBeUndefined();
    expect(tapped.meals.find((m) => m.itemId === breakfast.id)?.status).toBe('eaten');
  });
});

describe("nextStep — exactly one card for every hour of T1's gym day and rest day", () => {
  const week = buildWeek();
  for (const date of [MON, TUE]) {
    it(`${date}: one card each hour, never "Rest day" on a gym day`, () => {
      const schedule = scheduleAt(week, at(date, '00:01'));
      for (let h = 0; h < 24; h++) {
        for (const m of ['00', '30']) {
          const now = at(date, `${String(h).padStart(2, '0')}:${m}`);
          const s = stateAt(week, now, [], schedule);
          expect(s.nextStep.title.length, `${date} ${h}:${m}`).toBeGreaterThan(0);
          expect(s.nextStep.actions.length).toBeGreaterThanOrEqual(1);
          expect(s.nextStep.actions.length).toBeLessThanOrEqual(3);
          if (date === MON) expect(s.nextStep.kind).not.toBe('rest');
        }
      }
    });
  }

  it('the day in cards: breakfast → lunch → snack → workout → post-workout meal → dinner → tomorrow', () => {
    const schedule = scheduleAt(week, at(MON, '00:01'));
    const kinds = ['07:00', '12:30', '16:30', '18:00', '19:35', '20:50', '22:30'].map((t) => {
      const st = stateAt(week, at(MON, t), [], schedule).nextStep;
      return `${st.kind}:${st.title.split(':')[0]}`;
    });
    expect(kinds).toEqual([
      'meal:Breakfast',
      'meal:Lunch',
      'meal:Snack',
      'workout:Full body A',
      'meal:After gym',
      'meal:Dinner',
      'tomorrow:Tomorrow',
    ]);
  });

  it('after a finished session the post-workout meal is next, until dinner cook-start', () => {
    const session = week.plan.sessions.find((s) => s.date === MON)!;
    const events: EventRow[] = [
      {
        id: 'a',
        type: 'session_started',
        at: at(MON, '18:35'),
        deviceId: 'd',
        payload: { sessionId: session.id, source: 'manual' },
      },
      {
        id: 'b',
        type: 'session_ended',
        at: at(MON, '19:30'),
        deviceId: 'd',
        payload: { sessionId: session.id, status: 'finished', reason: 'finish' },
      },
    ];
    expect(stateAt(week, at(MON, '19:40'), events).nextStep.title).toMatch(/^After gym/);
    expect(stateAt(week, at(MON, '20:50'), events).nextStep.title).toMatch(/^Dinner/);
  });

  it('a rest day ends on the rest card with tomorrow as the subtitle', () => {
    const s = stateAt(week, at(TUE, '23:30'));
    expect(s.nextStep.kind).toBe('rest');
    expect(s.nextStep.title).toBe('Rest day. Nothing to do but eat well.');
    expect(s.nextStep.subtitle).toMatch(/^Tomorrow: /);
    expect(addMinutes(at(TUE, '23:30'), 0)).toBeTruthy();
  });
});
