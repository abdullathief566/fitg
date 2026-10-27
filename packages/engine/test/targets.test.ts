import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTargets, KCAL_FLOOR, weeklyAdjust, type TargetInput } from '../src/mod.ts';
import { readJson } from './helpers/lib.ts';

const golden = readJson('packages/engine/test/fixtures/golden/targets.json');

describe('computeTargets — golden cases T1–T11 (engines.md §5)', () => {
  for (const c of golden.cases as Array<{ id: string; input: TargetInput; expected: Record<string, unknown> }>) {
    it(c.id, () => {
      const t = computeTargets(c.input);
      const e = c.expected;
      expect(t.kcal).toBe(e.kcal);
      expect(t.proteinG).toBe(e.proteinG);
      expect(t.fatG).toBe(e.fatG);
      expect(t.carbsG).toBe(e.carbsG);
      expect(t.displayMode).toBe(e.displayMode);
      if (e.bmr !== undefined) expect(t.basis.bmr).toBeCloseTo(e.bmr as number, 9);
      if (e.activityFactor !== undefined) expect(t.basis.activityFactor).toBe(e.activityFactor);
      if (e.tdee !== undefined) expect(t.basis.tdee).toBeCloseTo(e.tdee as number, 6);
      if (e.bmi !== undefined) expect(Number(t.basis.bmi.toFixed(2))).toBe(e.bmi);
      if (e.weightUsedKg !== undefined) expect(t.basis.weightUsedKg).toBe(e.weightUsedKg);
      if (e.adjustPct !== undefined) expect(t.basis.adjustPct).toBe(e.adjustPct);
      if (e.floorsApplied !== undefined) expect(t.basis.floorsApplied).toBe(e.floorsApplied);
      if (e.notes !== undefined) expect(t.basis.notes).toEqual(e.notes);
    });
  }

  it('T3 is below the floor before flooring (raw 1120 → 1200)', () => {
    const c = golden.cases.find((x: { id: string }) => x.id === 'T3');
    const t = computeTargets(c.input);
    // tdee · (1 − 0.2) rounded to 10
    expect(Math.round((t.basis.tdee * 0.8) / 10) * 10).toBe(1120);
  });
});

describe('weeklyAdjust — T8', () => {
  it('+150 → stall 1 → −150, each week feeding the next', () => {
    let delta = 0;
    let stall = 0;
    for (const s of golden.weeklyAdjustT8.steps) {
      const r = weeklyAdjust({
        goal: 'fat_loss',
        prevWeekAvgKg: s.prev,
        thisWeekAvgKg: s.this,
        weeksSinceStart: s.weeksSinceStart,
        consecutiveStallWeeks: stall,
        currentDelta: delta,
        mealAdherencePct: 0.8,
        safetyFlags: {},
      });
      expect({ deltaChange: r.deltaChange, newDelta: r.newDelta, stallWeeks: r.stallWeeks }).toEqual(s.expected);
      delta = r.newDelta;
      stall = r.stallWeeks;
    }
  });

  it('no change in weeks 1–2 or without weigh-ins', () => {
    const base = {
      goal: 'fat_loss' as const,
      consecutiveStallWeeks: 0,
      currentDelta: 0,
      mealAdherencePct: 1,
      safetyFlags: {},
    };
    expect(weeklyAdjust({ ...base, prevWeekAvgKg: 80, thisWeekAvgKg: 78, weeksSinceStart: 2 }).deltaChange).toBe(0);
    expect(weeklyAdjust({ ...base, prevWeekAvgKg: null, thisWeekAvgKg: 78, weeksSinceStart: 5 }).reason).toBe(
      'too_early_or_no_data',
    );
  });

  it('never negative for pregnancy / diabetes / GLP-1, and the delta stays within ±450', () => {
    const r = weeklyAdjust({
      goal: 'fat_loss',
      prevWeekAvgKg: 73,
      thisWeekAvgKg: 73,
      weeksSinceStart: 6,
      consecutiveStallWeeks: 1,
      currentDelta: 0,
      mealAdherencePct: 0.9,
      safetyFlags: { glp1: true },
    });
    expect(r.deltaChange).toBe(0);
    const capped = weeklyAdjust({
      goal: 'fat_loss',
      prevWeekAvgKg: 80,
      thisWeekAvgKg: 78,
      weeksSinceStart: 6,
      consecutiveStallWeeks: 0,
      currentDelta: 400,
      mealAdherencePct: 0.9,
      safetyFlags: {},
    });
    expect(capped.newDelta).toBe(450);
    expect(capped.deltaChange).toBe(50);
  });

  it('muscle: gaining > 0.5%/week → −100; no gain two weeks running → +150', () => {
    const base = {
      goal: 'muscle' as const,
      weeksSinceStart: 4,
      currentDelta: 0,
      mealAdherencePct: 0.9,
      safetyFlags: {},
    };
    expect(
      weeklyAdjust({ ...base, prevWeekAvgKg: 70, thisWeekAvgKg: 70.5, consecutiveStallWeeks: 0 }).deltaChange,
    ).toBe(-100);
    const w1 = weeklyAdjust({ ...base, prevWeekAvgKg: 70, thisWeekAvgKg: 70, consecutiveStallWeeks: 0 });
    expect(w1.stallWeeks).toBe(1);
    const w2 = weeklyAdjust({ ...base, prevWeekAvgKg: 70, thisWeekAvgKg: 69.9, consecutiveStallWeeks: w1.stallWeeks });
    expect(w2.deltaChange).toBe(150);
  });
});

describe('computeTargets — properties (testing.md §1)', () => {
  const input = fc.record({
    sex: fc.constantFrom('male' as const, 'female' as const),
    ageYears: fc.integer({ min: 18, max: 80 }),
    heightCm: fc.integer({ min: 140, max: 210 }),
    weightKg: fc.integer({ min: 40, max: 180 }),
    goalWeightKg: fc.option(fc.integer({ min: 45, max: 120 }), { nil: undefined }),
    goal: fc.constantFrom('fat_loss' as const, 'muscle' as const, 'both' as const, 'get_fit' as const),
    activity: fc.constantFrom('desk' as const, 'on_feet' as const, 'very_active' as const),
    gymDaysPerWeek: fc.integer({ min: 0, max: 7 }),
    safetyFlags: fc.record({
      pregnant: fc.boolean(),
      diabetes: fc.boolean(),
      glp1: fc.boolean(),
      edHistory: fc.boolean(),
    }),
    kcalDelta: fc.integer({ min: -450, max: 450 }),
  });

  it('kcal ≥ floor; protein ≤ 40% of kcal; carbs ≥ 50; habit-only only with edHistory; adjust ≥ 0 when no deficit; AF ≤ 2 dp', () => {
    fc.assert(
      fc.property(input, (raw) => {
        const i: TargetInput = { ...raw };
        if (raw.goalWeightKg === undefined) delete i.goalWeightKg;
        const t = computeTargets(i);
        expect(t.kcal).toBeGreaterThanOrEqual(KCAL_FLOOR[i.sex]);
        expect(4 * t.proteinG).toBeLessThanOrEqual(0.4 * t.kcal + 10); // rounding to 5 g can overshoot by < 2.5 g
        expect(t.carbsG).toBeGreaterThanOrEqual(50);
        expect(t.displayMode === 'habit_only').toBe(!!i.safetyFlags.edHistory);
        if (i.safetyFlags.pregnant || i.safetyFlags.diabetes || i.safetyFlags.glp1) {
          expect(t.basis.adjustPct).toBeGreaterThanOrEqual(0);
        }
        expect(Math.round(t.basis.activityFactor * 100) / 100).toBe(t.basis.activityFactor);
      }),
      { numRuns: 500 },
    );
  });
});
