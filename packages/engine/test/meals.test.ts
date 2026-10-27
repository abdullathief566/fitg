import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeTargets,
  consumedSoFar,
  dayShape,
  deterministicCandidates,
  eligibleAddons,
  groceryList,
  hasErrors,
  pickEatOut,
  planDays,
  portionHomeMeal,
  prepTasks,
  rebalanceDay,
  recipeNutrition,
  remainingMeals,
  scaleDay,
  toInstant,
  validateCandidates,
  weekDates,
  type Candidates,
  type DayShape,
  type LocalDate,
  type Nutrition,
  type PlannedDay,
  type Slot,
} from '../src/mod.ts';
import { loadLib } from './helpers/lib.ts';
import { T1_PROFILE, T1_TARGET_INPUT, TZ, WEEK_START, t1MealProfile } from './helpers/t1.ts';

const lib = loadLib();
const targets = computeTargets(T1_TARGET_INPUT);
const GYM_DAYS = new Set(['2026-11-02', '2026-11-04', '2026-11-06']);

function t1Shape(date: LocalDate): DayShape {
  const gym = GYM_DAYS.has(date);
  return dayShape({
    isGymDay: gym,
    mealTimes: T1_PROFILE.mealTimes,
    ...(gym ? { gymEnd: '19:30' } : {}),
    weightKg: 75,
    eatingMode: 'cook',
  });
}

const t1Addons = () => eligibleAddons(lib.addons, 'non_veg', lib.staples);
const recipe = (slug: string) => {
  const r = lib.recipes.get(slug);
  if (!r) throw new Error(slug);
  return r;
};

describe('dayShape', () => {
  it('gym day: 5 slots with shares summing to 1 and the post-workout minimum', () => {
    const s = t1Shape('2026-11-02');
    expect(s.slots.map((x) => x.slot)).toEqual(['breakfast', 'lunch', 'post_workout', 'dinner', 'snack']);
    expect(s.slots.reduce((a, x) => a + x.kcalShare, 0)).toBeCloseTo(1, 9);
    expect(s.slots.find((x) => x.slot === 'post_workout')).toMatchObject({ at: '19:30', proteinMinG: 30 });
  });
  it('no snack time → no snack slot, shares spread proportionally', () => {
    const s = dayShape({
      isGymDay: false,
      mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '20:00' },
      weightKg: 70,
      eatingMode: 'cook',
    });
    expect(s.slots.map((x) => x.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(s.slots[0]!.kcalShare).toBeCloseTo(0.25 / 0.85, 9);
    expect(s.slots.reduce((a, x) => a + x.kcalShare, 0)).toBeCloseTo(1, 9);
  });
  it('eating modes mark Home Food and eat-out slots', () => {
    const base = { isGymDay: false, mealTimes: T1_PROFILE.mealTimes, weightKg: 75 };
    const fam = dayShape({ ...base, eatingMode: 'family' });
    expect(fam.slots.filter((s) => s.kind === 'home_food').map((s) => s.slot)).toEqual(['lunch', 'dinner']);
    expect(dayShape({ ...base, eatingMode: 'out' }).slots.find((s) => s.slot === 'lunch')?.kind).toBe('eat_out');
    expect(dayShape({ ...base, eatingMode: 'mix' }).slots.find((s) => s.slot === 'dinner')?.kind).toBe('home_food');
  });
});

describe('M1 — scaleDay on the T1 gym day', () => {
  const slugs: Array<[Slot, string]> = [
    ['breakfast', 'egg-bhurji-roti'],
    ['lunch', 'chicken-curry-rice'],
    ['post_workout', 'chicken-rice-bowl'],
    ['dinner', 'dal-rice-meal'],
    ['snack', 'curd-banana-pb-snack'],
  ];
  const r = scaleDay({
    items: slugs.map(([slot, slug]) => ({ slot, recipe: recipe(slug) })),
    targets: { kcal: targets.kcal, proteinG: targets.proteinG },
    addons: t1Addons(),
    shape: t1Shape('2026-11-02'),
    foods: lib.foods,
    date: '2026-11-02',
    tz: TZ,
  });
  it('is ok: kcal within ±5% of 1850, protein ≥ 114 g, post-workout ≥ 30 g', () => {
    expect(r.ok).toBe(true);
    expect(Math.abs(r.totals.kcal - 1850)).toBeLessThanOrEqual(92.5);
    expect(r.totals.proteinG).toBeGreaterThanOrEqual(114);
    expect(r.items.find((m) => m.slot === 'post_workout')!.nutrition.proteinG).toBeGreaterThanOrEqual(30);
  });
  it('matches the reference: 1,904.1 kcal / 114.6 g, multipliers 1 · 1 · 1 · 0.5 · 1, no add-ons', () => {
    expect(r.totals.kcal).toBeCloseTo(1904.1, 1);
    expect(r.totals.proteinG).toBeCloseTo(114.6, 1);
    expect(r.items.map((m) => m.multiplier)).toEqual([1, 1, 1, 0.5, 1]);
    expect(r.items.every((m) => m.addons.length === 0)).toBe(true);
  });
  it('writes oil out and labels portions in household units', () => {
    const dinner = r.items.find((m) => m.slot === 'dinner')!;
    expect(dinner.portions.map((p) => p.label)).toContain('1 tsp sunflower oil');
    const breakfast = r.items.find((m) => m.slot === 'breakfast')!;
    expect(breakfast.portions.map((p) => p.label)).toEqual(
      expect.arrayContaining(['2 eggs', '2 rotis', '1 tsp sunflower oil']),
    );
    const lunch = r.items.find((m) => m.slot === 'lunch')!;
    expect(lunch.portions.find((p) => p.foodKey === 'rice_white_raw')!.label).toBe('1 katori white rice (180 g)');
    expect(lunch.plannedAt).toBe(toInstant('2026-11-02', '13:00', TZ));
  });
});

describe('M2 — rebalanceDay after an off-plan lunch', () => {
  const date = '2026-11-02';
  const shape = t1Shape(date);
  const day = planDays({
    dates: [date],
    targets,
    candidates: {
      [date]: {
        breakfast: ['egg-bhurji-roti'],
        lunch: ['chicken-curry-rice'],
        post_workout: ['chicken-rice-bowl'],
        dinner: ['dal-rice-meal'],
        snack: ['curd-banana-pb-snack'],
      },
    },
    lib: lib.recipes,
    foods: lib.foods,
    pantry: lib.staples,
    addons: lib.addons,
    profile: t1MealProfile(),
    shapes: { [date]: shape },
    tz: TZ,
  }).days[0] as PlannedDay;

  const now = toInstant(date, '14:00', TZ);
  const offPlan: Nutrition = { kcal: 900, proteinG: 25, carbsG: 100, fatG: 40 };
  const meals = day.meals.map((m) => {
    if (m.slot === 'breakfast') return { ...m, status: 'eaten' as const };
    if (m.slot === 'lunch') return { ...m, status: 'replaced' as const, replacedByLogId: 'log-lunch' };
    return m;
  });
  const consumed = consumedSoFar(meals, new Map([['log-lunch', offPlan]]), now);
  const remaining = remainingMeals(meals, now);
  const r = rebalanceDay({
    day: { ...day, meals },
    consumed,
    remaining,
    targets: { kcal: targets.kcal, proteinG: targets.proteinG },
    addons: t1Addons(),
    foods: lib.foods,
    now,
    lib: lib.recipes,
  });

  it('consumed = breakfast as planned + the 900 kcal / 25 g log', () => {
    const bf = recipeNutrition(recipe('egg-bhurji-roti'), lib.foods, 1);
    expect(consumed.kcal).toBeCloseTo(bf.kcal + 900, 0);
    expect(remaining.map((m) => m.slot)).toEqual(['post_workout', 'dinner', 'snack']);
  });
  it('multipliers within [0.5, 1.5], ≥ 1 add-on, post-workout ≥ 30 g, carry ∈ [−200, 0]', () => {
    for (const m of r.remaining) {
      expect(m.multiplier).toBeGreaterThanOrEqual(0.5);
      expect(m.multiplier).toBeLessThanOrEqual(1.5);
    }
    expect(r.remaining.some((m) => m.addons.length > 0)).toBe(true);
    expect(r.remaining.find((m) => m.slot === 'post_workout')!.nutrition.proteinG).toBeGreaterThanOrEqual(30);
    expect(r.tomorrowDeltaKcal).toBeGreaterThanOrEqual(-200);
    expect(r.tomorrowDeltaKcal).toBeLessThanOrEqual(0);
  });
  it('matches the reference: pw ×0.75 + 2 eggs, dinner ×0.5 + 1 egg, snack ×0.5, carry −200', () => {
    const by = (s: Slot) => r.remaining.find((m) => m.slot === s)!;
    expect(by('post_workout').multiplier).toBe(0.75);
    expect(by('post_workout').addons).toEqual([{ addonKey: 'boiled_egg', qty: 2 }]);
    expect(by('dinner').multiplier).toBe(0.5);
    expect(by('dinner').addons).toEqual([{ addonKey: 'boiled_egg', qty: 1 }]);
    expect(by('snack').multiplier).toBe(0.5);
    expect(r.tomorrowDeltaKcal).toBe(-200);
    const day2 = consumed.kcal + r.remaining.reduce((a, m) => a + m.nutrition.kcal, 0);
    const p2 = consumed.proteinG + r.remaining.reduce((a, m) => a + m.nutrition.proteinG, 0);
    expect(day2).toBeCloseTo(2363, -1);
    expect(p2).toBeCloseTo(108.2, 0);
  });
  it('the diff lists what changed', () => {
    expect(r.diff).toEqual(
      expect.arrayContaining([
        { itemId: by(r, 'post_workout'), slot: 'post_workout', field: 'multiplier', from: 1, to: 0.75 },
        { itemId: by(r, 'post_workout'), slot: 'post_workout', field: 'addon', from: null, to: 'boiled_egg x2' },
        { itemId: by(r, 'snack'), slot: 'snack', field: 'multiplier', from: 1, to: 0.5 },
      ]),
    );
  });
});

function by(r: { remaining: Array<{ id: string; slot: Slot }> }, slot: Slot): string {
  return r.remaining.find((m) => m.slot === slot)!.id;
}

describe('M3 — Home Food portions', () => {
  const dishes = ['dal_tadka', 'roti', 'aloo_gobi'].map((k) => lib.homeDishes.get(k)!);
  const r = portionHomeMeal({
    dishes,
    slotTarget: { kcal: 600, proteinMinG: 30 },
    addons: eligibleAddons(lib.addons, 'non_veg', lib.staples),
    pantry: lib.staples,
    lib: lib.recipes,
    foods: lib.foods,
  });
  it('labels in household units, kcal within ±10% of 600, protein add-on when short of 30 g', () => {
    expect(r.portions.map((p) => p.label)).toEqual(['1 katori dal tadka', '2 rotis', '1 katori aloo gobi']);
    expect(Math.abs(r.nutrition.kcal - 600)).toBeLessThanOrEqual(60);
    expect(r.addons).toEqual([{ addonKey: 'boiled_egg', qty: 2 }]);
    expect(r.nutrition.proteinG).toBeGreaterThanOrEqual(30);
    expect(r.label).toBe('1 katori dal tadka · 2 rotis · 1 katori aloo gobi · add 2 boiled eggs');
  });
});

describe('M4 — the end-to-end T1 week (deterministicCandidates + planDays)', () => {
  const dates = weekDates(WEEK_START);
  const shapes = Object.fromEntries(dates.map((d) => [d, t1Shape(d)]));
  const profile = t1MealProfile();
  const candidates = deterministicCandidates({ dates, lib: lib.recipes, foods: lib.foods, profile, shapes, seed: 1 });
  const { days } = planDays({
    dates,
    targets,
    candidates,
    lib: lib.recipes,
    foods: lib.foods,
    pantry: lib.staples,
    addons: lib.addons,
    profile,
    shapes,
    tz: TZ,
  });

  it('every day ok: kcal within ±5%, protein ≥ 114 g, post-workout ≥ 30 g on gym days', () => {
    for (const d of days) {
      expect(d.day.ok, `${d.day.date} ${JSON.stringify(d.day.problems)}`).toBe(true);
      expect(Math.abs(d.totals.kcal - 1850)).toBeLessThanOrEqual(92.5);
      expect(d.totals.proteinG).toBeGreaterThanOrEqual(114);
      const pw = d.meals.find((m) => m.slot === 'post_workout');
      if (GYM_DAYS.has(d.day.date)) expect(pw!.nutrition.proteinG).toBeGreaterThanOrEqual(30);
      else expect(pw).toBeUndefined();
    }
  });
  it('no recipe twice in a day; ≤ 3 distinct breakfasts; no component or requires-missing recipe', () => {
    const breakfasts = new Set<string>();
    for (const d of days) {
      const slugs = d.meals.map((m) => m.recipeSlug!);
      expect(new Set(slugs).size).toBe(slugs.length);
      breakfasts.add(d.meals.find((m) => m.slot === 'breakfast')!.recipeSlug!);
      for (const s of slugs) {
        expect(recipe(s).tags).not.toContain('component');
        expect(s).not.toBe('whey-banana-shake');
      }
    }
    expect(breakfasts.size).toBeLessThanOrEqual(3);
  });
  it('the deterministic candidates pass validateCandidates', () => {
    expect(hasErrors(validateCandidates(candidates, lib.recipes, profile, shapes))).toBe(false);
  });
  it('same seed → identical output; different seed → different but valid', () => {
    const again = deterministicCandidates({ dates, lib: lib.recipes, foods: lib.foods, profile, shapes, seed: 1 });
    expect(again).toEqual(candidates);
    const seeds = [2, 3, 4, 5, 6, 7];
    const other = seeds
      .map((seed) => deterministicCandidates({ dates, lib: lib.recipes, foods: lib.foods, profile, shapes, seed }))
      .find((c) => JSON.stringify(c) !== JSON.stringify(candidates)) as Candidates;
    expect(other).toBeDefined();
    expect(hasErrors(validateCandidates(other, lib.recipes, profile, shapes))).toBe(false);
  });
});

describe('validateCandidates', () => {
  const dates = weekDates(WEEK_START);
  const shapes = Object.fromEntries(dates.map((d) => [d, t1Shape(d)]));
  const profile = t1MealProfile();
  const good = deterministicCandidates({ dates, lib: lib.recipes, foods: lib.foods, profile, shapes, seed: 1 });
  const codes = (c: Candidates, p = profile) => validateCandidates(c, lib.recipes, p, shapes).map((x) => x.code);

  it('a non-veg recipe for a veg user → diet', () => {
    const c: Candidates = structuredClone(good);
    c['2026-11-03']!.dinner = ['chicken-curry-rice'];
    expect(codes(c, t1MealProfile({ diet: 'veg' }))).toContain('diet');
  });
  it('4 distinct first-choice breakfasts → too_many_breakfasts', () => {
    const c: Candidates = structuredClone(good);
    const four = ['egg-bhurji-roti', 'oats-banana-milk', 'paneer-bhurji-roti', 'eggs-toast-breakfast'];
    dates.forEach((d, i) => (c[d]!.breakfast = [four[i % 4]!]));
    expect(codes(c)).toContain('too_many_breakfasts');
  });
  it('a disliked ingredient → dislike', () => {
    expect(codes(good, t1MealProfile({ dislikes: ['egg_whole'] }))).toContain('dislike');
  });
  it('rajma (40 min) on a weekday dinner for T1 → cook_time', () => {
    const c: Candidates = structuredClone(good);
    c['2026-11-03']!.dinner = ['rajma-rice-meal'];
    expect(codes(c)).toContain('cook_time');
  });
  it('a component recipe → error', () => {
    const c: Candidates = structuredClone(good);
    c['2026-11-03']!.dinner = ['dal-tadka-home'];
    const problems = validateCandidates(c, lib.recipes, profile, shapes);
    expect(problems.find((p) => p.code === 'component')?.severity).toBe('error');
  });
  it('unknown slug and an empty slot are errors', () => {
    const c: Candidates = structuredClone(good);
    c['2026-11-03']!.dinner = ['pizza-supreme'];
    c['2026-11-04']!.lunch = [];
    expect(codes(c)).toEqual(expect.arrayContaining(['unknown_slug', 'no_candidates']));
  });
});

describe('groceryList and prepTasks', () => {
  const dates = weekDates(WEEK_START);
  const shapes = Object.fromEntries(dates.map((d) => [d, t1Shape(d)]));
  const profile = t1MealProfile();
  const candidates = deterministicCandidates({ dates, lib: lib.recipes, foods: lib.foods, profile, shapes, seed: 1 });
  const { days } = planDays({
    dates,
    targets,
    candidates,
    lib: lib.recipes,
    foods: lib.foods,
    pantry: lib.staples,
    addons: lib.addons,
    profile,
    shapes,
    tz: TZ,
  });
  const meals = days.flatMap((d) => d.meals);

  it('staples excluded; eggs as counts; grams rounded up to 50', () => {
    const extraMeals = [
      ...meals,
      { ...meals[0]!, id: 'x', recipeSlug: 'eggs-toast-breakfast', multiplier: 1, addons: [] },
    ];
    const items = groceryList(
      extraMeals,
      { staples: new Set(['rice_white_raw']), ticked: new Set() },
      lib.recipes,
      lib.foods,
      lib.addons,
    );
    expect(items.find((i) => i.foodKey === 'rice_white_raw')).toBeUndefined();
    const egg = items.find((i) => i.foodKey === 'egg_whole');
    expect(egg?.unit).toBe('egg');
    expect(Number.isInteger(egg?.qty)).toBe(true);
    for (const i of items.filter((x) => x.unit === 'g')) expect(i.qty % 50).toBe(0);
    const ticked = groceryList(
      meals,
      { staples: lib.staples, ticked: new Set(['chicken_breast_raw']) },
      lib.recipes,
      lib.foods,
    );
    expect(ticked.find((i) => i.foodKey === 'chicken_breast_raw')).toBeUndefined();
  });

  it('rajma on Sunday dinner → "Soak the rajma tonight." announced by Saturday\'s night-before ping', () => {
    const sunday = addDays(WEEK_START, 6);
    const dinner = {
      ...meals.find((m) => m.date === sunday && m.slot === 'dinner')!,
      recipeSlug: 'rajma-rice-meal',
    };
    const tasks = prepTasks([dinner], lib.recipes, T1_PROFILE.notificationPrefs, TZ);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      forDate: addDays(WEEK_START, 5),
      text: 'Soak the rajma tonight.',
      recipeSlug: 'rajma-rice-meal',
    });
  });
});

describe('pickEatOut', () => {
  const opt = (name: string, kcal: number, proteinG: number) => ({
    kind: 'generic' as const,
    key: name,
    name,
    standardPortion: { foodKey: name, grams: 300, unit: 'plate' as const, qty: 1, label: `1 plate ${name}` },
    nutrition: { kcal, proteinG, carbsG: 0, fatG: 0 },
  });
  it('highest protein per kcal within 1.2 × the slot; runner-up second', () => {
    const r = pickEatOut({
      options: [opt('Veg biryani', 700, 14), opt('Tandoori chicken', 450, 50), opt('Dal makhani', 500, 16)],
      slotTarget: { kcal: 520, proteinG: 30, carbsG: 0, fatG: 0 },
    });
    expect(r.pick.name).toBe('Tandoori chicken');
    expect(r.runnerUp?.name).toBe('Dal makhani');
    expect(r.overTarget).toBeUndefined();
  });
  it('nothing fits → the lightest option at half a portion, flagged', () => {
    const r = pickEatOut({
      options: [opt('Butter chicken thali', 1600, 40)],
      slotTarget: { kcal: 500, proteinG: 30, carbsG: 0, fatG: 0 },
    });
    expect(r.overTarget).toBe(true);
    expect(r.portion.qty).toBe(0.5);
  });
});
