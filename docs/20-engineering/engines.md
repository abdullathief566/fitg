# FitG engines — the code that does the numbers

`packages/engine` is the heart of FitG. **Every number a user sees comes from here**: calories, macros, sets, reps, weights, portions, grams, times. AI never produces a number (product law #4). All types used below are defined in `types.md`.

## 0. Rules for the whole package

- **Pure functions.** No I/O, no `Date.now()`, no `Math.random()`. Time (`now: Instant`), time zone (`tz`) and randomness (`seed`) are parameters. Variety uses mulberry32 seeded with `hash32(...)` (FNV-1a) — both frozen forever.
- **Zero runtime dependencies.** Explicit `.ts` import specifiers so Metro (app), Deno (edge functions) and Vitest resolve the same files.
- **Rounding helpers** (`src/util/round.ts`): `round(x, step) = Math.round(x / step) * step` (half rounds up for positive numbers — the golden tests depend on this); `ceilTo(x, step) = Math.ceil(x / step) * step`; `snapToLadder(x, ladder)` = nearest ladder value, ties go up.
- **Dates**: `Intl.DateTimeFormat` with `timeZone` only (no date library). Week = Monday–Sunday in the user's time zone; weekday `0 = Monday`.
- **`PlanNumber`** (`src/util/plan-number.ts`): `type PlanNumber = number & { readonly __brand: 'PlanNumber' }`; only engine functions create them (`pn(x)`). UI components that display numbers accept `PlanNumber`.
- Every public function is exported from `src/mod.ts` and has tests (§5 and `testing.md`).

## 1. Targets (`src/targets/`)

```ts
export interface TargetInput {
  sex: Sex; ageYears: number; heightCm: number; weightKg: number; goalWeightKg?: number;
  goal: Goal; activity: Activity; gymDaysPerWeek: number; safetyFlags: SafetyFlags;
  kcalDelta?: number;            // accumulated weekly adjustments (−450..+450)
}
export interface Targets {
  kcal: number; proteinG: number; fatG: number; carbsG: number; displayMode: 'full' | 'habit_only';
  basis: { bmr: number; activityFactor: number; tdee: number; adjustPct: number; bmi: number;
           weightUsedKg: number; floorsApplied: boolean; notes: string[] };
}
export function computeTargets(i: TargetInput): Targets;
```

Exact formulas, in order:
1. `bmi = weightKg / (heightCm/100)²`. `ageYears` = current local year − `birth_year`.
2. **BMR (Mifflin-St Jeor)**: male `10·w + 6.25·h − 5·age + 5`; female `10·w + 6.25·h − 5·age − 161`.
3. **Activity factor**: `AF = min(BASE[activity] + 0.05 · min(gymDaysPerWeek, 4), 1.8)`, then **rounded to 2 decimals** (avoids float drift such as 1.4 + 0.2 = 1.5999…). `BASE = { desk: 1.2, on_feet: 1.4, very_active: 1.6 }`. `TDEE = BMR · AF`.
4. **Goal adjustment** `adj`: `fat_loss −0.20` · `muscle +0.10` (or `+0.05` if BMI ≥ 27) · `both −0.10` if BMI ≥ 25 else `0` · `get_fit 0`. If `pregnant || diabetes || glp1` and `adj < 0` → `adj = 0`, note `no_deficit_medical`.
5. **Calories**: `kcal = round(TDEE · (1 + adj), 10) + (kcalDelta ?? 0)`. Floor: 1,200 (female) / 1,500 (male); if below, set to the floor and `floorsApplied = true`.
6. **Protein**: **1.6 g/kg** for `fat_loss`, `muscle`, `both`; **1.4 g/kg** for `get_fit`. (Research shows the muscle benefit of extra protein levels off around 1.6 g/kg — Morton et al., BJSM 2018 — and 2.0 g/kg could not be reached from ordinary Indian home food in the reference simulation.) Weight basis: if BMI > 30 → `goalWeightKg ?? 25 · (h/100)²`, else actual weight. `proteinG = round(gPerKg · basis, 5)`. Cap: if `4 · proteinG > 0.40 · kcal` → `proteinG = round(0.40 · kcal / 4, 5)`, note `protein_capped`.
7. **Fat**: `fatG = round(0.275 · kcal / 9, 5)`; if `fatG < 0.6 · weightKg` → `fatG = ceilTo(0.6 · weightKg, 5)`, note `fat_floor`.
8. **Carbs**: `carbsG = round((kcal − 4·proteinG − 9·fatG) / 4, 5)`. If `< 50`: recompute fat at 25% (`round(0.25 · kcal / 9, 5)`), recompute carbs, `max(50, …)`, note `low_carb_floor`.
9. `edHistory` → `displayMode: 'habit_only'`. Numbers are still computed (portioning needs them) but never shown and never sent to AI prompts.

```ts
export function weeklyAdjust(i: {
  goal: Goal; prevWeekAvgKg: number | null; thisWeekAvgKg: number | null;
  weeksSinceStart: number;        // 1-based number of the week being evaluated (journey week 1, 2, 3, …)
  consecutiveStallWeeks: number; currentDelta: number; mealAdherencePct: number; safetyFlags: SafetyFlags;
}): { deltaChange: number; newDelta: number; stallWeeks: number; reason: string };
```
- No change while `weeksSinceStart ≤ 2` or either weekly average is missing (reason `too_early_or_no_data`). Weekly average = mean of that week's weigh-ins.
- **fat_loss**: `loss = (prev − this) / prev`. `loss > 1.0%` → `+150` (too fast; stall reset). `loss ≤ 0.2%` and `mealAdherencePct ≥ 0.70` → `stallWeeks + 1`; when `stallWeeks ≥ 2` → `−150` and reset to 0. Otherwise reset stall to 0.
- **muscle**: `gain = (this − prev) / prev`. `gain > 0.5%` → `−100`. `gain ≤ 0` two weeks running (same stall logic) → `+150`.
- **both / get_fit**: no automatic change in v1.
- Safety: if `pregnant || diabetes || glp1` → never negative changes. `newDelta` clamped to `[−450, +450]`. `computeTargets` re-applies floors after every change. BMR uses the latest 7-day average weight once weigh-ins exist.

## 2. Workout planner (`src/workout/`)

### 2.1 Templates (`data/seed/workout_templates.seed.json`)

```ts
export type MovementPattern = 'squat'|'hinge'|'h_push'|'v_push'|'h_pull'|'v_pull'|'lunge'|'core'|'isolation';
export interface TemplateSlot { slotId: string;     // "<sessionKey>:<slotIndex>:<pattern>", e.g. "A:0:squat" — the id AI uses in plan_week
  pattern: MovementPattern; primaryMuscle: string; sets: number; repMin: number; repMax: number;
  restSec: number; importance: 1 | 2 | 3;            // 3 = keep at any duration; 1 = first to drop
  preferred: string[]; }                              // exercise ids for THIS template's variant, in preference order
export interface TemplateSession { key: TemplateKey; name: string; importance: number; slots: TemplateSlot[] }
export interface WorkoutTemplate { id: string;        // `${split}_${variant}`, e.g. 'full_ab_machine'
  split: 'full_ab'|'upper_lower'; variant: 'gym'|'machine'|'home_db'; daysPerWeek: number[]; sessions: TemplateSession[] }
```
The seed file defines the two splits once with a `preferred` list **per variant** per slot; `build-seed.ts` expands them into six rows (`full_ab_gym`, `full_ab_machine`, `full_ab_home_db`, `upper_lower_gym`, `upper_lower_machine`, `upper_lower_home_db`), each slot keeping only its variant's list and getting its `slotId`.

v1 templates (session display names in brackets):

| Template | Session | Slots (pattern · sets × reps · rest · importance) |
|---|---|---|
| `full_ab` (1–3 days) | **A** [Full body A] | squat 3×8–12 · 120 s · 3 → h_push 3×8–12 · 120 s · 3 → h_pull 3×10–15 · 90 s · 3 → hinge 3×8–12 · 120 s · 2 → core 3×10–15 · 60 s · 1 → isolation (biceps) 2×10–15 · 60 s · 1 |
|  | **B** [Full body B] | hinge 3×8–12 · 120 s · 3 → v_push 3×8–12 · 90 s · 3 → v_pull 3×10–15 · 90 s · 3 → lunge 3×8–12 · 90 s · 2 → core 3×10–15 · 60 s · 1 → isolation (triceps) 2×10–15 · 60 s · 1 |
| `upper_lower` (4 days) | **upper** [Upper body] | h_push 3×8–12 · 120 s · 3 → v_pull 3×10–15 · 90 s · 3 → v_push 3×8–12 · 90 s · 2 → h_pull 3×10–15 · 90 s · 2 → isolation (triceps) 2×10–15 · 60 s · 1 → isolation (biceps) 2×10–15 · 60 s · 1 |
|  | **lower** [Lower body] | squat 3×8–12 · 120 s · 3 → hinge 3×8–12 · 120 s · 3 → lunge 3×8–12 · 90 s · 2 → isolation (hamstrings) 2×10–15 · 60 s · 2 → isolation (calves) 2×12–15 · 60 s · 1 → core 3×10–15 · 60 s · 1 |

**Rep ranges, sets and rest come from the template slot** (the slot wins over the exercise's own `rep_min`/`rep_max`), **except bodyweight exercises**, which use the exercise's range (their load can't increase). Variants: `gym` (barbell first), `machine` (machines/cables first — default for `experience = new` or `equipment = basic`), `home_db` (dumbbells + bodyweight only). Equipment availability is defined in `types.md` §1.

### 2.2 Functions

```ts
export function selectTemplate(p: { gymDays: number; equipment: Equipment; experience: Experience }): { templateId: string };
// gymDays ≤ 3 → full_ab; 4+ → upper_lower (v1 caps at 4 sessions a week)
// variant: equipment home_db → home_db; equipment basic OR experience new → machine; else gym

export function scheduleWeek(p: { template: WorkoutTemplate; gymSchedule: GymSlot[]; weekStart: LocalDate; tz: string;
  lastCompletedKey?: TemplateKey }): SessionPlan[];
// Sessions go on the gym_schedule days in order; keys alternate A,B,A… (or upper,lower…) starting from the key AFTER
// lastCompletedKey (first week: A / upper). plannedStart = local date + slot start; plannedDurationMin = slot duration.

export function buildSession(p: { session: TemplateSession; lib: ExerciseLib; variant: 'gym'|'machine'|'home_db'; equipment: Equipment;
  homeDumbbellsKg?: number[]; injuries: string[]; progress: ProgressState; bodyweightKg: number; sex: Sex; experience: Experience;
  durationMin: 45|60|75; aiPicks?: Record<string, string> /* slotId → exerciseId from plan_week, used if valid */ }):
  { sets: PlannedSet[]; notes: string[] };
// Exercises per duration: 45 → 4, 60 → 5, 75 → 6 — keep the highest-importance slots (stable order).
// Slot filling: aiPicks[slotId] if it is in preferred, available and not injury-tagged; else the first id in `preferred`
// that is available (types.md §1) and has no injury tag in `injuries`; else substitutes(); else drop the slot and add a
// note ("Skipped squats today because of your knee.").
// targetReps: repMin for a new weight; otherwise min(repMax, min(lastReps) + 1).

export function startingWeight(ex: ExerciseRow, p: { bodyweightKg: number; sex: Sex; experience: Experience; steps: WeightSteps }): number;
// barbell: 20 kg (empty bar) for experience new/lt6m; otherwise max(20, snap(ratio · bw · sexFactor))
// dumbbell / machine / cable: snap(ratio · bw · sexFactor) to the steps; never below the lowest step
// bodyweight: 0.  sexFactor: male 1.0, female 0.6 (coach-tunable default). Conservative on purpose — calibrate() corrects it.

export function calibrate(currentKg: number, answer: 'too_easy'|'right'|'too_heavy', steps: WeightSteps): number;
// Only after set 1 of an exercise's FIRST-EVER session: too_easy → snap(current · 1.25), at least +1 step;
// too_heavy → snap(current · 0.8), at least −1 step, never below the minimum; right → unchanged.

export function progress(prev: { weightKg: number; actualReps: number[]; repMin: number; repMax: number },
  state: { missStreak: number }, steps: WeightSteps): { nextWeightKg: number; missStreak: number; message: 'up'|'hold'|'down' };
// Double progression: every set ≥ repMax → next = one step up, missStreak 0, 'up'.
// Any set < repMin → missStreak + 1; if missStreak ≥ 2 → next = snap(weight · 0.9), missStreak 0, 'down'; else hold.
// Otherwise hold (missStreak unchanged). Bodyweight (steps.kind 'none'): weight stays 0; reps carry the progression.

export function applyFeedback(nextWeightKg: number, feedback: 'too_easy'|'ok'|'too_hard', steps: WeightSteps): number;
// session-level feedback: too_easy → +1 step on every exercise next time; too_hard → −1 step; ok → unchanged.

export function substitutes(p: { exerciseId: string; lib: ExerciseLib; equipment: Equipment; experience: Experience;
  injuries: string[]; n?: number }): ExerciseRow[];
// Same movement_pattern AND primary_muscle first, then same pattern; only available, non-injury-tagged exercises;
// prefer is_machine for experience 'new'; stable order by importance desc then name. Default n = 3.

export function reshuffle(p: { week: SessionPlan[]; missedSessionId: string; today: LocalDate; availableDays: Weekday[];
  gymSchedule: GymSlot[]; lastCompletedDay?: LocalDate }): { week: SessionPlan[]; dropped?: SessionPlan; note: string };

export function detectPRs(sets: PlannedSet[], progress: ProgressState): PR[];   // heavier weight at ≥ repMin, or more reps at the same weight
export function stepsFor(ex: ExerciseRow, homeDumbbellsKg?: number[]): WeightSteps;   // rules in types.md §6
// Default dumbbell ladder: [2.5,5,7.5,10,12.5,15,17.5,20,22.5,25,27.5,30,35,40]; "one step" on a ladder = the next value.
```

### 2.3 Reshuffle algorithm (exact)
1. `remaining` = [the missed session] + every `planned` session dated after `today`, in their original order.
2. `candidates` = weekdays in `availableDays` from `today + 1` through the week's Sunday, ascending.
3. Greedy placement in order: each session goes on the earliest candidate day that is **≥ 2 days after** the previously placed session (the first session compares against `lastCompletedDay`) — a rest day between; if none, the earliest candidate **≥ 1 day after**; never two sessions on one day.
4. If any session can't be placed, remove the session with the lowest `importance` among `remaining` (tie → the later one), mark it dropped, and retry from step 3.
5. **The same session rows are updated** (no new rows): a moved session gets its new `date`, `moved_from_date` = the old date, status `planned`, and keeps its time of day if the new weekday is in `gymSchedule`, else the missed session's time. A dropped session becomes `skipped`.
6. Next week starts with the template key **after the last completed session's key**.
7. `note` is built by code, one sentence: "Moved Full body B to Thursday." / "Moved Full body B to Thursday and Full body A to Saturday." / "Dropped Friday's Full body A — next week picks up from there."

## 3. Meal planner (`src/meal/`, `src/nutrition/`, `src/units/`)

### 3.1 Nutrition math and labels
```ts
export function nutritionForGrams(food: FoodRow, grams: number): Nutrition;       // per-100 g × grams / 100
export function gramsForUnit(units: FoodUnit[], foodKey: string, unit: Unit, qty: number): number;
export function toHousehold(units: FoodUnit[], food: FoodRow, grams: number): { unit: Unit; qty: number; label: string };
export function recipeNutrition(recipe: RecipeRow, foods: FoodIndex, multiplier: number): Nutrition;
// scalable ingredients × multiplier; non-scalable fixed; oil is an ingredient (1 tsp = 4.5 g)
```
Reference units (seeded in `food_units`): katori = 150 g cooked (raw-food units store **raw** grams: rice 50 g, dal 60 g); roti = 30 g atta; tsp oil/ghee = 4.5 g; tbsp = 13.5 g; cup = 240 ml; egg = 50 g; scoop = 30 g. Labels follow `types.md` §3 (rounded qty, cooked grams for foods with a yield factor); nutrition uses exact grams.

### 3.2 Day shape
```ts
export function dayShape(p: { isGymDay: boolean; mealTimes: MealTimes; gymEnd?: LocalTime; weightKg: number; eatingMode: EatingMode }): DayShape;
```
- Rest day shares: breakfast .25 · lunch .30 · dinner .30 · snack .15.
- Gym day: breakfast .22 · lunch .28 · post_workout .15 (at `gymEnd`, `proteinMinG = round(0.4 · weightKg, 5)`) · dinner .27 · snack .08.
- **Snack only if `mealTimes.snack` is set**; otherwise its share is spread over the other slots proportionally (divide each by `1 − snackShare`).
- `family`: lunch and dinner become **Home Food** slots (dish chosen at meal time, §3.6); `out`: lunch becomes an **eat-out** slot (§3.7); `mix`: dinner Home Food, lunch planned. These slots keep their kcal share; the planner doesn't pick a recipe for them.

### 3.3 Candidates and validation
```ts
export interface Candidates { [date: LocalDate]: Partial<Record<Slot, string[]>> }   // 1–3 unique recipe slugs per slot, ranked
export function validateCandidates(c: Candidates, lib: RecipeIndex, profile: MealProfile, shapes: Record<LocalDate, DayShape>): Problem[];
export function deterministicCandidates(p: { dates: LocalDate[]; lib: RecipeIndex; foods: FoodIndex; profile: MealProfile;
  shapes: Record<LocalDate, DayShape>; seed: number }): Candidates;
```
A recipe is **eligible** for a slot when: it exists; it is not tagged `component` (components are only used by Home Food dishes); it is not `isDraft` unless `profile.allowDrafts` (dev/tests); `slot ∈ mealSlots`; diet allowed (vegan user: `vegan`; veg: `vegan|veg`; eggetarian: `vegan|veg|eggetarian`; non_veg: any); no allergen in `allergies`; no slug or ingredient key in `dislikes`/`memoryDislikes`; every `requires` key is in the pantry; and on weekdays (Mon–Fri) lunch/dinner `cookTimeMin ≤ cookTimePref + 10`.

`validateCandidates` (errors reject an AI plan; warnings are logged):
- error: unknown slug (`unknown_slug`), ineligible recipe (`diet`, `allergen`, `dislike`, `requires_missing`, `cook_time`, `draft`), a slot in the shape with no candidates (`no_candidates`), duplicate slugs in one slot's list, more than 3 distinct **first-choice** breakfasts in the week (`too_many_breakfasts`);
- warning: `cookTimePref ≤ 20` and fewer than 3 "cook once, eat twice" pairs (first-choice `dinner(d) = lunch(d+1)`) (`cook_once_pairs`).

`deterministicCandidates` = the no-AI planner and the AI fallback. For each date and slot: take the eligible recipes, score `2 × pantryCoverage + (cuisine match ? 1 : 0) + (costTier ≤ budgetTier ? 1 : 0) + proteinDensity / 5` (proteinDensity = g protein per 100 kcal at multiplier 1; the term applies to breakfast, lunch, post_workout and dinner; pantryCoverage = share of non-oil ingredient foods in the pantry; cuisine `mixed` matches anything), sort descending (ties by slug), and keep the top 3. Then: exclude recipes already first choice in an earlier slot that day (a recipe at most once a day); breakfast rotates among its top 3 by day (`dayIndex % 3`) and, once 3 distinct breakfasts are used, only those 3 are allowed; when `cookTimePref ≤ 20` and yesterday's dinner is eligible for today's lunch, put it first.

### 3.4 Planning a day (exact)
```ts
export function planDays(p: { dates: LocalDate[]; targets: Targets; candidates: Candidates; lib: RecipeIndex; foods: FoodIndex;
  pantry: Set<string>; addons: ProteinAddon[]; profile: MealProfile; shapes: Record<LocalDate, DayShape> }): { days: PlannedDay[]; problems: Problem[] };
export function scaleDay(p: { items: Array<{ recipe: RecipeRow; slot: Slot }>; targets: { kcal: number; proteinG: number };
  addons: ProteinAddon[]; shape: DayShape; foods: FoodIndex }): { items: PlannedMeal[]; totals: Nutrition; ok: boolean; reason?: string };
```
**`scaleDay`** — protein first, then calories, adjusting the least protein-dense food first:
1. Multipliers start at 1.0. Eligible add-ons = diet-compatible and `pantryFoodKey` in the pantry; "best add-on" = lowest kcal per gram of protein (tie → key). Add-ons may go on **any** slot (a recipe's own `proteinAddons` only reorder suggestions in the UI). Caps: 2 units per slot, 3 per day.
2. **Slot minimums**: for each slot with `proteinMinG`, add best add-on units to that slot until met or capped.
3. Loop (max 80 iterations), first matching rule wins each iteration:
   a. protein < 0.95 × target and an add-on can still be added → add one to the first slot with room in order post_workout → dinner → lunch → breakfast → snack;
   b. kcal > 1.05 × target → lower by one 0.25 step the item with the **lowest** protein density whose multiplier can still go down **without dropping its slot below that slot's `proteinMinG`** (tie → slot order snack, breakfast, lunch, dinner, post_workout);
   c. kcal < 0.95 × target → raise by one 0.25 step the item with the **highest** protein density that can still go up (tie → post_workout, dinner, lunch, breakfast, snack);
   d. otherwise stop.
4. `ok = |kcal − target| ≤ 5%` **and** `protein ≥ 0.95 × target` **and** every slot minimum met.
5. Oil is always written out in labels ("1 tsp oil"); multipliers stay within each recipe's `scaleRules`.

**`planDays`** — for each date: build every combination of the slots' ranked candidates (≤ 3 per slot → at most 243), order them by the sum of candidate ranks, then lexicographically in slot order; skip combinations that use a recipe twice in one day; run `scaleDay` on each and keep the **first `ok` one**. If none is ok, keep the combination with the smallest violation (`kcal excess beyond ±5% / target + protein shortfall below 95% / target`), mark the day `ok: false` and add a `protein_short` or `kcal_off` problem (the server may ask the AI once more with the reason; otherwise the deterministic candidates fill it). Home Food and eat-out slots keep their share and are skipped by the search.

**Reference result** (computed 2026-10-27 with `seed/sample/foods.sample.json`, the T1 profile and these exact rules): M1 → `ok`, 1,904.1 kcal, 114.6 g protein, with breakfast egg-bhurji-roti ×1, lunch chicken-curry-rice ×1, post-workout chicken-rice-bowl ×1, dinner dal-rice-meal ×0.5, snack curd-banana-pb-snack ×1. The full T1 week planned by `deterministicCandidates` + `planDays` comes out `ok` on all 7 days.

### 3.5 Daily rebalance (exact)
```ts
export function rebalanceDay(p: { day: PlannedDay; consumed: Nutrition; remaining: PlannedMeal[]; targets: { kcal: number; proteinG: number };
  addons: ProteinAddon[]; foods: FoodIndex; now: Instant }): { remaining: PlannedMeal[]; diff: RebalanceDiff[]; tomorrowDeltaKcal: number };
```
1. `consumed` = eaten + half + replaced (off-plan log nutrition) + **`unknown` and still-`planned` meals whose time has passed, counted as eaten as planned** (FitG assumes you followed the plan for today's math and asks once; `types.md`, `signals-and-pings.md` §2). `need = targets − consumed` (kcal floored at 0).
2. Run the `scaleDay` steps (slot minimums, then the loop — including the slot-minimum guard) on the remaining items against `need`, with multipliers clamped to **[0.5, 1.5]** (and recipe bounds) and the day's add-on caps (units already used today count).
3. If the day still ends more than 5% over the kcal target, overflow carries: `tomorrowDeltaKcal = −min(200, round(overflow, 10))`. **Under-eating never carries forward** (no "eat more tomorrow"). Tomorrow never drops below the floors.
4. `diff = [{ itemId, slot, field: 'multiplier'|'addon', from, to }]`; code turns it into one plain line; the fast AI model may reword it (numbers validated).

**Reference result** (M2, same sample values): breakfast eaten as planned (egg-bhurji-roti ×1), lunch replaced at 14:00 by an off-plan log of 900 kcal / 25 g → remaining post-workout chicken-rice-bowl ×0.75 + 2 boiled eggs (keeps the 30 g post-workout minimum), dinner dal-rice-meal ×0.5 + 1 boiled egg, snack curd-banana-pb-snack ×0.5; day ≈ 2,363 kcal / 108.2 g; `tomorrowDeltaKcal = −200`.

### 3.6 Home Food mode (family cooks)
```ts
export function portionHomeMeal(p: { dishes: HomeDish[]; slotTarget: { kcal: number; proteinMinG?: number };
  addons: ProteinAddon[]; pantry: Set<string>; lib: RecipeIndex; foods: FoodIndex }): { portions: Portion[]; addons: AddonPick[]; nutrition: Nutrition };
```
- Nutrition per unit = `recipeNutrition(dish.recipe, foods, 1) × gramsPerUnit / recipe.cookedYieldG`.
- Start: bread 2 rotis, rice 1 katori, dal 1 katori, sabzi 1 katori, curry_nonveg 1 katori, snack/breakfast 1 piece or plate.
- Adjust carb categories first (rice in 0.5-katori steps, roti in whole units, min 1) toward the slot kcal **±10%**; then dal/curry in 0.5 steps; then add an eligible protein add-on if protein < `proteinMinG`.
- Labels: "2 rotis · 1 katori dal · 1 katori sabzi · add 2 boiled eggs".

### 3.7 Eat-out mode
```ts
export function pickEatOut(p: { options: ResolvedFood[]; slotTarget: Nutrition }): { pick: ResolvedFood; portion: Portion; nutrition: Nutrition; runnerUp?: ResolvedFood };
```
Among options with `kcal ≤ 1.2 × slotTarget.kcal` at a standard portion (0.5 / 1 / 1.5 plates), pick the highest protein per kcal; runner-up = second best. If none qualify, pick the lowest-kcal option at 0.5 portion and say so.

### 3.8 Grocery list and prep tasks
```ts
export function groceryList(meals: PlannedMeal[], pantry: { staples: Set<string>; ticked: Set<string> }, lib: RecipeIndex): GroceryItem[];
export function prepTasks(meals: PlannedMeal[], lib: RecipeIndex, prefs: NotificationPrefs, tz: string): PrepTask[];
```
- Grocery: sum raw grams of every ingredient and add-on across the week (× multipliers); exclude staples and ticked items; group by food category; round up to 50 g (eggs and rotis as counts).
- Prep: for each planned meal whose recipe has `prep`, create a task `leadHours` before the meal, shown in the night-before ping when the lead time crosses the night before (e.g. "Soak the rajma tonight").

## 4. Validators (`src/validate/`)

```ts
export function extractNumbers(text: string): number[];
export function assertNoForeignNumbers(text: string, allowed: number[]): { ok: boolean; foreign: number[] };
export function containsBannedWords(text: string): string[];
```
- `extractNumbers`: digit runs `/\d+(?:,\d{3})*(?:\.\d+)?/g` — a comma is a thousands separator only when followed by exactly 3 digits ("1,850" → 1850); decimals use "."; vulgar fractions map to decimals and attach to a preceding integer ("1½" → 1.5, "½" → 0.5); "3×8" yields 3 and 8; "6:30" yields 6 and 30.
- `assertNoForeignNumbers`: ok only if every extracted number is in `allowed`. The context builder adds every number it sent the model, the hour and minute parts of every time, **and the 12-hour form of every hour** (18:30 → 18, 6 and 30). In `habit_only` mode `allowed = []` for food/body prose.
- `containsBannedWords`: the **automated** list in `docs/10-design/copy.md` §8a, case-insensitive, word boundaries, apostrophe variants (' and ’). Runs on the copy bank and on every AI prose output — never on prompt files (prompts quote the list on purpose).

## 5. Golden cases (must pass exactly; inputs in `testing.md`)

All values below were computed on 2026-10-27 with a reference implementation of exactly these rules.

| # | Input | Expected |
|---|---|---|
| T1 | male, 28 y, 175 cm, 75 kg, desk, fat_loss, 3 gym days | BMR 1708.75 · AF 1.35 · TDEE 2306.8125 · **1850 kcal · P 120 · F 55 · C 220** |
| T2 | female, 24 y, 160 cm, 60 kg, desk, fat_loss, 2 days | BMR 1319 · AF 1.30 · **1370 · P 95 · F 40 · C 160** |
| T3 | female, 35 y, 150 cm, 48 kg, desk, fat_loss, 2 days | raw 1120 → **floor 1200** (`floorsApplied`) · **P 75 · F 35 · C 145** |
| T4 | male, 22 y, 170 cm, 62 kg, on_feet, muscle, 4 days | BMR 1577.5 · AF 1.60 · **2780 · P 100 · F 85 · C 405** |
| T5 | male, 32 y, 178 cm, 110 kg, goal 90 kg, desk, fat_loss, 3 days | BMI 34.72 → protein basis 90 · **2220 · P 145 · F 70 · C 255** |
| T6 | T1 + `diabetes` | adjust 0, note `no_deficit_medical` · **2310 · P 120 · F 70 · C 300** |
| T7 | T1 + `edHistory` | T1 numbers · `displayMode: 'habit_only'` |
| T8 | weeklyAdjust fat_loss, adherence 0.8: `weeksSinceStart` 3: 74.0→73.0 · 4: 73.0→73.0 · 5: 73.0→72.95 | **+150** (delta 150) · **0** (stall 1) · **−150** (delta 0, stall 0) |
| T9 | male, 30 y, 180 cm, 72 kg, desk, both, 3 days | BMI 22.22 → adjust 0 · **2300 · P 115 · F 70 · C 305** |
| T10 | female, 41 y, 163 cm, 92 kg, goal 70 kg, desk, fat_loss, 2 days, `glp1` | no deficit · **2040 · P 110 · F 60 · C 265** |
| T11 | female, 27 y, 165 cm, 58 kg, on_feet, get_fit, 2 days | BMR 1315.25 · AF 1.50 · **1970 · P 80 · F 60 · C 280** |
| W1 | bench 30 kg (linear step 2.5), 8–12, reps 12/12/12 | **32.5, up** |
| W2 | reps 12/11/10 | **30, hold** |
| W3 | reps 7/8/8 then 8/7/6 | hold 30 (miss 1) → **27.5, down** (30 × 0.9 = 27 → snap 27.5), miss 0 |
| W4 | full_ab: Mon A done, Wed B missed (today Wed), Fri A planned, all days available | **B → Thu, A → Sat**, nothing dropped |
| W5 | Mon A, Wed B done; Fri A missed (today Fri); available Mon–Fri only | **A dropped**; next week starts with **A** |
| W6 | injury `knee`, full_ab_machine session A with the seed library | the squat slot is **dropped with a note** (every squat-pattern exercise in the seed carries the knee tag); no knee-tagged exercise in any slot |
