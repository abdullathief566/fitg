// The context package (ai-orchestration.md §2) and the plan_week menus + validation context (§4).
import type { CallType } from '@fitg/contracts';
import {
  allowedNumbersFrom,
  exerciseMenu,
  localTimeOf,
  recipeMenu,
  validateCandidates,
  type DayShape,
  type Equipment,
  type ExerciseLib,
  type FoodIndex,
  type LocalDate,
  type MealProfile,
  type Profile,
  type RecipeIndex,
  type Targets,
  type UserState,
  type WeekPlan,
  type WorkoutTemplate,
} from '@fitg/engine';
import type { PromptVariant } from './prompts/index.ts';
import type { ValidationContext } from './validators.ts';

export const MAX_MEMORY_BULLETS = 40;

export interface ContextInput {
  profile: Profile;
  targets: Targets;
  plan?: WeekPlan;
  userState?: UserState;
  adherence14d?: { workoutsDone: number; workoutsPlanned: number; mealsOneTapPct: number; proteinDays: number };
  memory?: Array<{ kind: string; key: string; value: string }>;
  pantry: Iterable<string>;
  purpose: CallType;
  /** For recipe names in the plan summary. */
  recipes?: RecipeIndex;
}

export interface BuiltContext {
  variant: PromptVariant;
  contextJson: Record<string, unknown>;
  allowedNumbers: number[];
}

/** habit_only for an eating-disorder history; no_deficit for pregnancy / diabetes / GLP-1. */
export function variantOf(profile: Profile): PromptVariant {
  const f = profile.safetyFlags;
  if (f.edHistory) return 'habit_only';
  if (f.pregnant || f.diabetes || f.glp1) return 'no_deficit';
  return 'standard';
}

/**
 * First name only (no email, phone or birth date), constraints, today's state, plan summary, 14-day adherence,
 * ≤ 40 memory bullets, pantry keys, and — only when not habit-only — targets. allowedNumbers = every number in the
 * context (deep scan) + the hour/minute parts of every time + the 12-hour form of every hour; [] in habit-only mode.
 */
export function buildContext(input: ContextInput): BuiltContext {
  const variant = variantOf(input.profile);
  const p = input.profile;
  const ctx: Record<string, unknown> = {
    purpose: input.purpose,
    user: {
      ...(p.firstName ? { firstName: p.firstName } : {}),
      goal: p.goal,
      experience: p.experience,
      diet: p.diet,
      cuisine: p.cuisine,
      allergies: p.allergies,
      dislikes: p.dislikes,
      eatingMode: p.eatingMode,
      cookTimePref: p.cookTimePref,
      equipment: p.equipment,
      injuries: p.injuries,
    },
  };
  if (variant !== 'habit_only') {
    ctx.targets = {
      kcal: input.targets.kcal,
      proteinG: input.targets.proteinG,
      carbsG: input.targets.carbsG,
      fatG: input.targets.fatG,
    };
  }
  if (input.userState) {
    const s = input.userState;
    ctx.today = {
      date: s.day.date,
      isGymDay: s.day.isGymDay,
      workout: { status: s.workout.status, setsDone: s.workout.setsDone, setsPlanned: s.workout.setsPlanned },
      meals: s.meals.map((m) => ({ slot: m.slot, status: m.status })),
      nextStep: s.nextStep.title,
    };
  }
  if (input.plan) {
    const name = (slug?: string) => (slug ? (input.recipes?.get(slug)?.name ?? slug) : undefined);
    ctx.plan = {
      weekStart: input.plan.weekStart,
      sessions: input.plan.sessions.map((s) => ({
        id: s.id,
        date: s.date,
        name: s.name,
        time: localTimeOf(s.plannedStart, p.tz),
        status: s.status,
      })),
      meals: input.plan.meals.map((m) => ({
        id: m.id,
        date: m.date,
        slot: m.slot,
        kind: m.kind,
        recipe: name(m.recipeSlug),
        status: m.status,
      })),
    };
  }
  if (input.adherence14d) ctx.adherence14d = input.adherence14d;
  if (input.memory) ctx.memory = input.memory.slice(0, MAX_MEMORY_BULLETS).map((m) => `${m.key}: ${m.value}`);
  ctx.pantry = [...input.pantry].sort();
  // Habit-only users: no food or body number may reach their screen, so prose may contain no digits at all.
  const allowedNumbers = variant === 'habit_only' ? [] : allowedNumbersFrom(ctx);
  return { variant, contextJson: ctx, allowedNumbers };
}

/** The plan_week menus (user turn) and the validation context the output must pass (§4 plan_week row). */
export function planWeekValidation(p: {
  recipes: RecipeIndex;
  foods: FoodIndex;
  exercises: ExerciseLib;
  template: WorkoutTemplate;
  profile: MealProfile;
  injuries: string[];
  equipment: Equipment;
  shapes: Record<LocalDate, DayShape>;
}): {
  menus: { recipes: ReturnType<typeof recipeMenu>; exercises: ReturnType<typeof exerciseMenu> };
  validation: Omit<ValidationContext, 'allowedNumbers'>;
} {
  const recipes = recipeMenu(p.recipes, p.foods, p.profile);
  const exercises = exerciseMenu(p.template, p.exercises, p.injuries, p.equipment);
  return {
    menus: { recipes, exercises },
    validation: {
      recipeMenu: recipes.map((r) => r.slug),
      exerciseMenu: Object.fromEntries(exercises.map((e) => [e.slotId, e.options.map((o) => o.id)])),
      checkCandidates: (c) => validateCandidates(c, p.recipes, p.profile, p.shapes),
    },
  };
}
