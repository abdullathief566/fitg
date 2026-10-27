// The events log (types.md §8): append-only, one payload shape per `type`.
import { z } from 'zod';
import type { EventPayloads, EventType } from '@fitg/engine/types';
import {
  BodyWeightKgSchema,
  IdSchema,
  InstantSchema,
  MealStatusSchema,
  PingTypeSchema,
  PlaceKindSchema,
  StartSourceSchema,
  UuidSchema,
} from './common.ts';

const GeofencePayloadSchema = z.strictObject({ placeId: IdSchema, kind: PlaceKindSchema });

/** `events.payload` by type — exactly the table in types.md §8. */
export const EventPayloadSchemas = {
  app_open: z.strictObject({}),
  session_started: z.strictObject({ sessionId: IdSchema, source: StartSourceSchema }),
  set_done: z.strictObject({
    sessionId: IdSchema,
    exerciseOrder: z.number().int().nonnegative(),
    setIndex: z.number().int().nonnegative(),
    weightKg: z.number().nonnegative(),
    reps: z.number().int().nonnegative(),
    via: z.enum(['app', 'lock_screen']),
  }),
  set_edited: z.strictObject({
    setId: IdSchema,
    weightKg: z.number().nonnegative(),
    reps: z.number().int().nonnegative(),
  }),
  set_skipped: z.strictObject({ setId: IdSchema }),
  session_ended: z.strictObject({
    sessionId: IdSchema,
    status: z.enum(['finished', 'partial', 'abandoned']),
    reason: z.enum(['finish', 'geofence_exit', 'timeout']),
  }),
  exercise_swapped: z.strictObject({
    sessionId: IdSchema,
    exerciseOrder: z.number().int().nonnegative(),
    fromExerciseId: IdSchema,
    toExerciseId: IdSchema,
    reason: z.enum(['busy', 'dislike', 'pain']).optional(),
  }),
  meal_status: z.strictObject({
    itemId: IdSchema,
    status: MealStatusSchema,
    logId: IdSchema.optional(),
    source: z.enum(['one_tap', 'photo', 'text', 'home_food', 'eat_out', 'device_pick']),
  }),
  ping_action: z.strictObject({ pingId: z.string().min(1), type: PingTypeSchema, action: z.string().min(1) }),
  geofence_enter: GeofencePayloadSchema,
  geofence_exit: GeofencePayloadSchema,
  weigh_in: z.strictObject({ weightKg: BodyWeightKgSchema, source: z.literal('manual') }),
  feedback: z.strictObject({
    target: z.enum(['session', 'recipe', 'exercise']),
    id: z.string().min(1),
    value: z.string().min(1),
  }),
  permission_changed: z.strictObject({
    permission: z.enum(['notifications', 'location', 'exact_alarms']),
    status: z.string().min(1),
  }),
} satisfies { [K in EventType]: z.ZodType<EventPayloads[K]> };

function eventRow<T extends EventType, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({
    /** Client uuid → idempotent upsert. */
    id: UuidSchema,
    type: z.literal(type),
    at: InstantSchema,
    deviceId: z.string().min(1),
    payload,
  });
}

/** An event with its payload validated for its `type` (discriminated union on `type`). */
export const EventRowSchema = z.discriminatedUnion('type', [
  eventRow('app_open', EventPayloadSchemas.app_open),
  eventRow('session_started', EventPayloadSchemas.session_started),
  eventRow('set_done', EventPayloadSchemas.set_done),
  eventRow('set_edited', EventPayloadSchemas.set_edited),
  eventRow('set_skipped', EventPayloadSchemas.set_skipped),
  eventRow('session_ended', EventPayloadSchemas.session_ended),
  eventRow('exercise_swapped', EventPayloadSchemas.exercise_swapped),
  eventRow('meal_status', EventPayloadSchemas.meal_status),
  eventRow('ping_action', EventPayloadSchemas.ping_action),
  eventRow('geofence_enter', EventPayloadSchemas.geofence_enter),
  eventRow('geofence_exit', EventPayloadSchemas.geofence_exit),
  eventRow('weigh_in', EventPayloadSchemas.weigh_in),
  eventRow('feedback', EventPayloadSchemas.feedback),
  eventRow('permission_changed', EventPayloadSchemas.permission_changed),
]);

export type TypedEventRow = z.infer<typeof EventRowSchema>;

/** Validates a payload for a given type (used by the `events` DB row schema, whose payload column is plain jsonb). */
export function eventPayloadSchemaFor(type: EventType): z.ZodType {
  return EventPayloadSchemas[type];
}
