# FitG shared types (engine + contracts)

Every type named in a function signature in `engines.md`, `signals-and-pings.md` and `offline-sync.md` is defined here. Implement these in `packages/engine/src/types/*.ts` (camelCase, zero deps). `packages/contracts` holds the snake_case Zod row schemas for `schema.sql` plus mappers `toEngine*` / `fromEngine*`; **contracts may import engine types, never the reverse.**

## 0. Conventions
- `Instant` = ISO-8601 UTC string (`2026-11-02T13:00:00.000Z`). `LocalDate` = `'YYYY-MM-DD'` in the user's time zone. `LocalTime` = `'HH:MM'` 24-hour. `Weekday` = `0 | 1 | 2 | 3 | 4 | 5 | 6` with **0 = Monday**. Time zone = IANA string.
- Reference data is addressed by **stable keys**: `foodKey`, `recipeSlug`, `homeDishKey`, `addonKey`, `exerciseId`, `templateId`. Database uuids for reference rows are **UUIDv5(key)** with the fixed namespace `6f1c2c1e-7a3b-4c5d-9e8f-0a1b2c3d4e5f`, so the phone bundle (Phase 2) and the database seed (Phase 3) always agree.
- Per-user rows use uuids generated where they are created (device or server).
- `hash32(s)` = FNV-1a 32-bit; PRNG = mulberry32 seeded with `hash32(...)`. Both are frozen forever (changing them reshuffles plans and copy for existing users).
- Numbers displayed in the UI are `PlanNumber` (branded). Nutrition math uses exact grams; labels are rounded (§3).

## 1. Enums
```ts
export type Sex = 'male'|'female';
export type Goal = 'fat_loss'|'muscle'|'both'|'get_fit';
export type Activity = 'desk'|'on_feet'|'very_active';
export type Experience = 'new'|'lt6m'|'gt6m';
export type Equipment = 'full'|'basic'|'home_db';
export type Diet = 'vegan'|'veg'|'eggetarian'|'non_veg';
export type Cuisine = 'indian'|'western'|'mixed';
export type EatingMode = 'cook'|'family'|'out'|'mix';
export type Slot = 'breakfast'|'lunch'|'post_workout'|'dinner'|'snack';
export type Unit = 'g'|'ml'|'piece'|'katori'|'roti'|'tsp'|'tbsp'|'cup'|'slice'|'scoop'|'egg'|'plate';
export type MealStatus = 'planned'|'eaten'|'half'|'replaced'|'skipped'|'unknown';
export type MealKind = 'recipe'|'home_food'|'eat_out';
export type SessionStatus = 'planned'|'reminded'|'ready'|'in_progress'|'finished'|'partial'|'abandoned'|'skipped'|'moved';
export type TemplateKey = 'A'|'B'|'upper'|'lower';
export type PingType = 'night_before'|'pre_gym'|'post_gym'|'pre_dinner'|'trial_reminder'|'checkin';
export type EventType = 'app_open'|'session_started'|'set_done'|'set_edited'|'set_skipped'|'session_ended'|'exercise_swapped'
  |'meal_status'|'ping_action'|'geofence_enter'|'geofence_exit'|'weigh_in'|'feedback'|'permission_changed';
```
Equipment availability (used by `buildSession` / `substitutes`): **full** = every equipment tag; **basic** = every tag except `barbell` and `rack`; **home_db** = only `dumbbell` (plus bodyweight exercises, whose `equipment` is empty). An exercise is available when all of its `equipment` tags are available.

## 2. Reference data
```ts
export interface FoodRow { key: string; name: string; category: string; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number;
  isRaw: boolean; yieldFactor: number; cookedWithOil: boolean; synthetic?: boolean }          // per 100 g
export interface FoodUnit { foodKey: string; unit: Unit; grams: number; label: string }    // grams = RAW grams per unit for raw foods (rice 'katori' = 50 g raw = 150 g cooked)
export type FoodIndex = Map<string, { food: FoodRow; units: FoodUnit[] }>;
export interface RecipeIngredient { foodKey: string; grams: number; unit: Unit; qty: number; role: 'base'|'protein'|'carb'|'fat'|'veg'|'spice'; scalable: boolean }
export interface RecipeRow { slug: string; name: string; cuisine: Cuisine; mealSlots: Slot[]; dietTags: Diet[]; allergens: string[]; cookTimeMin: number;
  costTier: 1|2|3; servings: number; oilTsp: number; cookedYieldG?: number; prep?: { text: string; leadHours: number }; requires: string[];
  ingredients: RecipeIngredient[]; steps: { text: string; timerSec?: number }[]; scaleRules: { minMult: number; maxMult: number; step: number };
  proteinAddons: string[]; tags: string[]; isDraft: boolean; nutritionPerServing: Nutrition }
export type RecipeIndex = Map<string, RecipeRow>;
export interface HomeDish { key: string; name: string; aliases: string[]; recipeSlug: string; unit: Unit; gramsPerUnit: number;   // cooked grams per unit
  category: 'dal'|'sabzi'|'curry_nonveg'|'rice'|'bread'|'snack'|'breakfast'|'sweet'; proteinClass: 'high'|'med'|'low' }
export interface ProteinAddon { key: string; name: string; foodKey: string; unit: Unit; gramsPerUnit: number; dietTags: Diet[]; pantryFoodKey: string }
export interface ExerciseRow { id: string; name: string; primaryMuscle: string; secondaryMuscles: string[]; movementPattern: MovementPattern;
  equipment: string[]; loadType: 'barbell'|'dumbbell'|'machine'|'cable'|'bodyweight'; isMachine: boolean; injuryTags: string[];
  formCues: [string, string, string]; startLoadRatio: number; incrementKg: number; repMin: number; repMax: number; importance: 1|2|3 }
export interface ExerciseLib { byId: Map<string, ExerciseRow> }
```
(`MovementPattern`, `TemplateSlot`, `TemplateSession`, `WorkoutTemplate`: `engines.md` §2.1.)

## 3. Nutrition, portions, labels
```ts
export interface Nutrition { kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface Portion { foodKey: string; grams: number; unit: Unit; qty: number; label: string }   // grams exact; qty rounded for the label
export interface AddonPick { addonKey: string; qty: number }
```
Labels: quantity snapped to 0.5 (min 0.5; rotis and eggs whole), rendered "1½ katori"; for foods with `yieldFactor ≠ 1` the label shows **cooked** grams (`raw × yieldFactor`), e.g. "1 katori rice (150 g)". Nutrition always uses the exact raw grams.

## 4. Profile and targets
```ts
export interface GymSlot { weekday: Weekday; start: LocalTime; durationMin: 45|60|75 }
export interface MealTimes { breakfast: LocalTime; lunch: LocalTime; dinner: LocalTime; snack?: LocalTime }   // no snack time → no snack slot
export interface NotificationPrefs { nightBefore: LocalTime; preGymOffsetMin: number; timeSensitive: boolean; haptics: boolean }
export interface LearnedTiming { preGymShiftMin: number; dinnerShiftMin: number }
export interface SafetyFlags { pregnant?: boolean; diabetes?: boolean; glp1?: boolean; edHistory?: boolean }
export interface Profile { userId: string; firstName?: string; sex: Sex; birthYear: number; heightCm: number; weightKg: number; goalWeightKg?: number;
  goal: Goal; activity: Activity; experience: Experience; injuries: ('knee'|'back'|'shoulder')[]; equipment: Equipment; homeDumbbellsKg: number[];
  gymSchedule: GymSlot[]; availableDays: Weekday[]; diet: Diet; cuisine: Cuisine; allergies: string[]; dislikes: string[]; eatingMode: EatingMode;
  wake: LocalTime; sleep: LocalTime; mealTimes: MealTimes; cookTimePref: 10|20|30; budgetTier: 1|2|3; safetyFlags: SafetyFlags; tz: string;
  units: 'kg'|'lb'; notificationPrefs: NotificationPrefs; learnedTiming: LearnedTiming; journeyStartedAt?: LocalDate }
export interface MealProfile { diet: Diet; cuisine: Cuisine; allergies: string[]; dislikes: string[]; eatingMode: EatingMode; cookTimePref: number;
  budgetTier: number; mealTimes: MealTimes; weightKg: number; pantry: Set<string>; memoryDislikes: string[]; allowDrafts?: boolean }
```
(`TargetInput`, `Targets`: `engines.md` §1.)

## 5. Plans
```ts
export interface DayShape { slots: Array<{ slot: Slot; kcalShare: number; proteinMinG?: number; at: LocalTime }> }
export interface PrepTask { forDate: LocalDate; text: string; at: Instant; recipeSlug: string }
export interface PlannedMeal { id: string; date: LocalDate; slot: Slot; plannedAt: Instant; kind: MealKind; recipeSlug?: string; homeDishKeys?: string[];
  multiplier: number; portions: Portion[]; addons: AddonPick[]; nutrition: Nutrition; status: MealStatus; statusAt?: Instant; replacedByLogId?: string; version: number }
export interface PlanDay { id: string; date: LocalDate; isGymDay: boolean; kcalTarget: number; proteinTarget: number; prepTasks: PrepTask[];
  tomorrowDeltaKcal: number; ok: boolean; problems: Problem[] }
export interface PlannedDay { day: PlanDay; shape: DayShape; meals: PlannedMeal[]; totals: Nutrition }   // result of planning one date
export interface SessionPlan { id: string; date: LocalDate; templateKey: TemplateKey; name: string; plannedStart: Instant; plannedDurationMin: 45|60|75;
  status: SessionStatus; startedAt?: Instant; endedAt?: Instant; startSource?: 'manual'|'geofence'|'ping_action'; importance: number;
  movedFromDate?: LocalDate; feedback?: 'too_easy'|'ok'|'too_hard'; version: number }
export interface PlannedSet { id: string; sessionId: string; exerciseId: string; exerciseOrder: number; setIndex: number; targetWeightKg: number;
  targetRepsMin: number; targetRepsMax: number; targetReps: number; restSec: number; actualWeightKg?: number; actualReps?: number;
  status: 'planned'|'done'|'skipped'; doneAt?: Instant; swappedFromExerciseId?: string }
export interface WeekPlan { weekStart: LocalDate; version: number; generatedBy: 'ai'|'deterministic'; templateId: string;
  days: PlanDay[]; sessions: SessionPlan[]; sets: PlannedSet[]; meals: PlannedMeal[]; note?: string }
export type WeekPayload = WeekPlan;                                    // what onboard-complete / sync return for a week
export interface Problem { code: 'protein_short'|'kcal_off'|'no_candidates'|'diet'|'allergen'|'dislike'|'cook_time'|'too_many_breakfasts'
  |'cook_once_pairs'|'unknown_slug'|'draft'|'requires_missing'|'duplicate_in_day'|'slot_dropped'; severity: 'error'|'warn';
  date?: LocalDate; slot?: Slot; slug?: string; detail: string }
export interface ResolvedFood { kind: 'food'|'home_dish'|'recipe'|'generic'; key: string; name: string; standardPortion: Portion; nutrition: Nutrition }
export interface GroceryItem { foodKey: string; name: string; qty: number; unit: 'g'|'ml'|'piece'|'egg'|'roti'; group: string; checked: boolean }
export interface RebalanceDiff { itemId: string; slot: Slot; field: 'multiplier'|'addon'; from: number|string|null; to: number|string }
```

## 6. Workouts
```ts
export type ProgressState = Record<string, { currentWeightKg: number; missStreak: number; hitTopLast: boolean; lastReps?: number[];
  prWeightKg?: number; prReps?: number; calibrated: boolean }>;
export interface PR { exerciseId: string; kind: 'weight'|'reps'; weightKg: number; reps: number }
export type WeightSteps = { kind: 'linear'; step: number; min: number } | { kind: 'ladder'; values: number[] } | { kind: 'none' };
// derived per exercise: barbell → linear(step = incrementKg, min 20); machine/cable → linear(step = incrementKg, min = incrementKg);
// dumbbell → ladder (profile.homeDumbbellsKg for home_db, else the default ladder); bodyweight → none (progress by reps only)
```

## 7. Pings and state
```ts
export interface CopyTemplate { title: string; body: string; short: string }   // short = one line (≤ 60 chars) used when this ping is merged into another
export type CopyBank = Record<PingType, Partial<Record<'gym'|'rest', Partial<Record<'standard'|'late'|'comeback'|'ask', CopyTemplate[]>>>>>;
export interface PingEventRow { id: string; pingId: string; type: PingType; scheduledFor: Instant; deliveredAt?: Instant; actedAt?: Instant; action?: string; latencyS?: number }
export interface Permissions { notifications: 'granted'|'denied'|'undetermined'; location: 'always'|'when_in_use'|'denied'|'undetermined'; exactAlarms?: boolean }
export type SessionEvent =
  | { type: 'pre_gym_time_passed' }                 // derived from the schedule: now ≥ the pre_gym ping's fireAt
  | { type: 'geofence_enter' } | { type: 'geofence_exit_confirmed' }   // exit after the 5-min debounce
  | { type: 'start'; source: 'manual'|'geofence'|'ping_action' } | { type: 'set_done' } | { type: 'finish' }
  | { type: 'timeout_3h' } | { type: 'skip' } | { type: 'later'; laterCount: number } | { type: 'midnight' };
export interface NextStepAction { id: string; label: string; variant: 'primary'|'secondary'|'quiet' }
export interface NextStep { kind: 'workout'|'meal'|'prep'|'rest'|'checkin'|'comeback'|'tomorrow'; refId?: string; time?: Instant;
  title: string; subtitle?: string; detail?: string; actions: NextStepAction[] }
```

## 8. Events

```ts
export interface EventRow { id: string; type: EventType; at: Instant; deviceId: string; payload: EventPayload }  // id = client uuid
export type EventPayload = Record<string, unknown>;   // narrowed per type by the table below (discriminated by `type` in contracts)
```

`events.payload` by type:
| Type | Payload |
|---|---|
| `app_open` | `{}` |
| `session_started` | `{ sessionId, source: 'manual'|'geofence'|'ping_action' }` |
| `set_done` | `{ sessionId, exerciseOrder, setIndex, weightKg, reps, via: 'app'|'lock_screen' }` |
| `set_edited` | `{ setId, weightKg, reps }` |
| `set_skipped` | `{ setId }` |
| `session_ended` | `{ sessionId, status: 'finished'|'partial'|'abandoned', reason: 'finish'|'geofence_exit'|'timeout' }` |
| `exercise_swapped` | `{ sessionId, exerciseOrder, fromExerciseId, toExerciseId, reason?: 'busy'|'dislike'|'pain' }` |
| `meal_status` | `{ itemId, status: MealStatus, logId?, source: 'one_tap'|'photo'|'text'|'home_food'|'eat_out'|'device_pick' }` |
| `ping_action` | `{ pingId, type: PingType, action: string }` |
| `geofence_enter` / `geofence_exit` | `{ placeId, kind: 'gym'|'home' }` |
| `weigh_in` | `{ weightKg, source: 'manual' }` |
| `feedback` | `{ target: 'session'|'recipe'|'exercise', id, value: string }` |
| `permission_changed` | `{ permission: 'notifications'|'location'|'exact_alarms', status: string }` |

## 9. Commands
```ts
interface CommandBase { id: string; basePlanVersion: number }        // id: client uuid (idempotency); basePlanVersion: active weekly_plans.version seen by the device
export type PlanCommand = CommandBase & (
  | { kind: 'SwapMeal'; itemId: string; recipeSlug: string }
  | { kind: 'SetMealStatus'; itemId: string; status: 'eaten'|'half'|'replaced'|'skipped'; logId?: string }
  | { kind: 'SetHomeMeal'; itemId: string; homeDishKeys: string[] }                     // Home Food pick; portions computed by the engine
  | { kind: 'SetEatOutPick'; itemId: string; logId: string }                            // links a menu-pick log to the slot
  | { kind: 'SwapExercise'; sessionId: string; exerciseOrder: number; exerciseId: string }
  | { kind: 'MoveSession'; sessionId: string; toDate: LocalDate }
  | { kind: 'SetSessionTime'; sessionId: string; start: LocalTime }                     // 15-minute slots
  | { kind: 'SkipSession'; sessionId: string }
  | { kind: 'LaterSession'; sessionId: string; minutes: '30'|'60'|'90' }
  | { kind: 'SetSessionFeedback'; sessionId: string; feedback: 'too_easy'|'ok'|'too_hard' }
  | { kind: 'TickGrocery'; weekStart: LocalDate; foodKey: string; checked: boolean }
  | { kind: 'UpdatePrefs'; patch: ProfilePrefsPatch } );
export interface ProfilePrefsPatch {                                   // app-originated (user typed/picked)
  gymSchedule?: GymSlot[]; availableDays?: Weekday[]; mealTimes?: MealTimes; cookTimePref?: 10|20|30; budgetTier?: 1|2|3;
  eatingMode?: EatingMode; dislikes?: string[]; notificationPrefs?: Partial<NotificationPrefs>; units?: 'kg'|'lb'; homeDumbbellsKg?: number[] }
// Body numbers (weight, height, goal weight) and goal changes go through the profile-update function from Settings, never via commands from AI:
export interface BodyGoalPatch { weightKg?: number; heightCm?: number; goalWeightKg?: number | null; goal?: Goal; activity?: Activity;
  experience?: Experience; injuries?: ('knee'|'back'|'shoulder')[]; equipment?: Equipment; diet?: Diet; cuisine?: Cuisine;
  allergies?: string[]; safetyFlags?: SafetyFlags }
export type CoachCommand =                                             // what the coach's propose_plan_change tool may contain: no command id, no plan version; the only number is exerciseOrder (a position)
  | { kind: 'SwapMeal'; itemId: string; recipeSlug: string }
  | { kind: 'SwapExercise'; sessionId: string; exerciseOrder: number; exerciseId: string }
  | { kind: 'MoveSession'; sessionId: string; toDate: LocalDate }
  | { kind: 'SetSessionTime'; sessionId: string; start: LocalTime }
  | { kind: 'SkipSession'; sessionId: string }
  | { kind: 'LaterSession'; sessionId: string; minutes: '30'|'60'|'90' }
  | { kind: 'UpdatePrefs'; patch: CoachPrefsPatch };
export interface CoachPrefsPatch { gymStart?: LocalTime; gymDays?: Weekday[]; dinnerTime?: LocalTime; cookTimePref?: '10'|'20'|'30';
  sessionLength?: '45'|'60'|'75'; dislikesAdd?: string[] }
// coach-confirm converts CoachCommand → PlanCommand (adds id + basePlanVersion, converts enum strings to numbers).

export interface PlanState { profile: Profile; targets: Targets; plan: WeekPlan; pantry: Set<string>; lib: { recipes: RecipeIndex; foods: FoodIndex;
  exercises: ExerciseLib; homeDishes: Map<string, HomeDish>; addons: ProteinAddon[] } }
export interface ChangedRows { days?: PlanDay[]; sessions?: SessionPlan[]; sets?: PlannedSet[]; meals?: PlannedMeal[]; profile?: Partial<Profile>; grocery?: GroceryItem[] }
export type RejectReason = 'not_found'|'stale'|'not_planned'|'invalid_status'|'invalid_value';
export function applyCommand(state: PlanState, cmd: PlanCommand, ctx: { now: Instant; tz: string }):
  { state: PlanState; changed: ChangedRows; reject?: RejectReason };
```
Rejection rules: `basePlanVersion` ≠ the active plan's version **and** the target row was replaced by the newer version → `stale`. Plan edits (`SwapMeal`, `SetHomeMeal`, `SwapExercise`, `MoveSession`, `SetSessionTime`, `SkipSession`, `LaterSession`) need the target `planned` → else `not_planned`. `SetMealStatus` / `SetEatOutPick` need `planned|unknown` (a meal can be confirmed later the same day). `SetSessionFeedback` needs `finished|partial`. Missing target → `not_found`. Out-of-range values → `invalid_value`.
