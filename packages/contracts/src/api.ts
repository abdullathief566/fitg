// Edge Function request/response bodies (backend-api.md §2, offline-sync.md §4).
// API bodies are camelCase (engine shapes); sync-pull returns DB rows (snake_case) because the device upserts them
// into its SQLite mirror as-is. Query-string functions (sync-pull, food-search) describe the parsed query object.
// AI-backed functions may answer with `degraded: true` (backend-api.md §4: the deterministic result on provider error).
import { z } from 'zod';
import { CheckinNarrativeOut } from './ai.ts';
import {
  AliasLangSchema,
  BodyWeightKgSchema,
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  LocationPermissionSchema,
  NotificationPermissionSchema,
  PlaceKindSchema,
  RejectReasonSchema,
  SlotSchema,
  SnakeKeySchema,
  TimeZoneSchema,
  UnitSchema,
  UuidSchema,
  WeekStartSchema,
  isUnique,
} from './common.ts';
import {
  BodyGoalPatchSchema,
  CoachProposalSchema,
  ProfilePrefsPatchSchema,
  StoredPlanCommandSchema,
} from './commands.ts';
import {
  CheckinsRowSchema,
  ExerciseProgressRowSchema,
  FoodLogsRowSchema,
  GroceryListsRowSchema,
  MealItemsRowSchema,
  PantryItemsRowSchema,
  PingScheduleRowSchema,
  PlacesRowSchema,
  PlanDaysRowSchema,
  PlatformSchema,
  ProfilesRowSchema,
  SubscriptionsRowSchema,
  TargetsRowSchema,
  WeighInsRowSchema,
  WeighSourceSchema,
  WeeklyPlansRowSchema,
  WorkoutSessionsRowSchema,
  WorkoutSetsRowSchema,
} from './db.ts';
import {
  ChangedRowsSchema,
  FoodUnitSchema,
  GroceryItemSchema,
  NutritionSchema,
  PingEventRowSchema,
  PortionSchema,
  ProfileSchema,
  RebalanceDiffSchema,
  ResolvedFoodSchema,
  ScheduledPingSchema,
  TargetsSchema,
  WeekPayloadSchema,
  WeeklyAdjustResultSchema,
} from './engine.ts';
import { EventRowSchema } from './events.ts';

const degraded = { degraded: z.boolean().optional() };
const OneToThreeSchema = z.literal([1, 2, 3]);

// ───────────────────────── shared pieces ─────────────────────────

/** `{ id, reason }` for a command the server didn't apply (types.md §9 rejection rules). */
export const RejectionSchema = z.strictObject({ id: z.string().min(1), reason: RejectReasonSchema });

/** A computed food-log item (ResolvedFood-shaped; numbers from code, never from AI). */
export const FoodLogItemSchema = z.strictObject({
  kind: z.enum(['food', 'home_dish', 'recipe', 'generic']),
  key: z.string().min(1),
  name: z.string().min(1),
  grams: z.number().nonnegative(),
  unit: UnitSchema,
  qty: z.number().nonnegative(),
  label: z.string(),
  nutrition: NutritionSchema,
});

/** One clarifying question ("How much oil? A little / normal / a lot"). */
export const PendingQuestionSchema = z.strictObject({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(1).max(4),
});

/**
 * A meal photo in the private bucket: `meal-photos/<user_id>/<uuid>.<ext>` (bucket prefix optional).
 * The function still checks that the folder is the caller's user id.
 */
export const PhotoPathSchema = z
  .string()
  .regex(
    /^(meal-photos\/)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp|heic)$/,
    'Expected meal-photos/<user_id>/<uuid>.jpg',
  );

/** changedRows + the rebalance diff + one plain line (code-built, optionally reworded by the fast model). */
export const RebalanceResultSchema = z.strictObject({
  changedRows: ChangedRowsSchema,
  diff: z.array(RebalanceDiffSchema),
  line: z.string(),
});

const uniqueIds = <T extends { id: string }>(items: readonly T[]): boolean => isUnique(items, (x) => x.id);

// ───────────────────────── onboard-complete ─────────────────────────

/** A gym/home pin from onboarding. `id` optional: the server makes one when the device didn't. */
export const PlaceInputSchema = z.strictObject({
  id: UuidSchema.optional(),
  kind: PlaceKindSchema,
  name: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(500).optional(),
});

/** The onboarding answers. `userId` comes from the JWT; `learnedTiming` starts at 0/0 and `journeyStartedAt` is set by the server. */
export const OnboardingProfileSchema = ProfileSchema.omit({
  userId: true,
  learnedTiming: true,
  journeyStartedAt: true,
});

export const OnboardCompleteRequestSchema = z.strictObject({
  profile: OnboardingProfileSchema,
  pantryFoodKeys: z
    .array(SnakeKeySchema)
    .max(300)
    .refine((x) => isUnique(x), 'A pantry food is listed twice'),
  places: z.array(PlaceInputSchema).max(5),
});

export const OnboardCompleteResponseSchema = z.strictObject({
  profile: ProfileSchema,
  targets: TargetsSchema,
  plan: WeekPayloadSchema,
  pings: z.array(ScheduledPingSchema),
});

// ───────────────────────── profile-update ─────────────────────────

export const ProfileUpdateRequestSchema = z
  .strictObject({
    patch: ProfilePrefsPatchSchema.optional(),
    body: BodyGoalPatchSchema.optional(),
  })
  .refine((r) => r.patch !== undefined || r.body !== undefined, 'Send `patch`, `body`, or both');

export const ProfileUpdateResponseSchema = z.strictObject({
  profile: ProfileSchema,
  targets: TargetsSchema.optional(),
  changedRows: ChangedRowsSchema,
});

// ───────────────────────── plan-week ─────────────────────────

export const PlanWeekRequestSchema = z.strictObject({
  weekStart: WeekStartSchema,
  mode: z.enum(['ai', 'deterministic']),
  reason: z.string().min(1).max(200),
});

export const PlanWeekResponseSchema = z.strictObject({
  planId: UuidSchema,
  status: z.enum(['ready', 'queued']),
  ...degraded,
});

// ───────────────────────── plan-command ─────────────────────────

export const PlanCommandRequestSchema = z.strictObject({
  commands: z.array(StoredPlanCommandSchema).min(1).max(200).refine(uniqueIds, 'A command id is listed twice'),
});

export const PlanCommandResponseSchema = z.strictObject({
  applied: z.array(UuidSchema),
  rejected: z.array(RejectionSchema),
  changedRows: ChangedRowsSchema,
  rebalance: z.array(RebalanceDiffSchema).optional(),
});

// ───────────────────────── sync-push (offline-sync.md §4) ─────────────────────────

/** A weigh-in made on the device. */
export const WeighInInputSchema = z.strictObject({
  id: UuidSchema,
  at: InstantSchema,
  weightKg: BodyWeightKgSchema,
  source: WeighSourceSchema,
});

/** An off-plan log the device already computed (Pick tab: source 'pick', status 'confirmed', bundle nutrition). */
export const FoodLogInputSchema = z.strictObject({
  id: UuidSchema,
  date: LocalDateSchema,
  slot: SlotSchema,
  source: z.literal('pick'),
  status: z.literal('confirmed'),
  items: z.array(FoodLogItemSchema).min(1),
  nutrition: NutritionSchema,
  rawInput: z.string().max(500).optional(),
});

/** An off-plan log made offline with typed text or a photo (`food_logs.status = 'pending'`); the server parses it. */
export const PendingLogSchema = z.discriminatedUnion('source', [
  z.strictObject({
    id: UuidSchema,
    date: LocalDateSchema,
    slot: SlotSchema,
    source: z.literal('text'),
    text: z.string().min(1).max(500),
  }),
  z.strictObject({
    id: UuidSchema,
    date: LocalDateSchema,
    slot: SlotSchema,
    source: z.literal('photo'),
    photoPath: PhotoPathSchema,
    text: z.string().max(500).optional(),
  }),
]);

/** ping_events.id is a client uuid. */
export const PingEventInputSchema = z.strictObject({ ...PingEventRowSchema.shape, id: UuidSchema });

export const SyncPushRequestSchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  events: z.array(EventRowSchema).max(5000).refine(uniqueIds, 'An event id is listed twice'),
  pingEvents: z.array(PingEventInputSchema).max(2000).refine(uniqueIds, 'A ping event id is listed twice'),
  pingSchedule: z.array(ScheduledPingSchema).max(200).refine(uniqueIds, 'A ping id is listed twice'),
  /** Applied in order against the current plan, after `foodLogs` are upserted. */
  commands: z.array(StoredPlanCommandSchema).max(1000).refine(uniqueIds, 'A command id is listed twice'),
  weighIns: z.array(WeighInInputSchema).max(500).refine(uniqueIds, 'A weigh-in id is listed twice'),
  foodLogs: z.array(FoodLogInputSchema).max(500).refine(uniqueIds, 'A food log id is listed twice'),
  pendingLogs: z.array(PendingLogSchema).max(100).refine(uniqueIds, 'A pending log id is listed twice'),
});

/** The numbers for a pending log, once the server parsed it. */
export const ParsedLogSchema = z.strictObject({
  logId: UuidSchema,
  items: z.array(FoodLogItemSchema),
  nutrition: NutritionSchema,
  question: PendingQuestionSchema.optional(),
});

export const SyncPushResponseSchema = z.strictObject({
  acceptedIds: z.array(z.string().min(1)),
  rejected: z.array(RejectionSchema),
  changedRows: ChangedRowsSchema,
  parsedLogs: z.array(ParsedLogSchema),
});

// ───────────────────────── sync-pull ─────────────────────────

/** `?since=<cursor>`; no cursor = first pull. */
export const SyncPullRequestSchema = z.strictObject({ since: InstantSchema.optional() });

/** Rows with `updated_at > since`, per mirrored table (db.ts `SYNC_PULL_TABLES`). */
export const SyncPullRowsSchema = z.strictObject({
  profiles: z.array(ProfilesRowSchema).optional(),
  targets: z.array(TargetsRowSchema).optional(),
  places: z.array(PlacesRowSchema).optional(),
  weekly_plans: z.array(WeeklyPlansRowSchema).optional(),
  plan_days: z.array(PlanDaysRowSchema).optional(),
  workout_sessions: z.array(WorkoutSessionsRowSchema).optional(),
  workout_sets: z.array(WorkoutSetsRowSchema).optional(),
  exercise_progress: z.array(ExerciseProgressRowSchema).optional(),
  meal_items: z.array(MealItemsRowSchema).optional(),
  food_logs: z.array(FoodLogsRowSchema).optional(),
  pantry_items: z.array(PantryItemsRowSchema).optional(),
  grocery_lists: z.array(GroceryListsRowSchema).optional(),
  ping_schedule: z.array(PingScheduleRowSchema).optional(),
  checkins: z.array(CheckinsRowSchema).optional(),
  weigh_ins: z.array(WeighInsRowSchema).optional(),
  subscriptions: z.array(SubscriptionsRowSchema).optional(),
});

export const SyncPullResponseSchema = z.strictObject({
  rows: SyncPullRowsSchema,
  /** max(updated_at) seen; send it back as `since`. */
  cursor: InstantSchema,
  /** The reference bundle version the server has (build-seed's bundle_version). */
  bundleVersion: z.string().min(1),
});

// ───────────────────────── rebalance-day ─────────────────────────

export const RebalanceDayRequestSchema = z.strictObject({ date: LocalDateSchema });
export const RebalanceDayResponseSchema = z.strictObject({ ...RebalanceResultSchema.shape, ...degraded });

// ───────────────────────── swap-options ─────────────────────────

export const SwapOptionsRequestSchema = z.strictObject({
  kind: z.enum(['meal', 'exercise']),
  itemId: IdSchema,
});

export const SwapOptionSchema = z.strictObject({
  /** Recipe slug (meals) or exercise id (exercises). */
  id: z.string().min(1),
  name: z.string().min(1),
  nutrition: NutritionSchema.optional(),
  reason: z.string(),
});

export const SwapOptionsResponseSchema = z.strictObject({
  options: z.array(SwapOptionSchema),
  ...degraded,
});

// ───────────────────────── log-offplan / log-offplan-confirm ─────────────────────────

export const LogOffplanRequestSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('text'),
    text: z.string().min(1).max(500),
    date: LocalDateSchema,
    slot: SlotSchema,
    logId: UuidSchema.optional(),
  }),
  z.strictObject({
    source: z.literal('photo'),
    photoPath: PhotoPathSchema,
    text: z.string().max(500).optional(),
    date: LocalDateSchema,
    slot: SlotSchema,
    logId: UuidSchema.optional(),
  }),
]);

export const LogOffplanResponseSchema = z.strictObject({
  logId: UuidSchema,
  items: z.array(FoodLogItemSchema),
  nutrition: NutritionSchema,
  question: PendingQuestionSchema.optional(),
  ...degraded,
});

export const LogOffplanConfirmRequestSchema = z.strictObject({
  logId: UuidSchema,
  /** The option(s) the user tapped for the pending question, in order. */
  answers: z.array(z.string().min(1)).min(1).max(4),
});

export const LogOffplanConfirmResponseSchema = z.strictObject({
  nutrition: NutritionSchema,
  rebalance: RebalanceResultSchema,
});

// ───────────────────────── menu-pick ─────────────────────────

export const MenuPickRequestSchema = z
  .strictObject({
    text: z.string().min(1).max(2000).optional(),
    photoPath: PhotoPathSchema.optional(),
    date: LocalDateSchema,
    slot: SlotSchema,
  })
  .refine((r) => r.text !== undefined || r.photoPath !== undefined, 'Send the menu as `text` or `photoPath`');

export const MenuPickResponseSchema = z.strictObject({
  /** The food_logs row (source 'menu') to link with SetEatOutPick. */
  logId: UuidSchema,
  pick: ResolvedFoodSchema,
  runnerUp: ResolvedFoodSchema.optional(),
  portion: PortionSchema,
  nutrition: NutritionSchema,
  /** Nothing fit the slot: the lightest option at a half portion (the UI says so). */
  overTarget: z.boolean().optional(),
  ...degraded,
});

// ───────────────────────── coach-chat / coach-confirm ─────────────────────────

export const CoachChatRequestSchema = z.strictObject({
  threadId: UuidSchema.optional(),
  message: z.string().trim().min(1).max(2000),
});

export const CoachChatResponseSchema = z.strictObject({
  threadId: UuidSchema,
  reply: z.string(),
  proposal: CoachProposalSchema.optional(),
  ...degraded,
});

export const CoachConfirmRequestSchema = z.strictObject({
  proposalId: UuidSchema,
  accept: z.boolean(),
});

export const CoachConfirmResponseSchema = z.strictObject({
  applied: z.array(UuidSchema),
  rejected: z.array(RejectionSchema),
  changedRows: ChangedRowsSchema,
});

// ───────────────────────── checkin-submit ─────────────────────────

export const CheckinSubmitRequestSchema = z.strictObject({
  weightKg: BodyWeightKgSchema.optional(),
  energy: OneToThreeSchema,
  hunger: OneToThreeSchema,
  soreness: OneToThreeSchema,
});

export const CheckinSubmitResponseSchema = z.strictObject({
  adjust: WeeklyAdjustResultSchema,
  targets: TargetsSchema,
  narrative: CheckinNarrativeOut,
  nextWeek: z.literal('ready'),
  ...degraded,
});

// ───────────────────────── grocery-generate ─────────────────────────

export const GroceryGenerateRequestSchema = z.strictObject({ weekStart: WeekStartSchema });
export const GroceryGenerateResponseSchema = z.strictObject({ items: z.array(GroceryItemSchema) });

// ───────────────────────── food-search ─────────────────────────

/** `?q=&lang=` */
export const FoodSearchRequestSchema = z.strictObject({
  q: z.string().trim().min(1).max(100),
  lang: AliasLangSchema.optional(),
});

export const FoodSearchResponseSchema = z.strictObject({
  foods: z.array(
    z.strictObject({
      id: UuidSchema,
      key: SnakeKeySchema,
      name: z.string().min(1),
      units: z.array(FoodUnitSchema),
    }),
  ),
});

// ───────────────────────── devices-register ─────────────────────────

export const DevicesRegisterRequestSchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  platform: PlatformSchema,
  /** null when notifications are off (no token yet). */
  pushToken: z.string().min(1).max(500).nullable(),
  appVersion: z.string().min(1).max(50),
  tz: TimeZoneSchema,
  notifPermission: NotificationPermissionSchema,
  locationPermission: LocationPermissionSchema,
});

export const OkResponseSchema = z.strictObject({ ok: z.literal(true) });
export const DevicesRegisterResponseSchema = OkResponseSchema;

// ───────────────────────── export-data / delete-account ─────────────────────────

export const ExportDataRequestSchema = z.strictObject({});
/** A signed URL, valid 24 h. */
export const ExportDataResponseSchema = z.strictObject({ url: z.url() });

export const DeleteAccountRequestSchema = z.strictObject({ confirm: z.literal('DELETE') });
export const DeleteAccountResponseSchema = OkResponseSchema;

// ───────────────────────── revenuecat-webhook ─────────────────────────

/** RevenueCat's webhook body is theirs: loose objects, only the fields we read are typed. */
export const RevenuecatWebhookRequestSchema = z.looseObject({
  api_version: z.string().optional(),
  event: z.looseObject({
    id: z.string().optional(),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    product_id: z.string().nullable().optional(),
    entitlement_ids: z.array(z.string()).nullable().optional(),
    period_type: z.string().optional(),
    purchased_at_ms: z.number().nullable().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    event_timestamp_ms: z.number().optional(),
    store: z.string().optional(),
    environment: z.string().optional(),
  }),
});
export const RevenuecatWebhookResponseSchema = OkResponseSchema;

// ───────────────────────── errors ─────────────────────────

export const ApiErrorCodeSchema = z.enum([
  'invalid_input',
  'unauthorized',
  'entitlement_required',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'rate_limited',
  'internal',
]);

/** HTTP status per error code (backend-api.md §4). */
export const API_ERROR_STATUS: Record<z.infer<typeof ApiErrorCodeSchema>, number> = {
  invalid_input: 400,
  unauthorized: 401,
  entitlement_required: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  internal: 500,
};

/** The shared error body: `{ error: { code, message } }`, plus the extras some statuses carry. */
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    /** 400: the Zod issues, summarized one per line. */
    details: z.array(z.string()).optional(),
    /** 429 */
    retry_after_s: z.number().int().nonnegative().optional(),
    /** 500: the Sentry event id. */
    event_id: z.string().optional(),
  }),
});

// ───────────────────────── registry ─────────────────────────

/** Every function in backend-api.md §2 → its request and response schemas. */
export const ApiFunctions = {
  'onboard-complete': { request: OnboardCompleteRequestSchema, response: OnboardCompleteResponseSchema },
  'profile-update': { request: ProfileUpdateRequestSchema, response: ProfileUpdateResponseSchema },
  'plan-week': { request: PlanWeekRequestSchema, response: PlanWeekResponseSchema },
  'plan-command': { request: PlanCommandRequestSchema, response: PlanCommandResponseSchema },
  'sync-push': { request: SyncPushRequestSchema, response: SyncPushResponseSchema },
  'sync-pull': { request: SyncPullRequestSchema, response: SyncPullResponseSchema },
  'rebalance-day': { request: RebalanceDayRequestSchema, response: RebalanceDayResponseSchema },
  'swap-options': { request: SwapOptionsRequestSchema, response: SwapOptionsResponseSchema },
  'log-offplan': { request: LogOffplanRequestSchema, response: LogOffplanResponseSchema },
  'log-offplan-confirm': { request: LogOffplanConfirmRequestSchema, response: LogOffplanConfirmResponseSchema },
  'menu-pick': { request: MenuPickRequestSchema, response: MenuPickResponseSchema },
  'coach-chat': { request: CoachChatRequestSchema, response: CoachChatResponseSchema },
  'coach-confirm': { request: CoachConfirmRequestSchema, response: CoachConfirmResponseSchema },
  'checkin-submit': { request: CheckinSubmitRequestSchema, response: CheckinSubmitResponseSchema },
  'grocery-generate': { request: GroceryGenerateRequestSchema, response: GroceryGenerateResponseSchema },
  'food-search': { request: FoodSearchRequestSchema, response: FoodSearchResponseSchema },
  'devices-register': { request: DevicesRegisterRequestSchema, response: DevicesRegisterResponseSchema },
  'export-data': { request: ExportDataRequestSchema, response: ExportDataResponseSchema },
  'delete-account': { request: DeleteAccountRequestSchema, response: DeleteAccountResponseSchema },
  'revenuecat-webhook': { request: RevenuecatWebhookRequestSchema, response: RevenuecatWebhookResponseSchema },
} as const;

export type ApiFunctionName = keyof typeof ApiFunctions;
export type ApiRequest<F extends ApiFunctionName> = z.infer<(typeof ApiFunctions)[F]['request']>;
export type ApiResponse<F extends ApiFunctionName> = z.infer<(typeof ApiFunctions)[F]['response']>;
