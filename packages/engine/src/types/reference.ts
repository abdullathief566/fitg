// Reference data (docs/20-engineering/types.md §2, engines.md §2.1).
import type {
  Cuisine,
  Diet,
  LoadType,
  MovementPattern,
  Slot,
  Split,
  TemplateKey,
  TemplateVariant,
  Unit,
} from './enums.ts';
import type { Nutrition } from './nutrition.ts';

/** Per 100 g. */
export interface FoodRow {
  key: string;
  name: string;
  category: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  isRaw: boolean;
  yieldFactor: number;
  cookedWithOil: boolean;
  synthetic?: boolean;
}

/** grams = RAW grams per unit for raw foods (rice 'katori' = 50 g raw = 150 g cooked). */
export interface FoodUnit {
  foodKey: string;
  unit: Unit;
  grams: number;
  label: string;
}

export type FoodIndex = Map<string, { food: FoodRow; units: FoodUnit[] }>;

export type IngredientRole = 'base' | 'protein' | 'carb' | 'fat' | 'veg' | 'spice';

export interface RecipeIngredient {
  foodKey: string;
  grams: number;
  unit: Unit;
  qty: number;
  role: IngredientRole;
  scalable: boolean;
}

export interface RecipeRow {
  slug: string;
  name: string;
  cuisine: Cuisine;
  mealSlots: Slot[];
  dietTags: Diet[];
  allergens: string[];
  cookTimeMin: number;
  costTier: 1 | 2 | 3;
  servings: number;
  oilTsp: number;
  cookedYieldG?: number;
  prep?: { text: string; leadHours: number };
  requires: string[];
  ingredients: RecipeIngredient[];
  steps: { text: string; timerSec?: number }[];
  scaleRules: { minMult: number; maxMult: number; step: number };
  proteinAddons: string[];
  tags: string[];
  isDraft: boolean;
  /** Computed by `recipeNutrition(recipe, foods, 1)` at build time; never typed by hand. */
  nutritionPerServing: Nutrition;
}

export type RecipeIndex = Map<string, RecipeRow>;

export type HomeDishCategory = 'dal' | 'sabzi' | 'curry_nonveg' | 'rice' | 'bread' | 'snack' | 'breakfast' | 'sweet';

export interface HomeDish {
  key: string;
  name: string;
  aliases: string[];
  recipeSlug: string;
  unit: Unit;
  /** Cooked grams per unit. */
  gramsPerUnit: number;
  category: HomeDishCategory;
  proteinClass: 'high' | 'med' | 'low';
}

export interface ProteinAddon {
  key: string;
  name: string;
  foodKey: string;
  unit: Unit;
  gramsPerUnit: number;
  dietTags: Diet[];
  pantryFoodKey: string;
}

export interface ExerciseRow {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  movementPattern: MovementPattern;
  equipment: string[];
  loadType: LoadType;
  isMachine: boolean;
  injuryTags: string[];
  formCues: [string, string, string];
  startLoadRatio: number;
  incrementKg: number;
  repMin: number;
  repMax: number;
  importance: 1 | 2 | 3;
}

export interface ExerciseLib {
  byId: Map<string, ExerciseRow>;
}

export interface TemplateSlot {
  /** `<sessionKey>:<slotIndex>:<pattern>`, e.g. `A:0:squat` — the id the AI uses in plan_week. */
  slotId: string;
  pattern: MovementPattern;
  primaryMuscle: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** 3 = keep at any duration; 1 = first to drop. */
  importance: 1 | 2 | 3;
  /** Exercise ids for THIS template's variant, in preference order. */
  preferred: string[];
}

export interface TemplateSession {
  key: TemplateKey;
  name: string;
  importance: number;
  slots: TemplateSlot[];
}

export interface WorkoutTemplate {
  /** `${split}_${variant}`, e.g. `full_ab_machine`. */
  id: string;
  split: Split;
  variant: TemplateVariant;
  daysPerWeek: number[];
  sessions: TemplateSession[];
}

/** The seed file's shape (`workout_templates.seed.json` → `splits[]`): one preferred list per variant. */
export interface TemplateSplitSeed {
  split: Split;
  daysPerWeek: number[];
  sessions: Array<{
    key: TemplateKey;
    name: string;
    importance: number;
    slots: Array<{
      pattern: MovementPattern;
      primaryMuscle: string;
      sets: number;
      repMin: number;
      repMax: number;
      restSec: number;
      importance: 1 | 2 | 3;
      preferred: Record<TemplateVariant, string[]>;
    }>;
  }>;
}
