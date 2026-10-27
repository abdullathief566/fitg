// The Phase 1 acceptance test (MASTER-PROMPT.md §10 "Done when"): the T1 profile end to end —
// targets → template → sessions → meals → pings.
import { describe, expect, it } from 'vitest';
import { localTimeOf, selectTemplate } from '../src/mod.ts';
import { at, buildWeek, scheduleAt } from './helpers/plan.ts';
import { T1_PROFILE, TZ } from './helpers/t1.ts';

describe('end-to-end T1 week', () => {
  const week = buildWeek();

  it('targets: 1,850 kcal / 120 g protein (F 55, C 220)', () => {
    expect(week.targets).toMatchObject({ kcal: 1850, proteinG: 120, fatG: 55, carbsG: 220, displayMode: 'full' });
  });

  it('template full_ab_machine with Mon A · Wed B · Fri A', () => {
    expect(
      selectTemplate({ gymDays: 3, equipment: T1_PROFILE.equipment, experience: T1_PROFILE.experience }).templateId,
    ).toBe('full_ab_machine');
    expect(week.plan.templateId).toBe('full_ab_machine');
    expect(week.plan.sessions.map((s) => [s.date, s.templateKey])).toEqual([
      ['2026-11-02', 'A'],
      ['2026-11-04', 'B'],
      ['2026-11-06', 'A'],
    ]);
    for (const s of week.plan.sessions) {
      expect(localTimeOf(s.plannedStart, TZ)).toBe('18:30');
      expect(new Set(week.plan.sets.filter((x) => x.sessionId === s.id).map((x) => x.exerciseOrder)).size).toBe(5);
    }
  });

  it('every day planned ok: kcal within ±5% of 1850, protein ≥ 114 g, post-workout ≥ 30 g on gym days', () => {
    expect(week.plan.days).toHaveLength(7);
    for (const day of week.plan.days) {
      const meals = week.plan.meals.filter((m) => m.date === day.date);
      const kcal = meals.reduce((a, m) => a + m.nutrition.kcal, 0);
      const protein = meals.reduce((a, m) => a + m.nutrition.proteinG, 0);
      expect(day.ok, `${day.date} ${JSON.stringify(day.problems)}`).toBe(true);
      expect(Math.abs(kcal - 1850)).toBeLessThanOrEqual(92.5 + 0.5);
      expect(protein).toBeGreaterThanOrEqual(114 - 0.5);
      if (day.isGymDay)
        expect(meals.find((m) => m.slot === 'post_workout')!.nutrition.proteinG).toBeGreaterThanOrEqual(30);
    }
  });

  it('exactly 4 sounding pings on each gym day: 18:15 · 20:15 · 20:45 · 21:30', () => {
    for (const s of week.plan.sessions) {
      const pings = scheduleAt(week, at(s.date, '08:00')).filter((p) => p.sound && p.data.fireDate === s.date);
      expect(
        pings.map((p) => localTimeOf(p.fireAt, TZ)),
        s.date,
      ).toEqual(['18:15', '20:15', '20:45', '21:30']);
      expect(pings.map((p) => p.type)).toEqual(['pre_gym', 'post_gym', 'pre_dinner', 'night_before']);
    }
  });

  it('the generated plan is deterministic (same inputs → same plan, same ids)', () => {
    expect(buildWeek().plan).toEqual(week.plan);
  });
});
