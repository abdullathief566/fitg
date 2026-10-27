// Shared primitive types and enums (docs/20-engineering/types.md §0–§1).

/** ISO-8601 UTC string, e.g. `2026-11-02T13:00:00.000Z`. */
export type Instant = string;
/** `YYYY-MM-DD` in the user's time zone. */
export type LocalDate = string;
/** `HH:MM`, 24-hour. */
export type LocalTime = string;
/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Sex = 'male' | 'female';
export type Goal = 'fat_loss' | 'muscle' | 'both' | 'get_fit';
export type Activity = 'desk' | 'on_feet' | 'very_active';
export type Experience = 'new' | 'lt6m' | 'gt6m';
export type Equipment = 'full' | 'basic' | 'home_db';
export type Diet = 'vegan' | 'veg' | 'eggetarian' | 'non_veg';
export type Cuisine = 'indian' | 'western' | 'mixed';
export type EatingMode = 'cook' | 'family' | 'out' | 'mix';
export type Slot = 'breakfast' | 'lunch' | 'post_workout' | 'dinner' | 'snack';
export type Unit =
  'g' | 'ml' | 'piece' | 'katori' | 'roti' | 'tsp' | 'tbsp' | 'cup' | 'slice' | 'scoop' | 'egg' | 'plate';
export type MealStatus = 'planned' | 'eaten' | 'half' | 'replaced' | 'skipped' | 'unknown';
export type MealKind = 'recipe' | 'home_food' | 'eat_out';
export type SessionStatus =
  'planned' | 'reminded' | 'ready' | 'in_progress' | 'finished' | 'partial' | 'abandoned' | 'skipped' | 'moved';
export type TemplateKey = 'A' | 'B' | 'upper' | 'lower';
export type PingType = 'night_before' | 'pre_gym' | 'post_gym' | 'pre_dinner' | 'trial_reminder' | 'checkin';
export type EventType =
  | 'app_open'
  | 'session_started'
  | 'set_done'
  | 'set_edited'
  | 'set_skipped'
  | 'session_ended'
  | 'exercise_swapped'
  | 'meal_status'
  | 'ping_action'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'weigh_in'
  | 'feedback'
  | 'permission_changed';
export type Injury = 'knee' | 'back' | 'shoulder';
export type MovementPattern =
  'squat' | 'hinge' | 'h_push' | 'v_push' | 'h_pull' | 'v_pull' | 'lunge' | 'core' | 'isolation';
export type LoadType = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
export type TemplateVariant = 'gym' | 'machine' | 'home_db';
export type Split = 'full_ab' | 'upper_lower';

/** Canonical slot order (breakfast → snack). Used for DayShape order and for "slot order" tie-breaks. */
export const SLOT_ORDER: readonly Slot[] = ['breakfast', 'lunch', 'post_workout', 'dinner', 'snack'];
export const DIETS: readonly Diet[] = ['vegan', 'veg', 'eggetarian', 'non_veg'];
export const PING_TYPES: readonly PingType[] = [
  'night_before',
  'pre_gym',
  'post_gym',
  'pre_dinner',
  'trial_reminder',
  'checkin',
];
