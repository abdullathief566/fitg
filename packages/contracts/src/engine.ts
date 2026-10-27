// Zod mirrors of the engine types the API and the phone bundle carry (camelCase, types.md §2–§9).
// test/type-sync.test.ts asserts at compile time that every schema here infers exactly the engine type, so a change
// on either side fails `tsc`.
import { z } from 'zod';
import {
  ActivitySchema,
  BirthYearSchema,
  BodyWeightKgSchema,
  BudgetTierSchema,
  CookTimePrefSchema,
  CostTierSchema,
  CuisineSchema,
  DietSchema,
  DisplayModeSchema,
  DurationMinSchema,
  EatingModeSchema,
  EquipmentSchema,
  ExperienceSchema,
  GoalSchema,
  GroceryUnitSchema,
  HeightCmSchema,
  HomeDishCategorySchema,
  IdSchema,
  ImportanceSchema,
  IngredientRoleSchema,
  InjurySchema,
  InstantSchema,
  LoadTypeSchema,
  LocalDateSchema,
  LocalTimeSchema,
  LocationPermissionSchema,
  MealKindSchema,
  MealStatusSchema,
  MovementPatternSchema,
  NotificationPermissionSchema,
  PingTypeSchema,
  ProteinClassSchema,
  SessionFeedbackSchema,
  SessionStatusSchema,
  SetStatusSchema,
  SexSchema,
  SlotSchema,
  SplitSchema,
  StartSourceSchema,
  TemplateKeySchema,
  TemplateVariantSchema,
  TimeZoneSchema,
  UnitSchema,
  UnitsPrefSchema,
  WeekStartSchema,
  WeekdaySchema,
  isUnique,
} from './common.ts';

// ───────────────────────── nutrition (types.md §3) ─────────────────────────

export const NutritionSchema = z.strictObject({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
});

/** grams exact; qty rounded for the label. Home Food portions set `homeDishKey` (and `foodKey` = the dish key). */
export const PortionSchema = z.strictObject({
  foodKey: z.string().min(1),
  grams: z.number().nonnegative(),
  unit: UnitSchema,
  qty: z.number().nonnegative(),
  label: z.string(),
  homeDishKey: z.string().min(1).optional(),
});

/** Add-ons are whole units (caps: 2 per slot, 3 per day). */
export const AddonPickSchema = z.strictObject({
  addonKey: z.string().min(1),
  qty: z.number().int().positive(),
});

// ───────────────────────── reference rows (types.md §2, engines.md §2.1) ─────────────────────────

export const FoodRowSchema = z.strictObject({
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  isRaw: z.boolean(),
  yieldFactor: z.number().positive(),
  cookedWithOil: z.boolean(),
  synthetic: z.boolean().optional(),
});

export const FoodUnitSchema = z.strictObject({
  foodKey: z.string().min(1),
  unit: UnitSchema,
  grams: z.number().positive(),
  label: z.string().min(1),
});

export const RecipeIngredientSchema = z.strictObject({
  foodKey: z.string().min(1),
  grams: z.number().positive(),
  unit: UnitSchema,
  qty: z.number().positive(),
  role: IngredientRoleSchema,
  scalable: z.boolean(),
});

export const RecipeRowSchema = z.strictObject({
  slug: z.string().min(1),
  name: z.string().min(1),
  cuisine: CuisineSchema,
  mealSlots: z.array(SlotSchema).min(1),
  dietTags: z.array(DietSchema).min(1),
  allergens: z.array(z.string()),
  cookTimeMin: z.number().int().nonnegative(),
  costTier: CostTierSchema,
  servings: z.number().int().positive(),
  oilTsp: z.number().nonnegative(),
  cookedYieldG: z.number().positive().optional(),
  prep: z.strictObject({ text: z.string().min(1), leadHours: z.number().nonnegative() }).optional(),
  requires: z.array(z.string().min(1)),
  ingredients: z.array(RecipeIngredientSchema).min(1),
  steps: z.array(z.strictObject({ text: z.string().min(1), timerSec: z.number().int().positive().optional() })).min(1),
  scaleRules: z.strictObject({
    minMult: z.number().positive(),
    maxMult: z.number().positive(),
    step: z.number().positive(),
  }),
  proteinAddons: z.array(z.string().min(1)),
  tags: z.array(z.string()),
  isDraft: z.boolean(),
  nutritionPerServing: NutritionSchema,
});

export const HomeDishSchema = z.strictObject({
  key: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  recipeSlug: z.string().min(1),
  unit: UnitSchema,
  gramsPerUnit: z.number().positive(),
  category: HomeDishCategorySchema,
  proteinClass: ProteinClassSchema,
});

export const ProteinAddonSchema = z.strictObject({
  key: z.string().min(1),
  name: z.string().min(1),
  foodKey: z.string().min(1),
  unit: UnitSchema,
  gramsPerUnit: z.number().positive(),
  dietTags: z.array(DietSchema).min(1),
  pantryFoodKey: z.string().min(1),
});

export const ExerciseRowSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  primaryMuscle: z.string().min(1),
  secondaryMuscles: z.array(z.string()),
  movementPattern: MovementPatternSchema,
  equipment: z.array(z.string().min(1)),
  loadType: LoadTypeSchema,
  isMachine: z.boolean(),
  injuryTags: z.array(z.string().min(1)),
  formCues: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  startLoadRatio: z.number().nonnegative(),
  incrementKg: z.number().nonnegative(),
  repMin: z.number().int().positive(),
  repMax: z.number().int().positive(),
  importance: ImportanceSchema,
});

export const TemplateSlotSchema = z.strictObject({
  slotId: z.string().min(1),
  pattern: MovementPatternSchema,
  primaryMuscle: z.string().min(1),
  sets: z.number().int().positive(),
  repMin: z.number().int().positive(),
  repMax: z.number().int().positive(),
  restSec: z.number().int().nonnegative(),
  importance: ImportanceSchema,
  preferred: z.array(z.string().min(1)),
});

export const TemplateSessionSchema = z.strictObject({
  key: TemplateKeySchema,
  name: z.string().min(1),
  importance: z.number().int().min(1).max(3),
  slots: z.array(TemplateSlotSchema).min(1),
});

export const WorkoutTemplateSchema = z.strictObject({
  id: z.string().min(1),
  split: SplitSchema,
  variant: TemplateVariantSchema,
  daysPerWeek: z.array(z.number().int().min(1).max(7)).min(1),
  sessions: z.array(TemplateSessionSchema).min(1),
});

// ───────────────────────── profile and targets (types.md §4, engines.md §1) ─────────────────────────

export const GymSlotSchema = z.strictObject({
  weekday: WeekdaySchema,
  start: LocalTimeSchema,
  durationMin: DurationMinSchema,
});

/** No two gym sessions on one day. */
export const GymScheduleSchema = z
  .array(GymSlotSchema)
  .max(7)
  .refine((slots) => isUnique(slots, (s) => s.weekday), 'Two gym slots on the same weekday');

export const AvailableDaysSchema = z
  .array(WeekdaySchema)
  .max(7)
  .refine((days) => isUnique(days), 'A weekday is listed twice');

/** No snack time → no snack slot. */
export const MealTimesSchema = z.strictObject({
  breakfast: LocalTimeSchema,
  lunch: LocalTimeSchema,
  dinner: LocalTimeSchema,
  snack: LocalTimeSchema.optional(),
});

export const NotificationPrefsSchema = z.strictObject({
  nightBefore: LocalTimeSchema,
  preGymOffsetMin: z.number().int().min(0).max(180),
  timeSensitive: z.boolean(),
  haptics: z.boolean(),
});

export const LearnedTimingSchema = z.strictObject({
  preGymShiftMin: z.number().min(-180).max(180),
  dinnerShiftMin: z.number().min(-180).max(180),
});

export const SafetyFlagsSchema = z.strictObject({
  pregnant: z.boolean().optional(),
  diabetes: z.boolean().optional(),
  glp1: z.boolean().optional(),
  edHistory: z.boolean().optional(),
});

/** Field-level refinements only, so `.partial()` / `.omit()` keep working (Zod 4 refuses them on refined objects). */
export const ProfileSchema = z.strictObject({
  userId: IdSchema,
  firstName: z.string().min(1).max(60).optional(),
  sex: SexSchema,
  birthYear: BirthYearSchema,
  heightCm: HeightCmSchema,
  weightKg: BodyWeightKgSchema,
  goalWeightKg: BodyWeightKgSchema.optional(),
  goal: GoalSchema,
  activity: ActivitySchema,
  experience: ExperienceSchema,
  injuries: z.array(InjurySchema).refine((x) => isUnique(x), 'An injury is listed twice'),
  equipment: EquipmentSchema,
  homeDumbbellsKg: z.array(z.number().positive().max(100)),
  gymSchedule: GymScheduleSchema,
  availableDays: AvailableDaysSchema,
  diet: DietSchema,
  cuisine: CuisineSchema,
  allergies: z.array(z.string().min(1)),
  dislikes: z.array(z.string().min(1)),
  eatingMode: EatingModeSchema,
  wake: LocalTimeSchema,
  sleep: LocalTimeSchema,
  mealTimes: MealTimesSchema,
  cookTimePref: CookTimePrefSchema,
  budgetTier: BudgetTierSchema,
  safetyFlags: SafetyFlagsSchema,
  tz: TimeZoneSchema,
  units: UnitsPrefSchema,
  notificationPrefs: NotificationPrefsSchema,
  learnedTiming: LearnedTimingSchema,
  journeyStartedAt: LocalDateSchema.optional(),
});

export const TargetsBasisSchema = z.strictObject({
  bmr: z.number().positive(),
  activityFactor: z.number().positive(),
  tdee: z.number().positive(),
  adjustPct: z.number(),
  bmi: z.number().positive(),
  weightUsedKg: z.number().positive(),
  floorsApplied: z.boolean(),
  notes: z.array(z.string()),
});

export const TargetsSchema = z.strictObject({
  kcal: z.number().int().nonnegative(),
  proteinG: z.number().int().nonnegative(),
  fatG: z.number().int().nonnegative(),
  carbsG: z.number().int().nonnegative(),
  displayMode: DisplayModeSchema,
  basis: TargetsBasisSchema,
});

export const WeeklyAdjustResultSchema = z.strictObject({
  deltaChange: z.number().int(),
  newDelta: z.number().int().min(-450).max(450),
  stallWeeks: z.number().int().nonnegative(),
  reason: z.string().min(1),
});

// ───────────────────────── plans (types.md §5) ─────────────────────────

export const PrepTaskSchema = z.strictObject({
  forDate: LocalDateSchema,
  text: z.string().min(1),
  at: InstantSchema,
  recipeSlug: z.string().min(1),
});

export const ProblemCodeSchema = z.enum([
  'protein_short',
  'kcal_off',
  'no_candidates',
  'diet',
  'allergen',
  'dislike',
  'cook_time',
  'too_many_breakfasts',
  'cook_once_pairs',
  'unknown_slug',
  'draft',
  'requires_missing',
  'duplicate_in_day',
  'slot_dropped',
  'component',
  'wrong_slot',
]);

export const ProblemSchema = z.strictObject({
  code: ProblemCodeSchema,
  severity: z.enum(['error', 'warn']),
  date: LocalDateSchema.optional(),
  slot: SlotSchema.optional(),
  slug: z.string().min(1).optional(),
  detail: z.string(),
});

export const PlannedMealSchema = z.strictObject({
  id: IdSchema,
  date: LocalDateSchema,
  slot: SlotSchema,
  plannedAt: InstantSchema,
  kind: MealKindSchema,
  recipeSlug: z.string().min(1).optional(),
  homeDishKeys: z.array(z.string().min(1)).optional(),
  multiplier: z.number().positive(),
  portions: z.array(PortionSchema),
  addons: z.array(AddonPickSchema),
  nutrition: NutritionSchema,
  status: MealStatusSchema,
  statusAt: InstantSchema.optional(),
  replacedByLogId: IdSchema.optional(),
  version: z.number().int().min(1),
});

export const PlanDaySchema = z.strictObject({
  id: IdSchema,
  date: LocalDateSchema,
  isGymDay: z.boolean(),
  kcalTarget: z.number().int().nonnegative(),
  proteinTarget: z.number().int().nonnegative(),
  prepTasks: z.array(PrepTaskSchema),
  tomorrowDeltaKcal: z.number().int().min(-200).max(200),
  ok: z.boolean(),
  problems: z.array(ProblemSchema),
});

export const SessionPlanSchema = z.strictObject({
  id: IdSchema,
  date: LocalDateSchema,
  templateKey: TemplateKeySchema,
  name: z.string().min(1),
  plannedStart: InstantSchema,
  plannedDurationMin: DurationMinSchema,
  status: SessionStatusSchema,
  startedAt: InstantSchema.optional(),
  endedAt: InstantSchema.optional(),
  startSource: StartSourceSchema.optional(),
  importance: z.number().int().min(1).max(3),
  movedFromDate: LocalDateSchema.optional(),
  feedback: SessionFeedbackSchema.optional(),
  version: z.number().int().min(1),
});

export const PlannedSetSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  exerciseId: z.string().min(1),
  exerciseOrder: z.number().int().nonnegative(),
  setIndex: z.number().int().nonnegative(),
  targetWeightKg: z.number().nonnegative(),
  targetRepsMin: z.number().int().positive(),
  targetRepsMax: z.number().int().positive(),
  targetReps: z.number().int().positive(),
  restSec: z.number().int().nonnegative(),
  actualWeightKg: z.number().nonnegative().optional(),
  actualReps: z.number().int().nonnegative().optional(),
  status: SetStatusSchema,
  doneAt: InstantSchema.optional(),
  swappedFromExerciseId: z.string().min(1).optional(),
});

export const WeekPlanSchema = z.strictObject({
  weekStart: WeekStartSchema,
  version: z.number().int().min(1),
  generatedBy: z.enum(['ai', 'deterministic']),
  templateId: z.string().min(1),
  days: z.array(PlanDaySchema),
  sessions: z.array(SessionPlanSchema),
  sets: z.array(PlannedSetSchema),
  meals: z.array(PlannedMealSchema),
  note: z.string().optional(),
});

/** What onboard-complete / sync return for a week. */
export const WeekPayloadSchema = WeekPlanSchema;

export const ResolvedFoodSchema = z.strictObject({
  kind: z.enum(['food', 'home_dish', 'recipe', 'generic']),
  key: z.string().min(1),
  name: z.string().min(1),
  standardPortion: PortionSchema,
  nutrition: NutritionSchema,
});

export const GroceryItemSchema = z.strictObject({
  foodKey: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().nonnegative(),
  unit: GroceryUnitSchema,
  group: z.string(),
  checked: z.boolean(),
});

export const RebalanceDiffSchema = z.strictObject({
  itemId: IdSchema,
  slot: SlotSchema,
  field: z.enum(['multiplier', 'addon']),
  from: z.union([z.number(), z.string(), z.null()]),
  to: z.union([z.number(), z.string()]),
});

/** Rows a command or replan changed (types.md §9). */
export const ChangedRowsSchema = z.strictObject({
  days: z.array(PlanDaySchema).optional(),
  sessions: z.array(SessionPlanSchema).optional(),
  sets: z.array(PlannedSetSchema).optional(),
  meals: z.array(PlannedMealSchema).optional(),
  profile: ProfileSchema.partial().optional(),
  grocery: z.array(GroceryItemSchema).optional(),
  removed: z
    .strictObject({
      meals: z.array(IdSchema).optional(),
      sets: z.array(IdSchema).optional(),
      sessions: z.array(IdSchema).optional(),
    })
    .optional(),
});

// ───────────────────────── pings and state (types.md §7, signals-and-pings.md §3) ─────────────────────────

export const ScheduledPingDataSchema = z.strictObject({
  fireDate: LocalDateSchema,
  aboutDate: LocalDateSchema,
  planItemId: IdSchema.optional(),
  sessionId: IdSchema.optional(),
  askMealItemId: IdSchema.optional(),
});

export const ScheduledPingSchema = z.strictObject({
  /** `ping:${fireDate}:${type}` for the pings diffSchedule owns; other modules use their own prefixes. */
  id: z.string().min(1),
  type: PingTypeSchema,
  fireAt: InstantSchema,
  title: z.string().min(1),
  body: z.string(),
  categoryId: z.string().min(1),
  channelId: z.enum(['pings_high', 'pings', 'gym', 'system']),
  sound: z.boolean(),
  interruption: z.enum(['timeSensitive', 'active', 'passive']),
  data: ScheduledPingDataSchema,
});

export const PingEventRowSchema = z.strictObject({
  id: IdSchema,
  pingId: z.string().min(1),
  type: PingTypeSchema,
  scheduledFor: InstantSchema,
  deliveredAt: InstantSchema.optional(),
  actedAt: InstantSchema.optional(),
  action: z.string().min(1).optional(),
  latencyS: z.number().int().nonnegative().optional(),
});

export const PermissionsSchema = z.strictObject({
  notifications: NotificationPermissionSchema,
  location: LocationPermissionSchema,
  exactAlarms: z.boolean().optional(),
});

export const NextStepActionSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  variant: z.enum(['primary', 'secondary', 'quiet']),
});

export const NextStepSchema = z.strictObject({
  kind: z.enum(['workout', 'meal', 'prep', 'rest', 'checkin', 'comeback', 'tomorrow']),
  refId: z.string().min(1).optional(),
  time: InstantSchema.optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  detail: z.string().optional(),
  actions: z.array(NextStepActionSchema),
});
