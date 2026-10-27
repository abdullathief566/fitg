// Commands (docs/20-engineering/types.md §9). Devices change plans only through commands.
import type {
  Activity,
  Cuisine,
  Diet,
  EatingMode,
  Equipment,
  Experience,
  Goal,
  Injury,
  Instant,
  LocalDate,
  LocalTime,
  Weekday,
} from './enums.ts';
import type { Nutrition } from './nutrition.ts';
import type { GroceryItem, PlanDay, PlannedMeal, PlannedSet, SessionPlan, WeekPlan } from './plan.ts';
import type { GymSlot, MealTimes, NotificationPrefs, Profile, SafetyFlags, Targets } from './profile.ts';
import type { ExerciseLib, FoodIndex, HomeDish, ProteinAddon, RecipeIndex, WorkoutTemplate } from './reference.ts';
import type { ProgressState } from './workout.ts';

/** id: client uuid (idempotency); basePlanVersion: active weekly_plans.version seen by the device. */
export interface CommandBase {
  id: string;
  basePlanVersion: number;
}

export type PlanCommandBody =
  | { kind: 'SwapMeal'; itemId: string; recipeSlug: string }
  | { kind: 'SetMealStatus'; itemId: string; status: 'eaten' | 'half' | 'replaced' | 'skipped'; logId?: string }
  | { kind: 'SetHomeMeal'; itemId: string; homeDishKeys: string[] }
  | { kind: 'SetEatOutPick'; itemId: string; logId: string }
  | { kind: 'SwapExercise'; sessionId: string; exerciseOrder: number; exerciseId: string }
  | { kind: 'MoveSession'; sessionId: string; toDate: LocalDate }
  | { kind: 'SetSessionTime'; sessionId: string; start: LocalTime }
  | { kind: 'SkipSession'; sessionId: string }
  | { kind: 'LaterSession'; sessionId: string; minutes: '30' | '60' | '90' }
  | { kind: 'SetSessionFeedback'; sessionId: string; feedback: 'too_easy' | 'ok' | 'too_hard' }
  | { kind: 'TickGrocery'; weekStart: LocalDate; foodKey: string; checked: boolean }
  | { kind: 'UpdatePrefs'; patch: ProfilePrefsPatch };

export type PlanCommand = CommandBase & PlanCommandBody;

/** App-originated (user typed/picked). */
export interface ProfilePrefsPatch {
  gymSchedule?: GymSlot[];
  availableDays?: Weekday[];
  mealTimes?: MealTimes;
  cookTimePref?: 10 | 20 | 30;
  budgetTier?: 1 | 2 | 3;
  eatingMode?: EatingMode;
  dislikes?: string[];
  notificationPrefs?: Partial<NotificationPrefs>;
  units?: 'kg' | 'lb';
  homeDumbbellsKg?: number[];
}

/** Body numbers and goal changes go through the profile-update function from Settings, never via commands from AI. */
export interface BodyGoalPatch {
  weightKg?: number;
  heightCm?: number;
  goalWeightKg?: number | null;
  goal?: Goal;
  activity?: Activity;
  experience?: Experience;
  injuries?: Injury[];
  equipment?: Equipment;
  diet?: Diet;
  cuisine?: Cuisine;
  allergies?: string[];
  safetyFlags?: SafetyFlags;
}

/** What the coach's propose_plan_change tool may contain: no command id, no plan version; the only number is exerciseOrder. */
export type CoachCommand =
  | { kind: 'SwapMeal'; itemId: string; recipeSlug: string }
  | { kind: 'SwapExercise'; sessionId: string; exerciseOrder: number; exerciseId: string }
  | { kind: 'MoveSession'; sessionId: string; toDate: LocalDate }
  | { kind: 'SetSessionTime'; sessionId: string; start: LocalTime }
  | { kind: 'SkipSession'; sessionId: string }
  | { kind: 'LaterSession'; sessionId: string; minutes: '30' | '60' | '90' }
  | { kind: 'UpdatePrefs'; patch: CoachPrefsPatch };

/** Day names, not numbers: the only number a coach tool may contain is a position (exerciseOrder). */
export type DayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAY_NAMES: readonly DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface CoachPrefsPatch {
  gymStart?: LocalTime;
  /** coach-confirm converts names to Weekday numbers (mon = 0). */
  gymDays?: DayName[];
  dinnerTime?: LocalTime;
  cookTimePref?: '10' | '20' | '30';
  sessionLength?: '45' | '60' | '75';
  dislikesAdd?: string[];
}

export interface PlanLib {
  recipes: RecipeIndex;
  foods: FoodIndex;
  exercises: ExerciseLib;
  homeDishes: Map<string, HomeDish>;
  addons: ProteinAddon[];
  /** Workout templates by id. Needed when a command re-plans sessions (UpdatePrefs with a new gym schedule). */
  templates?: Map<string, WorkoutTemplate>;
}

export interface PlanState {
  profile: Profile;
  targets: Targets;
  plan: WeekPlan;
  pantry: Set<string>;
  lib: PlanLib;
  /** Off-plan food log nutrition by log id (for replaced / eat-out meals). */
  logs?: Map<string, Nutrition>;
  /** This week's grocery list (for TickGrocery). */
  grocery?: GroceryItem[];
  /** Per-exercise progression (for SwapExercise weights). */
  progress?: ProgressState;
}

export interface ChangedRows {
  days?: PlanDay[];
  sessions?: SessionPlan[];
  sets?: PlannedSet[];
  meals?: PlannedMeal[];
  profile?: Partial<Profile>;
  grocery?: GroceryItem[];
  /** Rows a command removed (meals re-planned when a gym day moves; sessions/sets replaced by a new gym schedule). */
  removed?: { meals?: string[]; sets?: string[]; sessions?: string[] };
}

export type RejectReason = 'not_found' | 'stale' | 'not_planned' | 'invalid_status' | 'invalid_value';

export interface CommandContext {
  now: Instant;
  tz: string;
}
