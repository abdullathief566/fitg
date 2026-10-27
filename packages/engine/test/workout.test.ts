import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyFeedback,
  buildSession,
  calibrate,
  detectPRs,
  progress,
  reshuffle,
  scheduleWeek,
  selectTemplate,
  startingWeight,
  stepsFor,
  substitutes,
  toInstant,
  type ExerciseRow,
  type SessionPlan,
  type WeightSteps,
} from '../src/mod.ts';
import { loadLib } from './helpers/lib.ts';
import { T1_PROFILE, TZ, WEEK_START } from './helpers/t1.ts';

const lib = loadLib();
const ex = (id: string): ExerciseRow => {
  const e = lib.exercises.byId.get(id);
  if (!e) throw new Error(id);
  return e;
};
const template = (id: string) => {
  const t = lib.templates.get(id);
  if (!t) throw new Error(id);
  return t;
};
const linear25: WeightSteps = { kind: 'linear', step: 2.5, min: 20 };

describe('progress — W1–W3 (double progression)', () => {
  it('W1: bench 30 kg, 8–12, reps 12/12/12 → 32.5, up', () => {
    expect(
      progress({ weightKg: 30, actualReps: [12, 12, 12], repMin: 8, repMax: 12 }, { missStreak: 0 }, linear25),
    ).toEqual({ nextWeightKg: 32.5, missStreak: 0, message: 'up' });
  });
  it('W2: reps 12/11/10 → 30, hold', () => {
    expect(
      progress({ weightKg: 30, actualReps: [12, 11, 10], repMin: 8, repMax: 12 }, { missStreak: 0 }, linear25),
    ).toEqual({ nextWeightKg: 30, missStreak: 0, message: 'hold' });
  });
  it('W3: 7/8/8 → hold 30 (miss 1); then 8/7/6 → 27.5, down (30 × 0.9 = 27 → snap 27.5), miss 0', () => {
    const a = progress({ weightKg: 30, actualReps: [7, 8, 8], repMin: 8, repMax: 12 }, { missStreak: 0 }, linear25);
    expect(a).toEqual({ nextWeightKg: 30, missStreak: 1, message: 'hold' });
    const b = progress(
      { weightKg: a.nextWeightKg, actualReps: [8, 7, 6], repMin: 8, repMax: 12 },
      { missStreak: a.missStreak },
      linear25,
    );
    expect(b).toEqual({ nextWeightKg: 27.5, missStreak: 0, message: 'down' });
  });
  it('bodyweight: weight stays 0; reps carry the progression', () => {
    expect(
      progress({ weightKg: 0, actualReps: [15, 15], repMin: 6, repMax: 15 }, { missStreak: 0 }, { kind: 'none' }),
    ).toEqual({
      nextWeightKg: 0,
      missStreak: 0,
      message: 'up',
    });
  });
});

describe('selectTemplate', () => {
  it.each([
    [{ gymDays: 3, equipment: 'full', experience: 'gt6m' }, 'full_ab_gym'],
    [{ gymDays: 2, equipment: 'basic', experience: 'lt6m' }, 'full_ab_machine'],
    [{ gymDays: 3, equipment: 'full', experience: 'new' }, 'full_ab_machine'],
    [{ gymDays: 4, equipment: 'home_db', experience: 'gt6m' }, 'upper_lower_home_db'],
    [{ gymDays: 4, equipment: 'home_db', experience: 'new' }, 'upper_lower_home_db'],
  ] as const)('%o → %s', (input, id) => {
    expect(selectTemplate(input).templateId).toBe(id);
  });
});

describe('scheduleWeek', () => {
  const t = template('full_ab_machine');
  it('T1: Mon A · Wed B · Fri A at 18:30 local', () => {
    const week = scheduleWeek({ template: t, gymSchedule: T1_PROFILE.gymSchedule, weekStart: WEEK_START, tz: TZ });
    expect(week.map((s) => [s.date, s.templateKey, s.name])).toEqual([
      ['2026-11-02', 'A', 'Full body A'],
      ['2026-11-04', 'B', 'Full body B'],
      ['2026-11-06', 'A', 'Full body A'],
    ]);
    expect(week[0]!.plannedStart).toBe('2026-11-02T13:00:00.000Z');
    expect(week[0]!.plannedDurationMin).toBe(60);
  });
  it('keys alternate from the key after lastCompletedKey; never two sessions a day', () => {
    const week = scheduleWeek({
      template: t,
      gymSchedule: [
        { weekday: 1, start: '07:00', durationMin: 45 },
        { weekday: 1, start: '19:00', durationMin: 45 },
        { weekday: 3, start: '07:00', durationMin: 45 },
      ],
      weekStart: WEEK_START,
      tz: TZ,
      lastCompletedKey: 'A',
    });
    expect(week.map((s) => [s.date, s.templateKey])).toEqual([
      ['2026-11-03', 'B'],
      ['2026-11-05', 'A'],
    ]);
  });
});

describe('buildSession', () => {
  const base = {
    lib: lib.exercises,
    variant: 'machine' as const,
    equipment: 'full' as const,
    injuries: [] as string[],
    progress: {},
    bodyweightKg: 75,
    sex: 'male' as const,
    experience: 'new' as const,
  };
  const sessionA = template('full_ab_machine').sessions[0]!;
  const exercisesOf = (sets: Array<{ exerciseId: string; exerciseOrder: number }>) => [
    ...new Map(sets.map((s) => [s.exerciseOrder, s.exerciseId])).values(),
  ];

  it('duration fit: 45 → 4 exercises, 60 → 5, 75 → 6 (lowest-importance slots dropped first)', () => {
    expect(exercisesOf(buildSession({ ...base, session: sessionA, durationMin: 45 }).sets)).toHaveLength(4);
    expect(exercisesOf(buildSession({ ...base, session: sessionA, durationMin: 60 }).sets)).toHaveLength(5);
    expect(exercisesOf(buildSession({ ...base, session: sessionA, durationMin: 75 }).sets)).toHaveLength(6);
    // 45 min keeps the importance-3 slots and the importance-2 hinge; drops both importance-1 slots (core, biceps).
    expect(exercisesOf(buildSession({ ...base, session: sessionA, durationMin: 45 }).sets)).toEqual([
      'leg_press_machine',
      'chest_press_machine',
      'seated_cable_row',
      'romanian_deadlift_db',
    ]);
  });

  it('home_db never gets a barbell, machine or cable exercise', () => {
    for (const s of template('upper_lower_home_db').sessions.concat(template('full_ab_home_db').sessions)) {
      const { sets } = buildSession({ ...base, variant: 'home_db', equipment: 'home_db', session: s, durationMin: 75 });
      for (const set of sets) {
        const e = ex(set.exerciseId);
        expect(['barbell', 'machine', 'cable']).not.toContain(e.loadType);
        expect(e.equipment.every((t) => t === 'dumbbell')).toBe(true);
      }
    }
  });

  it('aiPicks are used only when valid', () => {
    const valid = buildSession({
      ...base,
      session: sessionA,
      durationMin: 60,
      aiPicks: { 'A:0:squat': 'goblet_squat_db' },
    });
    expect(valid.sets[0]!.exerciseId).toBe('goblet_squat_db');
    const notPreferred = buildSession({
      ...base,
      session: sessionA,
      durationMin: 60,
      aiPicks: { 'A:0:squat': 'bench_press_barbell' },
    });
    expect(notPreferred.sets[0]!.exerciseId).toBe('leg_press_machine');
  });

  it('sets/rest from the slot; reps from the slot except bodyweight exercises', () => {
    const { sets } = buildSession({ ...base, session: sessionA, durationMin: 75 });
    const legPress = sets.filter((s) => s.exerciseId === 'leg_press_machine');
    expect(legPress).toHaveLength(3);
    expect(legPress[0]).toMatchObject({ targetRepsMin: 8, targetRepsMax: 12, targetReps: 8, restSec: 120 });
    // Bodyweight exercise (dead bug, slot 10–15, exercise 8–12) uses its own range.
    const deadBug = sets.find((s) => s.exerciseId === 'dead_bug')!;
    expect(deadBug).toMatchObject({ targetRepsMin: 8, targetRepsMax: 12, targetWeightKg: 0 });
  });

  it('targetReps: repMin for a new weight; otherwise min(repMax, min(lastReps) + 1)', () => {
    const { sets } = buildSession({
      ...base,
      session: sessionA,
      durationMin: 60,
      progress: {
        leg_press_machine: {
          currentWeightKg: 45,
          missStreak: 0,
          hitTopLast: false,
          lastReps: [10, 9, 9],
          calibrated: true,
        },
      },
    });
    expect(sets[0]).toMatchObject({ exerciseId: 'leg_press_machine', targetWeightKg: 45, targetReps: 10 });
  });

  it('W6: knee injury, full_ab_machine session A → the squat slot is dropped with a note; no knee-tagged exercise', () => {
    const { sets, notes } = buildSession({ ...base, session: sessionA, durationMin: 60, injuries: ['knee'] });
    expect(notes).toEqual(['Skipped squats today because of your knee.']);
    for (const s of sets) expect(ex(s.exerciseId).injuryTags).not.toContain('knee');
    expect(sets.some((s) => ex(s.exerciseId).movementPattern === 'squat')).toBe(false);
    // The freed place goes to the next most important slot: still 5 exercises at 60 min.
    expect(new Set(sets.map((s) => s.exerciseOrder)).size).toBe(5);
  });
});

describe('startingWeight, calibrate, applyFeedback', () => {
  const p = { bodyweightKg: 75, sex: 'male' as const, experience: 'new' as const };
  it('barbell for new = 20', () => {
    const bench = ex('bench_press_barbell');
    expect(startingWeight(bench, { ...p, steps: stepsFor(bench) })).toBe(20);
  });
  it('dumbbells snap to the ladder and never go below the minimum step', () => {
    const goblet = ex('goblet_squat_db'); // 0.15 × 75 = 11.25 → 12.5? nearest ladder value: 10 (1.25) vs 12.5 (1.25) → tie goes up
    expect(startingWeight(goblet, { ...p, steps: stepsFor(goblet) })).toBe(12.5);
    const curl = ex('db_curl'); // 0.06 × 75 × 0.6 = 2.7 → 2.5
    expect(startingWeight(curl, { ...p, sex: 'female', steps: stepsFor(curl) })).toBe(2.5);
    const tiny = { ...curl, startLoadRatio: 0.001 };
    expect(startingWeight(tiny, { ...p, steps: stepsFor(tiny) })).toBe(2.5);
  });
  it('calibrate: 20 kg barbell too_easy → 25; 10 kg dumbbell too_heavy → 7.5', () => {
    expect(calibrate(20, 'too_easy', stepsFor(ex('bench_press_barbell')))).toBe(25);
    expect(calibrate(10, 'too_heavy', stepsFor(ex('goblet_squat_db')))).toBe(7.5);
    expect(calibrate(20, 'right', stepsFor(ex('bench_press_barbell')))).toBe(20);
    expect(calibrate(20, 'too_heavy', stepsFor(ex('bench_press_barbell')))).toBe(20); // never below the bar
  });
  it('applyFeedback: ±1 step', () => {
    expect(applyFeedback(30, 'too_easy', linear25)).toBe(32.5);
    expect(applyFeedback(30, 'too_hard', linear25)).toBe(27.5);
    expect(applyFeedback(10, 'too_easy', stepsFor(ex('goblet_squat_db')))).toBe(12.5);
  });
});

describe('substitutes', () => {
  it('same pattern + muscle first; only available, non-injury-tagged; machines first for new', () => {
    const subs = substitutes({
      exerciseId: 'barbell_back_squat',
      lib: lib.exercises,
      equipment: 'full',
      experience: 'new',
      injuries: [],
    });
    expect(subs.map((s) => s.id)).toEqual(['leg_press_machine', 'goblet_squat_db', 'bodyweight_squat']);
    const basic = substitutes({
      exerciseId: 'bench_press_barbell',
      lib: lib.exercises,
      equipment: 'basic',
      experience: 'gt6m',
      injuries: [],
    });
    expect(basic.every((s) => !s.equipment.includes('barbell'))).toBe(true);
    expect(
      substitutes({
        exerciseId: 'leg_press_machine',
        lib: lib.exercises,
        equipment: 'full',
        experience: 'new',
        injuries: ['knee'],
      }),
    ).toEqual([]);
  });
});

describe('reshuffle — W4, W5', () => {
  const t = template('full_ab_machine');
  const week = (): SessionPlan[] =>
    scheduleWeek({ template: t, gymSchedule: T1_PROFILE.gymSchedule, weekStart: WEEK_START, tz: TZ });

  it('W4: Mon A done, Wed B missed (today Wed), Fri A planned, all days → B → Thu, A → Sat, nothing dropped', () => {
    const w = week();
    w[0] = { ...w[0]!, status: 'finished' };
    w[1] = { ...w[1]!, status: 'skipped' };
    const r = reshuffle({
      week: w,
      missedSessionId: w[1]!.id,
      today: '2026-11-04',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      gymSchedule: T1_PROFILE.gymSchedule,
      lastCompletedDay: '2026-11-02',
      tz: TZ,
    });
    expect(r.dropped).toBeUndefined();
    expect(r.week.map((s) => [s.templateKey, s.date, s.status])).toEqual([
      ['A', '2026-11-02', 'finished'],
      ['B', '2026-11-05', 'planned'],
      ['A', '2026-11-07', 'planned'],
    ]);
    expect(r.week[1]!.movedFromDate).toBe('2026-11-04');
    expect(r.week[1]!.plannedStart).toBe(toInstant('2026-11-05', '18:30', TZ));
    expect(r.note).toBe('Moved Full body B to Thursday and Full body A to Saturday.');
  });

  it('W5: Mon A, Wed B done; Fri A missed (today Fri), Mon–Fri only → A dropped; next week starts with A', () => {
    const w = week().map((s, i) =>
      i < 2 ? { ...s, status: 'finished' as const } : { ...s, status: 'skipped' as const },
    );
    const r = reshuffle({
      week: w,
      missedSessionId: w[2]!.id,
      today: '2026-11-06',
      availableDays: [0, 1, 2, 3, 4],
      gymSchedule: T1_PROFILE.gymSchedule,
      lastCompletedDay: '2026-11-04',
      tz: TZ,
    });
    expect(r.dropped?.templateKey).toBe('A');
    expect(r.week[2]!.status).toBe('skipped');
    expect(r.note).toBe("Dropped Friday's Full body A — next week picks up from there.");
    const next = scheduleWeek({
      template: t,
      gymSchedule: T1_PROFILE.gymSchedule,
      weekStart: addDays(WEEK_START, 7),
      tz: TZ,
      lastCompletedKey: 'B',
    });
    expect(next[0]!.templateKey).toBe('A');
  });

  it('never stacks two sessions on one day', () => {
    const w = week();
    const r = reshuffle({
      week: w,
      missedSessionId: w[0]!.id,
      today: '2026-11-02',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      gymSchedule: T1_PROFILE.gymSchedule,
      tz: TZ,
    });
    const dates = r.week.filter((s) => s.status === 'planned').map((s) => s.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('detectPRs', () => {
  it('heavier at ≥ repMin, or more reps at the same weight; none on a first session', () => {
    const set = (exerciseId: string, w: number, reps: number) => ({
      id: `${exerciseId}-${w}-${reps}`,
      sessionId: 's',
      exerciseId,
      exerciseOrder: 0,
      setIndex: 0,
      targetWeightKg: w,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetReps: 8,
      restSec: 90,
      actualWeightKg: w,
      actualReps: reps,
      status: 'done' as const,
    });
    const prs = detectPRs([set('bench', 32.5, 8), set('row', 40, 12), set('curl', 10, 12), set('new', 20, 10)], {
      bench: { currentWeightKg: 32.5, missStreak: 0, hitTopLast: false, prWeightKg: 30, prReps: 12, calibrated: true },
      row: { currentWeightKg: 40, missStreak: 0, hitTopLast: false, prWeightKg: 40, prReps: 10, calibrated: true },
      curl: { currentWeightKg: 10, missStreak: 0, hitTopLast: false, prWeightKg: 12.5, prReps: 8, calibrated: true },
    });
    expect(prs).toEqual([
      { exerciseId: 'bench', kind: 'weight', weightKg: 32.5, reps: 8 },
      { exerciseId: 'row', kind: 'reps', weightKg: 40, reps: 12 },
    ]);
  });
});
