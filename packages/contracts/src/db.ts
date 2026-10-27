// Strict Zod row schemas for every table in docs/20-engineering/schema.sql (snake_case column names, exactly).
//
// A row schema describes a row as READ BACK (`select *`): every column is present; nullable columns may be null.
// The generated `search` tsvector columns (exercises, foods, recipes) are optional — PostgREST returns them only
// when selected, and nothing in the app writes or reads them.
// numeric columns are JS numbers (PostgREST/supabase-js and the device's SQLite mirror both return numbers).
// jsonb columns are typed where schema.sql comments or the docs define them; unspecified shapes are JSON objects.
import { z } from 'zod';
import { CALL_TYPES, CheckinNarrativeOut, MenuParseOut, OffplanParseOut } from './ai.ts';
import {
  ActivitySchema,
  AliasLangSchema,
  BirthYearSchema,
  BodyWeightKgSchema,
  BudgetTierSchema,
  CookTimePrefSchema,
  CostTierSchema,
  CuisineSchema,
  DbTimeSchema,
  DietSchema,
  DisplayModeSchema,
  DurationMinSchema,
  EatingModeSchema,
  EquipmentSchema,
  EventTypeSchema,
  ExperienceSchema,
  GoalSchema,
  GroceryUnitSchema,
  HeightCmSchema,
  HomeDishCategorySchema,
  ImportanceSchema,
  IngredientRoleSchema,
  InjurySchema,
  InstantSchema,
  JsonObjectSchema,
  LoadTypeSchema,
  LocalDateSchema,
  LocalTimeSchema,
  LocationPermissionSchema,
  MealKindSchema,
  MealStatusSchema,
  MovementPatternSchema,
  NotificationPermissionSchema,
  PingTypeSchema,
  PlaceKindSchema,
  ProteinClassSchema,
  RecipeSlugSchema,
  RejectReasonSchema,
  SessionFeedbackSchema,
  SessionStatusSchema,
  SetStatusSchema,
  SexSchema,
  SlotSchema,
  SnakeKeySchema,
  SplitSchema,
  StartSourceSchema,
  TemplateKeySchema,
  TemplateVariantSchema,
  TimeZoneSchema,
  UnitSchema,
  UnitsPrefSchema,
  UuidSchema,
  WeekStartSchema,
  WeekdaySchema,
  isUnique,
} from './common.ts';
import { CoachProposalSchema, PlanCommandSchema } from './commands.ts';
import { ProblemSchema, ScheduledPingDataSchema, TemplateSessionSchema } from './engine.ts';
import { eventPayloadSchemaFor } from './events.ts';

// ───────────────────────── enums that exist only in the database ─────────────────────────

export const FoodSourceSchema = z.enum(['usda', 'off', 'ifct', 'curated']);
export const FoodLogSourceSchema = z.enum(['pick', 'photo', 'text', 'menu', 'voice']); // 'voice' reserved for v2
export const PlanStatusSchema = z.enum(['draft', 'active', 'superseded']);
export const PlanSourceSchema = z.enum(['ai', 'deterministic']);
export const TargetReasonSchema = z.enum(['onboarding', 'weekly_adjust', 'recompute', 'manual']);
export const PantryKindSchema = z.enum(['staple', 'ticked_grocery']);
export const PingStatusSchema = z.enum(['scheduled', 'delivered', 'acted', 'expired', 'cancelled']);
export const CommandStatusSchema = z.enum(['applied', 'rejected']);
export const WeighSourceSchema = z.enum(['manual', 'healthkit', 'health_connect']);
export const MemoryKindSchema = z.enum(['preference', 'constraint', 'observation', 'feedback']);
export const MemorySourceSchema = z.enum(['onboarding', 'chat', 'inferred', 'feedback']);
export const ChatRoleSchema = z.enum(['user', 'assistant', 'system']);
export const AiCallStatusSchema = z.enum(['ok', 'refused', 'invalid', 'error', 'fallback_used']);
export const FoodLogStatusSchema = z.enum(['pending', 'parsed', 'confirmed']);
export const CopySourceSchema = z.enum(['template', 'ai']);
export const AiProviderSchema = z.enum(['mock', 'anthropic']);
export const PlatformSchema = z.enum(['ios', 'android']);

/** Every Postgres enum in schema.sql → its Zod enum (a test checks the value sets match). */
export const DbEnums = {
  sex_t: SexSchema,
  goal_t: GoalSchema,
  activity_t: ActivitySchema,
  experience_t: ExperienceSchema,
  equipment_t: EquipmentSchema,
  diet_t: DietSchema,
  cuisine_t: CuisineSchema,
  eating_mode_t: EatingModeSchema,
  slot_t: SlotSchema,
  unit_t: UnitSchema,
  food_source_t: FoodSourceSchema,
  ingredient_role_t: IngredientRoleSchema,
  movement_pattern_t: MovementPatternSchema,
  load_type_t: LoadTypeSchema,
  split_t: SplitSchema,
  template_variant_t: TemplateVariantSchema,
  template_key_t: TemplateKeySchema,
  session_status_t: SessionStatusSchema,
  start_source_t: StartSourceSchema,
  feedback_t: SessionFeedbackSchema,
  set_status_t: SetStatusSchema,
  meal_status_t: MealStatusSchema,
  food_log_source_t: FoodLogSourceSchema,
  place_kind_t: PlaceKindSchema,
  plan_status_t: PlanStatusSchema,
  plan_source_t: PlanSourceSchema,
  target_reason_t: TargetReasonSchema,
  display_mode_t: DisplayModeSchema,
  pantry_kind_t: PantryKindSchema,
  ping_type_t: PingTypeSchema,
  ping_status_t: PingStatusSchema,
  event_type_t: EventTypeSchema,
  command_status_t: CommandStatusSchema,
  weigh_source_t: WeighSourceSchema,
  memory_kind_t: MemoryKindSchema,
  memory_source_t: MemorySourceSchema,
  chat_role_t: ChatRoleSchema,
  ai_call_status_t: AiCallStatusSchema,
} as const;

// ───────────────────────── shared column types ─────────────────────────

const Text = z.string();
const NonEmpty = z.string().min(1);
const Int = z.number().int();
const NonNegInt = z.number().int().nonnegative();
const NonNeg = z.number().nonnegative();
/** The generated tsvector column: optional (see the header). */
const Search = z.string().optional();

// ───────────────────────── jsonb shapes (snake_case unless the SQL comment says otherwise) ─────────────────────────

/** {kcal, protein_g, carbs_g, fat_g} — computed by code. */
export const DbNutritionSchema = z.strictObject({
  kcal: NonNeg,
  protein_g: NonNeg,
  carbs_g: NonNeg,
  fat_g: NonNeg,
});

/** profiles.gym_schedule item: {weekday 0-6 (0 = Mon), start "18:30", duration_min 45|60|75}. */
export const DbGymSlotSchema = z.strictObject({
  weekday: WeekdaySchema,
  start: LocalTimeSchema,
  duration_min: DurationMinSchema,
});

/** profiles.meal_times: {breakfast, lunch, dinner, snack?} as 'HH:MM'. */
export const DbMealTimesSchema = z.strictObject({
  breakfast: LocalTimeSchema,
  lunch: LocalTimeSchema,
  dinner: LocalTimeSchema,
  snack: LocalTimeSchema.optional(),
});

/** profiles.safety_flags: {pregnant, diabetes, glp1, ed_history} (column default '{}'). */
export const DbSafetyFlagsSchema = z.strictObject({
  pregnant: z.boolean().optional(),
  diabetes: z.boolean().optional(),
  glp1: z.boolean().optional(),
  ed_history: z.boolean().optional(),
});

/** profiles.notification_prefs. The column defaults to '{}', so every key is optional; mappers fill the defaults. */
export const DbNotificationPrefsSchema = z.strictObject({
  night_before: LocalTimeSchema.optional(),
  pre_gym_offset_min: z.number().int().min(0).max(180).optional(),
  time_sensitive: z.boolean().optional(),
  haptics: z.boolean().optional(),
});

/** profiles.learned_timing: {pre_gym_shift_min, dinner_shift_min}. */
export const DbLearnedTimingSchema = z.strictObject({
  pre_gym_shift_min: z.number().min(-180).max(180),
  dinner_shift_min: z.number().min(-180).max(180),
});

/** targets.basis: {bmr, activity_factor, tdee, adjust_pct, bmi, weight_used_kg, floors_applied, notes[]}. */
export const DbTargetsBasisSchema = z.strictObject({
  bmr: z.number().positive(),
  activity_factor: z.number().positive(),
  tdee: z.number().positive(),
  adjust_pct: z.number(),
  bmi: z.number().positive(),
  weight_used_kg: z.number().positive(),
  floors_applied: z.boolean(),
  notes: z.array(Text),
});

/** plan_days.prep_tasks item: {for_date, text, at, recipe_slug}. */
export const DbPrepTaskSchema = z.strictObject({
  for_date: LocalDateSchema,
  text: NonEmpty,
  at: InstantSchema,
  recipe_slug: NonEmpty,
});

/**
 * meal_items.portions item: {food_id, grams, unit, qty, label}. A Home Food portion points at its dish
 * (`home_dish_id`) and an eat-out pick may point at a recipe (`recipe_id`) — exactly one reference id is set.
 */
export const DbPortionSchema = z
  .strictObject({
    food_id: UuidSchema.optional(),
    home_dish_id: UuidSchema.optional(),
    recipe_id: UuidSchema.optional(),
    grams: NonNeg,
    unit: UnitSchema,
    qty: NonNeg,
    label: Text,
  })
  .refine(
    (p) => [p.food_id, p.home_dish_id, p.recipe_id].filter((x) => x !== undefined).length === 1,
    'A portion needs exactly one of food_id, home_dish_id, recipe_id',
  );

/** meal_items.addons item: {addon_key, qty}. */
export const DbAddonPickSchema = z.strictObject({
  addon_key: NonEmpty,
  qty: z.number().int().positive(),
});

/** recipes.steps item: {text, timer_sec?}. */
export const DbRecipeStepSchema = z.strictObject({
  text: NonEmpty,
  timer_sec: z.number().int().positive().optional(),
});

/** recipes.scale_rules: {min_mult, max_mult, step}. */
export const DbScaleRulesSchema = z.strictObject({
  min_mult: z.number().positive(),
  max_mult: z.number().positive(),
  step: z.number().positive(),
});

/** recipes.prep: {text, lead_hours}. */
export const DbRecipePrepSchema = z.strictObject({
  text: NonEmpty,
  lead_hours: NonNeg,
});

/** workout_sessions.summary.prs item (engine `PR`). */
export const DbPrSchema = z.strictObject({
  exercise_id: NonEmpty,
  kind: z.enum(['weight', 'reps']),
  weight_kg: NonNeg,
  reps: NonNegInt,
});

/** workout_sessions.summary: {prs:[], vs_last:{}, next_time:[]} — vs_last / next_time aren't specified yet (G3, Phase 4). */
export const DbSessionSummarySchema = z.strictObject({
  prs: z.array(DbPrSchema),
  vs_last: JsonObjectSchema,
  next_time: z.array(z.json()),
});

/**
 * food_logs.items item. schema.sql's comment says {food_id, grams, nutrition}, but Pick logs can be recipes or
 * home dishes, so an item is ResolvedFood-shaped: what it is (`kind` + stable `key`), how much, and its nutrition.
 */
export const DbFoodLogItemSchema = z.strictObject({
  kind: z.enum(['food', 'home_dish', 'recipe', 'generic']),
  key: NonEmpty,
  name: NonEmpty,
  grams: NonNeg,
  unit: UnitSchema,
  qty: NonNeg,
  label: Text,
  nutrition: DbNutritionSchema,
});

/** food_logs.pending_question: {text, options[]}. */
export const DbPendingQuestionSchema = z.strictObject({
  text: NonEmpty,
  options: z.array(NonEmpty).min(1),
});

/** grocery_lists.items item: {food_id, name, qty, unit, group, checked}. */
export const DbGroceryItemSchema = z.strictObject({
  food_id: UuidSchema,
  name: NonEmpty,
  qty: NonNeg,
  unit: GroceryUnitSchema,
  group: Text,
  checked: z.boolean(),
});

/** ping_schedule.payload: {title, body, categoryId, data} (camelCase, as the device built it). */
export const DbPingPayloadSchema = z.strictObject({
  title: NonEmpty,
  body: Text,
  categoryId: NonEmpty,
  data: ScheduledPingDataSchema,
});

/** checkins.adherence: {workouts_done, workouts_planned, meal_logged_pct (0–1), protein_days}. */
export const DbAdherenceSchema = z.strictObject({
  workouts_done: NonNegInt,
  workouts_planned: NonNegInt,
  meal_logged_pct: z.number().min(0).max(1),
  protein_days: z.number().int().min(0).max(7),
});

/** chat_messages.content: VERBATIM API content blocks (or the text of an appended "App context" system message). */
export const DbChatContentSchema = z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]);

// ───────────────────────── reference tables ─────────────────────────

export const ExercisesRowSchema = z
  .strictObject({
    id: SnakeKeySchema,
    source_name: Text.nullable(),
    name: NonEmpty,
    primary_muscle: NonEmpty,
    secondary_muscles: z.array(Text),
    movement_pattern: MovementPatternSchema,
    equipment: z.array(NonEmpty),
    load_type: LoadTypeSchema,
    is_machine: z.boolean(),
    level: NonEmpty,
    injury_tags: z.array(InjurySchema),
    form_cues: z.tuple([NonEmpty, NonEmpty, NonEmpty]),
    image_paths: z.array(Text),
    start_load_ratio: z.number().min(0).max(9.999),
    increment_kg: z.number().min(0).max(99.99),
    rep_min: z.number().int().positive(),
    rep_max: z.number().int().positive(),
    importance: ImportanceSchema,
    search: Search,
  })
  .refine((r) => r.rep_max >= r.rep_min, { message: 'rep_max must be ≥ rep_min', path: ['rep_max'] });

export const FoodsRowSchema = z.strictObject({
  id: UuidSchema,
  key: SnakeKeySchema,
  source: FoodSourceSchema,
  source_id: Text.nullable(),
  name: NonEmpty,
  name_hi: Text.nullable(),
  category: NonEmpty,
  kcal: NonNeg,
  protein_g: NonNeg,
  carbs_g: NonNeg,
  fat_g: NonNeg,
  fiber_g: NonNeg,
  is_raw: z.boolean(),
  yield_factor: z.number().positive(),
  is_generic: z.boolean(),
  cooked_with_oil: z.boolean(),
  search: Search,
});

export const FoodAliasesRowSchema = z.strictObject({
  id: UuidSchema,
  food_id: UuidSchema,
  alias: NonEmpty,
  lang: AliasLangSchema,
});

export const FoodUnitsRowSchema = z.strictObject({
  id: UuidSchema,
  food_id: UuidSchema,
  unit: UnitSchema,
  grams: z.number().positive(),
  label: NonEmpty,
});

export const RecipesRowSchema = z.strictObject({
  id: UuidSchema,
  slug: RecipeSlugSchema,
  name: NonEmpty,
  cuisine: CuisineSchema,
  meal_slots: z.array(SlotSchema).min(1),
  diet_tags: z.array(DietSchema).min(1),
  allergens: z.array(Text),
  cook_time_min: NonNegInt,
  cost_tier: CostTierSchema,
  servings: z.number().int().positive(),
  steps: z.array(DbRecipeStepSchema),
  oil_tsp: NonNeg,
  cooked_yield_g: z.number().positive().nullable(),
  nutrition_per_serving: DbNutritionSchema,
  scale_rules: DbScaleRulesSchema,
  protein_addon_keys: z.array(NonEmpty),
  tags: z.array(Text),
  requires: z.array(NonEmpty),
  prep: DbRecipePrepSchema.nullable(),
  is_draft: z.boolean(),
  search: Search,
});

export const RecipeIngredientsRowSchema = z.strictObject({
  id: UuidSchema,
  recipe_id: UuidSchema,
  food_id: UuidSchema,
  grams: z.number().positive(),
  household_unit: UnitSchema,
  household_qty: NonNeg,
  role: IngredientRoleSchema,
  scalable: z.boolean(),
  sort: Int,
});

export const HomeDishesRowSchema = z.strictObject({
  id: UuidSchema,
  key: SnakeKeySchema,
  name: NonEmpty,
  aliases: z.array(Text),
  recipe_id: UuidSchema,
  unit: UnitSchema,
  grams_per_unit: z.number().positive(),
  category: HomeDishCategorySchema,
  protein_class: ProteinClassSchema,
});

export const ProteinAddonsRowSchema = z.strictObject({
  id: UuidSchema,
  key: SnakeKeySchema,
  name: NonEmpty,
  food_id: UuidSchema,
  unit: UnitSchema,
  grams_per_unit: z.number().positive(),
  diet_tags: z.array(DietSchema).min(1),
  pantry_food_id: UuidSchema.nullable(),
});

export const WorkoutTemplatesRowSchema = z.strictObject({
  id: NonEmpty,
  name: NonEmpty,
  days_per_week: z.array(z.number().int().min(1).max(7)).min(1),
  split: SplitSchema,
  variant: TemplateVariantSchema,
  /** TemplateSession[] (engines.md §2.1) — camelCase, as the engine reads it. */
  sessions: z.array(TemplateSessionSchema).min(1),
});

// ───────────────────────── per-user tables ─────────────────────────

export const ProfilesRowSchema = z.strictObject({
  user_id: UuidSchema,
  display_name: Text.nullable(),
  sex: SexSchema,
  birth_year: BirthYearSchema,
  height_cm: HeightCmSchema,
  weight_kg: BodyWeightKgSchema,
  goal_weight_kg: BodyWeightKgSchema.nullable(),
  goal: GoalSchema,
  activity: ActivitySchema,
  experience: ExperienceSchema,
  injuries: z.array(InjurySchema),
  equipment: EquipmentSchema,
  home_dumbbells_kg: z.array(z.number().positive().max(100)),
  gym_schedule: z
    .array(DbGymSlotSchema)
    .refine((s) => isUnique(s, (x) => x.weekday), 'Two gym slots on the same weekday'),
  available_days: z.array(WeekdaySchema).refine((d) => isUnique(d), 'A weekday is listed twice'),
  diet: DietSchema,
  cuisine_pref: CuisineSchema,
  allergies: z.array(NonEmpty),
  dislikes: z.array(NonEmpty),
  eating_mode: EatingModeSchema,
  wake_time: DbTimeSchema,
  sleep_time: DbTimeSchema,
  meal_times: DbMealTimesSchema,
  cook_time_pref: CookTimePrefSchema,
  budget_tier: BudgetTierSchema,
  safety_flags: DbSafetyFlagsSchema,
  timezone: TimeZoneSchema,
  units: UnitsPrefSchema,
  notification_prefs: DbNotificationPrefsSchema,
  learned_timing: DbLearnedTimingSchema,
  onboarding_completed_at: InstantSchema.nullable(),
  journey_started_at: LocalDateSchema.nullable(),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const TargetsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  effective_from: LocalDateSchema,
  kcal: NonNegInt,
  protein_g: NonNegInt,
  carbs_g: NonNegInt,
  fat_g: NonNegInt,
  kcal_delta: z.number().int().min(-450).max(450),
  basis: DbTargetsBasisSchema,
  reason: TargetReasonSchema,
  display_mode: DisplayModeSchema,
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const PlacesRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  kind: PlaceKindSchema,
  name: NonEmpty,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(100).max(500),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const WeeklyPlansRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  week_start: WeekStartSchema,
  version: z.number().int().min(1),
  status: PlanStatusSchema,
  generated_by: PlanSourceSchema,
  ai_call_id: UuidSchema.nullable(),
  summary: Text.nullable(),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const PlanDaysRowSchema = z.strictObject({
  id: UuidSchema,
  weekly_plan_id: UuidSchema,
  user_id: UuidSchema,
  date: LocalDateSchema,
  is_gym_day: z.boolean(),
  kcal_target: NonNegInt,
  protein_target: NonNegInt,
  prep_tasks: z.array(DbPrepTaskSchema),
  tomorrow_delta_kcal: z.number().int().min(-200).max(200),
  ok: z.boolean(),
  /** Problem[] (engine shape; its keys are single words, so camelCase = snake_case). */
  problems: z.array(ProblemSchema),
  updated_at: InstantSchema,
});

export const WorkoutSessionsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  plan_day_id: UuidSchema,
  date: LocalDateSchema,
  template_key: TemplateKeySchema,
  name: NonEmpty,
  planned_start: InstantSchema,
  planned_duration_min: DurationMinSchema,
  status: SessionStatusSchema,
  started_at: InstantSchema.nullable(),
  ended_at: InstantSchema.nullable(),
  start_source: StartSourceSchema.nullable(),
  importance: z.number().int().min(1).max(3),
  moved_from_date: LocalDateSchema.nullable(),
  feedback: SessionFeedbackSchema.nullable(),
  summary: DbSessionSummarySchema.nullable(),
  version: z.number().int().min(1),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const WorkoutSetsRowSchema = z.strictObject({
  id: UuidSchema,
  session_id: UuidSchema,
  user_id: UuidSchema,
  exercise_id: NonEmpty,
  exercise_order: NonNegInt,
  set_index: NonNegInt,
  target_weight_kg: NonNeg,
  target_reps_min: z.number().int().positive(),
  target_reps_max: z.number().int().positive(),
  target_reps: z.number().int().positive(),
  rest_sec: NonNegInt,
  actual_weight_kg: NonNeg.nullable(),
  actual_reps: NonNegInt.nullable(),
  status: SetStatusSchema,
  done_at: InstantSchema.nullable(),
  swapped_from_exercise_id: NonEmpty.nullable(),
  updated_at: InstantSchema,
});

export const ExerciseProgressRowSchema = z.strictObject({
  user_id: UuidSchema,
  exercise_id: NonEmpty,
  current_weight_kg: NonNeg,
  miss_streak: NonNegInt,
  hit_top_last: z.boolean(),
  pr_weight_kg: NonNeg.nullable(),
  pr_reps: NonNegInt.nullable(),
  last_session_id: UuidSchema.nullable(),
  updated_at: InstantSchema,
});

export const FoodLogsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  date: LocalDateSchema,
  slot: SlotSchema,
  source: FoodLogSourceSchema,
  raw_input: Text.nullable(),
  photo_path: NonEmpty.nullable(),
  /** AI output kept as returned: offplan_parse (photo/text) or menu_parse (menu) — names/units/qty only. */
  parsed: z.union([OffplanParseOut, MenuParseOut]).nullable(),
  items: z.array(DbFoodLogItemSchema),
  nutrition: DbNutritionSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: FoodLogStatusSchema,
  pending_question: DbPendingQuestionSchema.nullable(),
  photo_deleted_at: InstantSchema.nullable(),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const MealItemsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  plan_day_id: UuidSchema,
  date: LocalDateSchema,
  slot: SlotSchema,
  planned_at: InstantSchema,
  kind: MealKindSchema,
  recipe_id: UuidSchema.nullable(),
  home_dish_ids: z.array(UuidSchema).nullable(),
  multiplier: z.number().positive(),
  portions: z.array(DbPortionSchema),
  addons: z.array(DbAddonPickSchema),
  nutrition: DbNutritionSchema,
  status: MealStatusSchema,
  status_at: InstantSchema.nullable(),
  replaced_by_log_id: UuidSchema.nullable(),
  version: z.number().int().min(1),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const FoodResolutionMissesRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema.nullable(),
  query: NonEmpty,
  lang: Text.nullable(),
  created_at: InstantSchema,
});

export const PantryItemsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  food_id: UuidSchema,
  label: NonEmpty,
  kind: PantryKindSchema,
  expires_at: InstantSchema.nullable(),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const GroceryListsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  week_start: WeekStartSchema,
  items: z.array(DbGroceryItemSchema),
  updated_at: InstantSchema,
});

export const PingScheduleRowSchema = z.strictObject({
  /** '<user_id>:ping:<fireDate>:<type>' (the device id prefixed with the user id by sync-push). */
  id: NonEmpty,
  user_id: UuidSchema,
  date: LocalDateSchema,
  type: PingTypeSchema,
  fire_at: InstantSchema,
  payload: DbPingPayloadSchema,
  copy_source: CopySourceSchema,
  status: PingStatusSchema,
  updated_at: InstantSchema,
});

export const PingEventsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  ping_id: NonEmpty,
  type: PingTypeSchema,
  scheduled_for: InstantSchema,
  delivered_at: InstantSchema.nullable(),
  acted_at: InstantSchema.nullable(),
  action: NonEmpty.nullable(),
  latency_s: Int.nullable(),
  context: JsonObjectSchema.nullable(),
  created_at: InstantSchema,
});

/** `events` table row. The payload is validated for its `type` (types.md §8) — see also events.ts `EventRowSchema`. */
export const EventsRowSchema = z
  .strictObject({
    id: UuidSchema,
    user_id: UuidSchema,
    device_id: NonEmpty,
    type: EventTypeSchema,
    at: InstantSchema,
    payload: JsonObjectSchema,
    received_at: InstantSchema,
  })
  .superRefine((row, ctx) => {
    const parsed = eventPayloadSchemaFor(row.type).safeParse(row.payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['payload', ...issue.path] });
      }
    }
  });

export const PlanCommandsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  /** The PlanCommand as received (contracts). */
  command: PlanCommandSchema,
  status: CommandStatusSchema,
  reason: RejectReasonSchema.nullable(),
  received_at: InstantSchema,
});

export const CheckinsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  week_start: WeekStartSchema,
  weight_kg: BodyWeightKgSchema.nullable(),
  energy: z.number().int().min(1).max(3).nullable(),
  hunger: z.number().int().min(1).max(3).nullable(),
  soreness: z.number().int().min(1).max(3).nullable(),
  adherence: DbAdherenceSchema.nullable(),
  kcal_adjust_applied: Int,
  /** {headline, body, nextWeekFocus} — validated AI prose (checkin_narrative). */
  narrative: CheckinNarrativeOut.nullable(),
  completed_at: InstantSchema.nullable(),
  updated_at: InstantSchema,
});

export const WeighInsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  at: InstantSchema,
  weight_kg: BodyWeightKgSchema,
  source: WeighSourceSchema,
  updated_at: InstantSchema,
});

export const AgentMemoryRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  kind: MemoryKindSchema,
  key: NonEmpty,
  value: NonEmpty,
  confidence: z.number().min(0).max(1),
  source: MemorySourceSchema,
  last_confirmed_at: InstantSchema,
  expires_at: InstantSchema.nullable(),
  created_at: InstantSchema,
  updated_at: InstantSchema,
});

export const ChatThreadsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  started_at: InstantSchema,
  seed_summary: Text.nullable(),
  system_hash: NonEmpty,
  message_count: NonNegInt,
  closed_at: InstantSchema.nullable(),
});

export const ChatMessagesRowSchema = z.strictObject({
  id: UuidSchema,
  thread_id: UuidSchema,
  user_id: UuidSchema,
  seq: NonNegInt,
  role: ChatRoleSchema,
  content: DbChatContentSchema,
  proposal: CoachProposalSchema.nullable(),
  created_at: InstantSchema,
});

export const SubscriptionsRowSchema = z.strictObject({
  user_id: UuidSchema,
  rc_app_user_id: NonEmpty,
  entitlement_active: z.boolean(),
  product_id: Text.nullable(),
  store: Text.nullable(),
  status: Text.nullable(),
  trial_ends_at: InstantSchema.nullable(),
  expires_at: InstantSchema.nullable(),
  will_renew: z.boolean().nullable(),
  /** The RevenueCat event as received (their shape). */
  raw: JsonObjectSchema.nullable(),
  updated_at: InstantSchema,
});

export const AiCallsRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema.nullable(),
  call_type: z.enum(CALL_TYPES),
  provider: AiProviderSchema,
  model: NonEmpty,
  input_tokens: NonNegInt,
  output_tokens: NonNegInt,
  cache_read_tokens: NonNegInt,
  cache_write_tokens: NonNegInt,
  cost_usd: NonNeg,
  latency_ms: NonNegInt.nullable(),
  status: AiCallStatusSchema,
  stop_reason: Text.nullable(),
  refusal_category: Text.nullable(),
  validated: z.boolean(),
  error: Text.nullable(),
  batch_id: Text.nullable(),
  created_at: InstantSchema,
});

export const AiBatchesRowSchema = z.strictObject({
  /** Anthropic batch id. */
  id: NonEmpty,
  kind: NonEmpty,
  week_start: WeekStartSchema,
  submitted_at: InstantSchema,
  status: NonEmpty,
  request_count: NonNegInt,
  ended_at: InstantSchema.nullable(),
});

export const DevicesRowSchema = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  device_id: NonEmpty,
  platform: PlatformSchema,
  push_token: Text.nullable(),
  app_version: Text.nullable(),
  tz: TimeZoneSchema.nullable(),
  notif_permission: NotificationPermissionSchema.nullable(),
  location_permission: LocationPermissionSchema.nullable(),
  last_seen_at: InstantSchema,
});

// ───────────────────────── registry ─────────────────────────

/** Table name → row schema, in schema.sql order (35 tables). */
export const DbTables = {
  exercises: ExercisesRowSchema,
  foods: FoodsRowSchema,
  food_aliases: FoodAliasesRowSchema,
  food_units: FoodUnitsRowSchema,
  recipes: RecipesRowSchema,
  recipe_ingredients: RecipeIngredientsRowSchema,
  home_dishes: HomeDishesRowSchema,
  protein_addons: ProteinAddonsRowSchema,
  workout_templates: WorkoutTemplatesRowSchema,
  profiles: ProfilesRowSchema,
  targets: TargetsRowSchema,
  places: PlacesRowSchema,
  weekly_plans: WeeklyPlansRowSchema,
  plan_days: PlanDaysRowSchema,
  workout_sessions: WorkoutSessionsRowSchema,
  workout_sets: WorkoutSetsRowSchema,
  exercise_progress: ExerciseProgressRowSchema,
  food_logs: FoodLogsRowSchema,
  meal_items: MealItemsRowSchema,
  food_resolution_misses: FoodResolutionMissesRowSchema,
  pantry_items: PantryItemsRowSchema,
  grocery_lists: GroceryListsRowSchema,
  ping_schedule: PingScheduleRowSchema,
  ping_events: PingEventsRowSchema,
  events: EventsRowSchema,
  plan_commands: PlanCommandsRowSchema,
  checkins: CheckinsRowSchema,
  weigh_ins: WeighInsRowSchema,
  agent_memory: AgentMemoryRowSchema,
  chat_threads: ChatThreadsRowSchema,
  chat_messages: ChatMessagesRowSchema,
  subscriptions: SubscriptionsRowSchema,
  ai_calls: AiCallsRowSchema,
  ai_batches: AiBatchesRowSchema,
  devices: DevicesRowSchema,
} as const;

export type DbTableName = keyof typeof DbTables;
export type DbRow<T extends DbTableName> = z.infer<(typeof DbTables)[T]>;

export type ProfilesRow = DbRow<'profiles'>;
export type TargetsRow = DbRow<'targets'>;
export type PlanDaysRow = DbRow<'plan_days'>;
export type WorkoutSessionsRow = DbRow<'workout_sessions'>;
export type WorkoutSetsRow = DbRow<'workout_sets'>;
export type MealItemsRow = DbRow<'meal_items'>;

/** Per-user tables the device mirrors and sync-pull returns (data-model.md "D" tables that have `updated_at`). */
export const SYNC_PULL_TABLES = [
  'profiles',
  'targets',
  'places',
  'weekly_plans',
  'plan_days',
  'workout_sessions',
  'workout_sets',
  'exercise_progress',
  'meal_items',
  'food_logs',
  'pantry_items',
  'grocery_lists',
  'ping_schedule',
  'checkins',
  'weigh_ins',
  'subscriptions',
] as const satisfies readonly DbTableName[];
export type SyncPullTable = (typeof SYNC_PULL_TABLES)[number];
