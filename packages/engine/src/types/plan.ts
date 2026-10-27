// Plans (docs/20-engineering/types.md §5, engines.md §3).
import type { Instant, LocalDate, LocalTime, MealKind, MealStatus, SessionStatus, Slot, TemplateKey } from './enums.ts';
import type { AddonPick, Nutrition, Portion } from './nutrition.ts';

export interface DayShapeSlot {
  slot: Slot;
  kcalShare: number;
  proteinMinG?: number;
  at: LocalTime;
  /** 'recipe' unless the eating mode makes this a Home Food or eat-out slot (engines.md §3.2). Absent = 'recipe'. */
  kind?: MealKind;
}

export interface DayShape {
  slots: DayShapeSlot[];
}

export interface PrepTask {
  /** The local date whose night-before ping announces the task. */
  forDate: LocalDate;
  text: string;
  /** When the prep should start: the meal time minus the recipe's lead hours. */
  at: Instant;
  recipeSlug: string;
}

export interface PlannedMeal {
  id: string;
  date: LocalDate;
  slot: Slot;
  plannedAt: Instant;
  kind: MealKind;
  recipeSlug?: string;
  homeDishKeys?: string[];
  multiplier: number;
  portions: Portion[];
  addons: AddonPick[];
  nutrition: Nutrition;
  status: MealStatus;
  statusAt?: Instant;
  replacedByLogId?: string;
  version: number;
}

export interface PlanDay {
  id: string;
  date: LocalDate;
  isGymDay: boolean;
  kcalTarget: number;
  proteinTarget: number;
  prepTasks: PrepTask[];
  tomorrowDeltaKcal: number;
  ok: boolean;
  problems: Problem[];
}

/** The result of planning one date. */
export interface PlannedDay {
  day: PlanDay;
  shape: DayShape;
  meals: PlannedMeal[];
  totals: Nutrition;
}

export interface SessionPlan {
  id: string;
  date: LocalDate;
  templateKey: TemplateKey;
  name: string;
  plannedStart: Instant;
  plannedDurationMin: 45 | 60 | 75;
  status: SessionStatus;
  startedAt?: Instant;
  endedAt?: Instant;
  startSource?: 'manual' | 'geofence' | 'ping_action';
  importance: number;
  movedFromDate?: LocalDate;
  feedback?: 'too_easy' | 'ok' | 'too_hard';
  version: number;
}

export interface PlannedSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseOrder: number;
  setIndex: number;
  targetWeightKg: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetReps: number;
  restSec: number;
  actualWeightKg?: number;
  actualReps?: number;
  status: 'planned' | 'done' | 'skipped';
  doneAt?: Instant;
  swappedFromExerciseId?: string;
}

export interface WeekPlan {
  weekStart: LocalDate;
  version: number;
  generatedBy: 'ai' | 'deterministic';
  templateId: string;
  days: PlanDay[];
  sessions: SessionPlan[];
  sets: PlannedSet[];
  meals: PlannedMeal[];
  note?: string;
}

/** What onboard-complete / sync return for a week. */
export type WeekPayload = WeekPlan;

export type ProblemCode =
  | 'protein_short'
  | 'kcal_off'
  | 'no_candidates'
  | 'diet'
  | 'allergen'
  | 'dislike'
  | 'cook_time'
  | 'too_many_breakfasts'
  | 'cook_once_pairs'
  | 'unknown_slug'
  | 'draft'
  | 'requires_missing'
  | 'duplicate_in_day'
  | 'slot_dropped'
  // Added in Phase 1 (validateCandidates needs them): a Home Food component used as a meal, a recipe in a slot it
  // isn't offered for.
  | 'component'
  | 'wrong_slot';

export interface Problem {
  code: ProblemCode;
  severity: 'error' | 'warn';
  date?: LocalDate;
  slot?: Slot;
  slug?: string;
  detail: string;
}

/** 1–3 unique recipe slugs per slot, ranked best first. */
export interface Candidates {
  [date: LocalDate]: Partial<Record<Slot, string[]>>;
}

export interface ResolvedFood {
  kind: 'food' | 'home_dish' | 'recipe' | 'generic';
  key: string;
  name: string;
  standardPortion: Portion;
  nutrition: Nutrition;
}

export interface GroceryItem {
  foodKey: string;
  name: string;
  qty: number;
  unit: 'g' | 'ml' | 'piece' | 'egg' | 'roti';
  group: string;
  checked: boolean;
}

export interface RebalanceDiff {
  itemId: string;
  slot: Slot;
  field: 'multiplier' | 'addon';
  from: number | string | null;
  to: number | string;
}
