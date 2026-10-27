// Commands (types.md §9). Devices change plans only through PlanCommands; the coach only proposes CoachCommands.
import { z } from 'zod';
import { DAY_NAMES } from '@fitg/engine';
import type { DayName, Weekday } from '@fitg/engine/types';
import {
  ActivitySchema,
  BodyWeightKgSchema,
  BudgetTierSchema,
  CookTimePrefSchema,
  CuisineSchema,
  DietSchema,
  EatingModeSchema,
  EquipmentSchema,
  ExperienceSchema,
  GoalSchema,
  HeightCmSchema,
  IdSchema,
  InjurySchema,
  LocalDateSchema,
  LocalTimeSchema,
  QuarterHourTimeSchema,
  RecipeSlugSchema,
  SessionFeedbackSchema,
  SnakeKeySchema,
  UnitsPrefSchema,
  UuidSchema,
  WeekStartSchema,
  isUnique,
} from './common.ts';
import {
  AvailableDaysSchema,
  GymScheduleSchema,
  MealTimesSchema,
  NotificationPrefsSchema,
  SafetyFlagsSchema,
} from './engine.ts';

const LaterMinutesSchema = z.enum(['30', '60', '90']);

// ───────────────────────── patches ─────────────────────────

/** App-originated (the user typed or picked it). */
export const ProfilePrefsPatchSchema = z.strictObject({
  gymSchedule: GymScheduleSchema.optional(),
  availableDays: AvailableDaysSchema.optional(),
  mealTimes: MealTimesSchema.optional(),
  cookTimePref: CookTimePrefSchema.optional(),
  budgetTier: BudgetTierSchema.optional(),
  eatingMode: EatingModeSchema.optional(),
  dislikes: z.array(z.string().min(1)).optional(),
  notificationPrefs: NotificationPrefsSchema.partial().optional(),
  units: UnitsPrefSchema.optional(),
  homeDumbbellsKg: z.array(z.number().positive().max(100)).optional(),
});

/** Body numbers and goal changes: only through profile-update from Settings, never from AI. */
export const BodyGoalPatchSchema = z.strictObject({
  weightKg: BodyWeightKgSchema.optional(),
  heightCm: HeightCmSchema.optional(),
  goalWeightKg: BodyWeightKgSchema.nullable().optional(),
  goal: GoalSchema.optional(),
  activity: ActivitySchema.optional(),
  experience: ExperienceSchema.optional(),
  injuries: z
    .array(InjurySchema)
    .refine((x) => isUnique(x), 'An injury is listed twice')
    .optional(),
  equipment: EquipmentSchema.optional(),
  diet: DietSchema.optional(),
  cuisine: CuisineSchema.optional(),
  allergies: z.array(z.string().min(1)).optional(),
  safetyFlags: SafetyFlagsSchema.optional(),
});

/** Day names, not numbers: the only number a coach tool may carry is a position (exerciseOrder). */
export const DayNameSchema = z.enum(DAY_NAMES);

/** What the coach may change in preferences. Enum strings, not numbers; coach-confirm converts them. */
export const CoachPrefsPatchSchema = z.strictObject({
  gymStart: LocalTimeSchema.optional(),
  gymDays: z
    .array(DayNameSchema)
    .max(7)
    .refine((x) => isUnique(x), 'A day is listed twice')
    .optional(),
  dinnerTime: LocalTimeSchema.optional(),
  cookTimePref: z.enum(['10', '20', '30']).optional(),
  sessionLength: z.enum(['45', '60', '75']).optional(),
  dislikesAdd: z.array(z.string().min(1)).optional(),
});

// ───────────────────────── PlanCommand ─────────────────────────

/** CommandBase: `id` = client uuid (idempotency); `basePlanVersion` = the active weekly_plans.version the device saw. */
const commandBase = {
  id: IdSchema,
  basePlanVersion: z.number().int().min(1),
};

export const PlanCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...commandBase, kind: z.literal('SwapMeal'), itemId: IdSchema, recipeSlug: RecipeSlugSchema }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('SetMealStatus'),
    itemId: IdSchema,
    status: z.enum(['eaten', 'half', 'replaced', 'skipped']),
    logId: IdSchema.optional(),
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('SetHomeMeal'),
    itemId: IdSchema,
    homeDishKeys: z
      .array(SnakeKeySchema)
      .min(1)
      .max(8)
      .refine((x) => isUnique(x), 'A dish is listed twice'),
  }),
  z.strictObject({ ...commandBase, kind: z.literal('SetEatOutPick'), itemId: IdSchema, logId: IdSchema }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('SwapExercise'),
    sessionId: IdSchema,
    exerciseOrder: z.number().int().nonnegative(),
    exerciseId: SnakeKeySchema,
  }),
  z.strictObject({ ...commandBase, kind: z.literal('MoveSession'), sessionId: IdSchema, toDate: LocalDateSchema }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('SetSessionTime'),
    sessionId: IdSchema,
    start: QuarterHourTimeSchema,
  }),
  z.strictObject({ ...commandBase, kind: z.literal('SkipSession'), sessionId: IdSchema }),
  z.strictObject({ ...commandBase, kind: z.literal('LaterSession'), sessionId: IdSchema, minutes: LaterMinutesSchema }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('SetSessionFeedback'),
    sessionId: IdSchema,
    feedback: SessionFeedbackSchema,
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('TickGrocery'),
    weekStart: WeekStartSchema,
    foodKey: SnakeKeySchema,
    checked: z.boolean(),
  }),
  z.strictObject({ ...commandBase, kind: z.literal('UpdatePrefs'), patch: ProfilePrefsPatchSchema }),
]);

export const PLAN_COMMAND_KINDS = [
  'SwapMeal',
  'SetMealStatus',
  'SetHomeMeal',
  'SetEatOutPick',
  'SwapExercise',
  'MoveSession',
  'SetSessionTime',
  'SkipSession',
  'LaterSession',
  'SetSessionFeedback',
  'TickGrocery',
  'UpdatePrefs',
] as const;

/**
 * A PlanCommand as the server stores it: `plan_commands.id` is a uuid column, so commands that arrive through
 * plan-command / sync-push must carry a uuid id (a malformed id is a 400, not a failed insert).
 */
export const StoredPlanCommandSchema = PlanCommandSchema.refine((c) => UuidSchema.safeParse(c.id).success, {
  message: 'Command id must be a uuid',
  path: ['id'],
});

// ───────────────────────── CoachCommand ─────────────────────────

/**
 * What the coach's `propose_plan_change` tool may contain: no command id, no plan version, and no numeric value
 * fields — the only number is `SwapExercise.exerciseOrder` (a position). Ids are plain non-empty strings (mock
 * fixtures use ids like "sess-2026-11-04").
 */
export const CoachCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('SwapMeal'), itemId: IdSchema, recipeSlug: RecipeSlugSchema }),
  z.strictObject({
    kind: z.literal('SwapExercise'),
    sessionId: IdSchema,
    exerciseOrder: z.number().int().nonnegative(),
    exerciseId: SnakeKeySchema,
  }),
  z.strictObject({ kind: z.literal('MoveSession'), sessionId: IdSchema, toDate: LocalDateSchema }),
  z.strictObject({ kind: z.literal('SetSessionTime'), sessionId: IdSchema, start: QuarterHourTimeSchema }),
  z.strictObject({ kind: z.literal('SkipSession'), sessionId: IdSchema }),
  z.strictObject({ kind: z.literal('LaterSession'), sessionId: IdSchema, minutes: LaterMinutesSchema }),
  z.strictObject({ kind: z.literal('UpdatePrefs'), patch: CoachPrefsPatchSchema }),
]);

/** A coach proposal awaiting the user's Confirm (`chat_messages.proposal`, coach-chat response). */
export const CoachProposalSchema = z.strictObject({
  proposalId: UuidSchema,
  commands: z.array(CoachCommandSchema).min(1),
  why: z.string().min(1),
});

/** 'mon' → 0 … 'sun' → 6 (coach-confirm converts gymDays with this). */
export function weekdayOfDayName(day: DayName): Weekday {
  const i = DAY_NAMES.indexOf(day);
  if (i < 0) throw new Error(`Unknown day name: ${day}`);
  return i as Weekday;
}
