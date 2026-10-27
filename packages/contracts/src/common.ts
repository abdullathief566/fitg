// Shared Zod primitives and enums (types.md §0–§1). Every other contracts file builds on these.
import { z } from 'zod';
import { isLocalDate, weekdayOf } from '@fitg/engine';

// ───────────────────────── strings ─────────────────────────

/** 'HH:MM', 24-hour (types.md `LocalTime`). */
export const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Postgres `time` read back as 'HH:MM' or 'HH:MM:SS' (fractional seconds tolerated). */
export const DB_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$/;
/** Food, home-dish, add-on and exercise keys: snake_case. Keys feed deterministic ids, so no ':' or spaces. */
export const SNAKE_KEY_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
/** Recipe slugs: kebab-case (the pattern in data/seed/recipes.schema.json). */
export const RECIPE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Any 8-4-4-4-12 hex id. Reference rows use UUIDv5, per-user rows UUIDv4 — z.guid() accepts both. */
export const UuidSchema = z.guid();
/** ISO-8601 instant with `Z` or a ±HH:MM offset (PostgREST returns `+00:00`). */
export const InstantSchema = z.iso.datetime({ offset: true });
/** 'YYYY-MM-DD' — a real calendar date. */
export const LocalDateSchema = z.iso.date();
export const LocalTimeSchema = z.string().regex(LOCAL_TIME_RE, 'Expected a time as HH:MM (24-hour)');
/** A Postgres `time` column: 'HH:MM' or 'HH:MM:SS'. */
export const DbTimeSchema = z.string().regex(DB_TIME_RE, 'Expected a time as HH:MM or HH:MM:SS');
/** Non-empty id string for plan rows referenced by commands and events (not_found handles bad ids). */
export const IdSchema = z.string().min(1);
/** A stable snake_case reference key (food, home dish, add-on, exercise). */
export const SnakeKeySchema = z.string().regex(SNAKE_KEY_RE, 'Expected a snake_case key');
export const RecipeSlugSchema = z.string().regex(RECIPE_SLUG_RE, 'Expected a kebab-case recipe slug');

/** A local date that is a Monday (week starts). */
export const WeekStartSchema = LocalDateSchema.refine(
  (d) => isLocalDate(d) && weekdayOf(d) === 0,
  'Expected a Monday (week start)',
);

/** A time on a 15-minute grid ('18:00', '18:15', …) — SetSessionTime uses 15-minute slots (types.md §9). */
export const QuarterHourTimeSchema = LocalTimeSchema.refine(
  (t) => Number(t.slice(3, 5)) % 15 === 0,
  'Expected a time on a 15-minute slot (:00, :15, :30, :45)',
);

/** IANA time zone, checked with Intl (the engine computes local dates with the same API). */
export const TimeZoneSchema = z
  .string()
  .min(1)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Expected an IANA time zone, e.g. Asia/Kolkata');

/** Any JSON object (jsonb columns whose shape the docs don't pin down). */
export const JsonObjectSchema = z.record(z.string(), z.json());

// ───────────────────────── numbers ─────────────────────────

export const WeekdaySchema = z.literal([0, 1, 2, 3, 4, 5, 6]);
export const DurationMinSchema = z.literal([45, 60, 75]);
export const CookTimePrefSchema = z.literal([10, 20, 30]);
export const BudgetTierSchema = z.literal([1, 2, 3]);
export const ImportanceSchema = z.literal([1, 2, 3]);
export const CostTierSchema = z.literal([1, 2, 3]);
/** Body weight limits (weigh_ins / profiles CHECK). */
export const BodyWeightKgSchema = z.number().min(30).max(300);
export const HeightCmSchema = z.number().min(120).max(230);
export const BirthYearSchema = z.number().int().min(1920).max(2010);

// ───────────────────────── enums (types.md §1 + engine) ─────────────────────────

export const SexSchema = z.enum(['male', 'female']);
export const GoalSchema = z.enum(['fat_loss', 'muscle', 'both', 'get_fit']);
export const ActivitySchema = z.enum(['desk', 'on_feet', 'very_active']);
export const ExperienceSchema = z.enum(['new', 'lt6m', 'gt6m']);
export const EquipmentSchema = z.enum(['full', 'basic', 'home_db']);
export const DietSchema = z.enum(['vegan', 'veg', 'eggetarian', 'non_veg']);
export const CuisineSchema = z.enum(['indian', 'western', 'mixed']);
export const EatingModeSchema = z.enum(['cook', 'family', 'out', 'mix']);
export const SlotSchema = z.enum(['breakfast', 'lunch', 'post_workout', 'dinner', 'snack']);
export const UnitSchema = z.enum([
  'g',
  'ml',
  'piece',
  'katori',
  'roti',
  'tsp',
  'tbsp',
  'cup',
  'slice',
  'scoop',
  'egg',
  'plate',
]);
export const MealStatusSchema = z.enum(['planned', 'eaten', 'half', 'replaced', 'skipped', 'unknown']);
export const MealKindSchema = z.enum(['recipe', 'home_food', 'eat_out']);
export const SessionStatusSchema = z.enum([
  'planned',
  'reminded',
  'ready',
  'in_progress',
  'finished',
  'partial',
  'abandoned',
  'skipped',
  'moved',
]);
export const TemplateKeySchema = z.enum(['A', 'B', 'upper', 'lower']);
export const PingTypeSchema = z.enum([
  'night_before',
  'pre_gym',
  'post_gym',
  'pre_dinner',
  'trial_reminder',
  'checkin',
]);
export const EventTypeSchema = z.enum([
  'app_open',
  'session_started',
  'set_done',
  'set_edited',
  'set_skipped',
  'session_ended',
  'exercise_swapped',
  'meal_status',
  'ping_action',
  'geofence_enter',
  'geofence_exit',
  'weigh_in',
  'feedback',
  'permission_changed',
]);
export const InjurySchema = z.enum(['knee', 'back', 'shoulder']);
export const MovementPatternSchema = z.enum([
  'squat',
  'hinge',
  'h_push',
  'v_push',
  'h_pull',
  'v_pull',
  'lunge',
  'core',
  'isolation',
]);
export const LoadTypeSchema = z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight']);
export const TemplateVariantSchema = z.enum(['gym', 'machine', 'home_db']);
export const SplitSchema = z.enum(['full_ab', 'upper_lower']);
export const IngredientRoleSchema = z.enum(['base', 'protein', 'carb', 'fat', 'veg', 'spice']);
export const HomeDishCategorySchema = z.enum([
  'dal',
  'sabzi',
  'curry_nonveg',
  'rice',
  'bread',
  'snack',
  'breakfast',
  'sweet',
]);
export const ProteinClassSchema = z.enum(['high', 'med', 'low']);
export const StartSourceSchema = z.enum(['manual', 'geofence', 'ping_action']);
export const SessionFeedbackSchema = z.enum(['too_easy', 'ok', 'too_hard']);
export const SetStatusSchema = z.enum(['planned', 'done', 'skipped']);
export const UnitsPrefSchema = z.enum(['kg', 'lb']);
export const AliasLangSchema = z.enum(['en', 'hi', 'hinglish']);
export const DisplayModeSchema = z.enum(['full', 'habit_only']);
export const PlaceKindSchema = z.enum(['gym', 'home']);
export const RejectReasonSchema = z.enum(['not_found', 'stale', 'not_planned', 'invalid_status', 'invalid_value']);
export const GroceryUnitSchema = z.enum(['g', 'ml', 'piece', 'egg', 'roti']);
export const NotificationPermissionSchema = z.enum(['granted', 'denied', 'undetermined']);
export const LocationPermissionSchema = z.enum(['always', 'when_in_use', 'denied', 'undetermined']);

// ───────────────────────── helpers ─────────────────────────

/** True when no two entries share a value (by `key`). */
export function isUnique<T>(items: readonly T[], key: (item: T) => unknown = (x) => x): boolean {
  return new Set(items.map(key)).size === items.length;
}
