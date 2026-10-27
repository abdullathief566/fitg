// The local backend end to end, on real SQLite (node:sqlite) with the app's own bundle: onboarding → plan → saved
// rows → reloaded → Today. Phase 2 acceptance: T1 answers give 1,850 kcal / 120 g, and Today always has one next step.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libFromBundle, type PhoneBundle } from '@fitg/contracts';
import { addDays, addMinutes, localDateOf, toInstant, type Instant } from '@fitg/engine';
import { completeOnboarding, loadSnapshot, runCommand, type BackendDeps } from '../src/domain/backend';
import { DEFAULT_ANSWERS, profileFromAnswers, stepProblem, STEPS } from '../src/domain/onboarding';
import { targetsFor } from '../src/domain/planner';
import { revealView } from '../src/domain/reveal';
import { NO_PERMISSIONS, todayView, type LocalContext } from '../src/domain/today';
import { memoryDb } from './node-sql';
import { T1_ANSWERS } from '../test-fixtures/t1';

const BUNDLE_DIR = join(__dirname, '../assets/bundle');
const read = (f: string) => JSON.parse(readFileSync(join(BUNDLE_DIR, f), 'utf8'));
const lib = libFromBundle({
  manifest: read('manifest.json'),
  foods: read('foods.json'),
  recipes: read('recipes.json'),
  homeDishes: read('home_dishes.json'),
  addons: read('protein_addons.json'),
  exercises: read('exercises.json'),
  templates: read('templates.json'),
} as PhoneBundle);

const TZ = 'Asia/Kolkata';
const MON = '2026-11-02';
const at = (date: string, time: string): Instant => toInstant(date, time, TZ);

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const local: LocalContext = { permissions: NO_PERMISSIONS, seenComebackIds: [], doneTaskKeys: [] };

async function deps(): Promise<BackendDeps> {
  return { sql: await memoryDb(), lib, newId };
}

describe('onboarding answers', () => {
  it('T1 answers → 1,850 kcal and 120 g protein (the reveal numbers)', () => {
    const profile = profileFromAnswers(T1_ANSWERS, { userId: newId() }, { now: at(MON, '07:00'), tz: TZ });
    expect(profile.birthYear).toBe(1998);
    const t = targetsFor(profile, at(MON, '07:00'));
    expect([t.kcal, t.proteinG]).toEqual([1850, 120]);
  });

  it('every step guards its own answers; the T1 answers pass them all', () => {
    for (const step of STEPS) expect(stepProblem(step, T1_ANSWERS)).toBeNull();
    expect(stepProblem('goal', DEFAULT_ANSWERS)).not.toBeNull();
    expect(stepProblem('about', { ...T1_ANSWERS, age: 16 })).toBe('FitG is for adults, 18 and over.');
    expect(stepProblem('schedule', { ...T1_ANSWERS, gymDays: [0] })).toBe('Pick at least 2 gym days.');
    expect(stepProblem('day', { ...T1_ANSWERS, lunch: '07:30' })).not.toBeNull();
    expect(stepProblem('health', { ...T1_ANSWERS, healthChecked: false })).not.toBeNull();
  });
});

describe('local backend', () => {
  it('Monday 07:00 signup: Mon A · Wed B · Fri A, saved and reloaded identically', async () => {
    const d = await deps();
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '07:00'), tz: TZ });
    const [week, next] = made.weeks;
    expect(week!.sessions.map((s) => `${s.date}:${s.templateKey}`)).toEqual([
      '2026-11-02:A',
      '2026-11-04:B',
      '2026-11-06:A',
    ]);
    expect(week!.templateId).toBe('full_ab_machine');
    expect(next!.weekStart).toBe('2026-11-09');
    expect(next!.sessions[0]!.templateKey).toBe('B');

    const loaded = await loadSnapshot(d, at(MON, '07:05'));
    expect(loaded?.weeks).toEqual(made.weeks);
    expect(loaded?.targets).toEqual(made.targets);
    expect(loaded?.profile).toEqual(made.profile);
    expect(loaded?.pantry).toEqual(made.pantry);
  });

  it('Wednesday 20:00 signup: nothing before today, no workout that already ended, earlier meals never asked', async () => {
    const d = await deps();
    const WED = '2026-11-04';
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(WED, '20:00'), tz: TZ });
    const week = made.weeks[0]!;
    expect(week.days.map((x) => x.date)).toEqual([WED, '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(week.sessions.map((s) => s.date)).toEqual(['2026-11-06']);
    expect(week.days[0]!.isGymDay).toBe(false);
    const wedMeals = week.meals.filter((m) => m.date === WED);
    expect(wedMeals.some((m) => m.slot === 'post_workout')).toBe(false);
    for (const m of wedMeals) expect(m.status).toBe(m.plannedAt <= at(WED, '20:00') ? 'unknown' : 'planned');

    // Thursday: no "missed" workout appears out of nowhere.
    const thu = await loadSnapshot(d, at('2026-11-05', '08:00'));
    expect(thu?.weeks[0]!.sessions.map((s) => `${s.date}:${s.status}`)).toEqual(['2026-11-06:planned']);
    const view = todayView(thu!, lib, at('2026-11-05', '08:00'), local);
    expect(view.next.kind).not.toBe('comeback');
  });

  it('a session never started is skipped at the next open and the week reshuffles (comeback card)', async () => {
    const d = await deps();
    await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '07:00'), tz: TZ });
    const tue = await loadSnapshot(d, at('2026-11-03', '08:00'));
    const mon = tue!.weeks[0]!.sessions.find((s) => s.movedFromDate === MON);
    expect(mon).toBeDefined();
    expect(mon!.date > MON).toBe(true);
    const later = todayView(tue!, lib, at('2026-11-03', '17:00'), local);
    expect(later.next.kind === 'comeback' || later.timeline.length > 0).toBe(true);
  });

  it('Later (+30) moves today’s session and survives a reload', async () => {
    const d = await deps();
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '07:00'), tz: TZ });
    const session = made.weeks[0]!.sessions[0]!;
    const r = await runCommand(
      d,
      made,
      { kind: 'LaterSession', sessionId: session.id, minutes: '30' },
      at(MON, '18:10'),
    );
    expect(r.reject).toBeUndefined();
    const moved = r.snapshot.weeks[0]!.sessions[0]!;
    expect(moved.plannedStart).toBe(addMinutes(session.plannedStart, 30));
    const reloaded = await loadSnapshot(d, at(MON, '18:11'));
    expect(reloaded?.weeks[0]!.sessions[0]!.plannedStart).toBe(moved.plannedStart);
    const pending = await d.sql.all<{ state: string }>('SELECT state FROM outbox_commands');
    expect(pending).toEqual([{ state: 'pending' }]);
  });

  it('Ate it marks the meal and the protein bar counts it', async () => {
    const d = await deps();
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '07:00'), tz: TZ });
    const breakfast = made.weeks[0]!.meals.find((m) => m.date === MON && m.slot === 'breakfast')!;
    const r = await runCommand(
      d,
      made,
      { kind: 'SetMealStatus', itemId: breakfast.id, status: 'eaten' },
      at(MON, '08:20'),
    );
    const view = todayView(r.snapshot, lib, at(MON, '08:30'), local);
    expect(view.timeline.find((x) => x.refId === breakfast.id)?.status).toBe('done');
    expect(view.protein?.consumed).toBeGreaterThan(0);
    expect(view.protein?.target).toBe(made.weeks[0]!.days[0]!.proteinTarget);
  });
});

describe('Today', () => {
  it('shows exactly one next step at every hour of a gym day (Mon) and a rest day (Tue)', async () => {
    const d = await deps();
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '00:05'), tz: TZ });
    for (const date of [MON, addDays(MON, 1)]) {
      for (let h = 0; h < 24; h++) {
        const now = at(date, `${String(h).padStart(2, '0')}:30`);
        const view = todayView(made, lib, now, local);
        expect(view.next.title.length, `${date} ${h}:30`).toBeGreaterThan(0);
        expect(view.timeline.filter((x) => x.status === 'now').length).toBeLessThanOrEqual(1);
        expect(localDateOf(now, TZ)).toBe(view.date);
      }
    }
  });

  it('the workout is the next step at 18:00 on Monday, with Start / Later / Skip', async () => {
    const d = await deps();
    const made = await completeOnboarding(d, T1_ANSWERS, { now: at(MON, '07:00'), tz: TZ });
    const view = todayView(made, lib, at(MON, '18:00'), local);
    expect(view.next.kind).toBe('workout');
    expect(view.next.actions.map((a) => a.id)).toEqual(['start', 'later_30', 'skip']);
    expect(view.greeting).toBe('Evening, Abdul.');
    expect(view.journeyDay).toBe(1);
  });

  it('habit-only mode carries no food or body numbers', async () => {
    const d = await deps();
    const answers = { ...T1_ANSWERS, safety: { ...T1_ANSWERS.safety, edHistory: true } };
    const made = await completeOnboarding(d, answers, { now: at(MON, '07:00'), tz: TZ });
    const view = todayView(made, lib, at(MON, '12:00'), local);
    expect(view.habitOnly).toBe(true);
    expect(view.protein).toBeUndefined();
    expect(view.proteinFoods?.length).toBeGreaterThan(0);
    const reveal = revealView(made, lib, at(MON, '07:00'));
    expect(reveal.habitOnly).toBe(true);
  });
});

describe('plan reveal', () => {
  it('T1 on Monday morning: 1,850 / 120, the next 7 days, tomorrow, the first ping', async () => {
    const d = await deps();
    const now = at(MON, '07:00');
    const made = await completeOnboarding(d, T1_ANSWERS, { now, tz: TZ });
    const r = revealView(made, lib, now);
    expect([r.kcal, r.protein, r.proteinPerKg]).toEqual([1850, 120, 1.6]);
    expect(r.firstName).toBe('Abdul');
    expect(r.days.map((x) => `${x.label}:${x.session ?? '-'}`)).toEqual([
      'MON:Full A',
      'TUE:-',
      'WED:Full B',
      'THU:-',
      'FRI:Full A',
      'SAT:-',
      'SUN:-',
    ]);
    expect(r.tomorrow.length).toBeGreaterThan(0);
    expect(r.firstPing?.when).toBe('6:15 PM tonight');
    expect(r.firstPing?.type).toBe('pre_gym');
    expect(r.firstPing?.title).toContain('Full body A');
  });
});
