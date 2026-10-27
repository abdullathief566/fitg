// Events (docs/20-engineering/types.md §8). The events log is append-only; `id` is the client uuid.
import type { EventType, Instant, MealStatus, PingType } from './enums.ts';

export type StartSource = 'manual' | 'geofence' | 'ping_action';

export interface EventPayloads {
  app_open: Record<string, never>;
  session_started: { sessionId: string; source: StartSource };
  set_done: {
    sessionId: string;
    exerciseOrder: number;
    setIndex: number;
    weightKg: number;
    reps: number;
    via: 'app' | 'lock_screen';
  };
  set_edited: { setId: string; weightKg: number; reps: number };
  set_skipped: { setId: string };
  session_ended: {
    sessionId: string;
    status: 'finished' | 'partial' | 'abandoned';
    reason: 'finish' | 'geofence_exit' | 'timeout';
  };
  exercise_swapped: {
    sessionId: string;
    exerciseOrder: number;
    fromExerciseId: string;
    toExerciseId: string;
    reason?: 'busy' | 'dislike' | 'pain';
  };
  meal_status: {
    itemId: string;
    status: MealStatus;
    logId?: string;
    source: 'one_tap' | 'photo' | 'text' | 'home_food' | 'eat_out' | 'device_pick';
  };
  ping_action: { pingId: string; type: PingType; action: string };
  geofence_enter: { placeId: string; kind: 'gym' | 'home' };
  geofence_exit: { placeId: string; kind: 'gym' | 'home' };
  weigh_in: { weightKg: number; source: 'manual' };
  feedback: { target: 'session' | 'recipe' | 'exercise'; id: string; value: string };
  permission_changed: { permission: 'notifications' | 'location' | 'exact_alarms'; status: string };
}

/** Narrowed per type by `EventPayloads` (contracts validate it as a discriminated union). */
export type EventPayload = Record<string, unknown>;

export interface EventRow {
  id: string;
  type: EventType;
  at: Instant;
  deviceId: string;
  payload: EventPayload;
}

/** A typed event, for code that builds events. */
export type TypedEvent<T extends EventType = EventType> = {
  [K in T]: { id: string; type: K; at: Instant; deviceId: string; payload: EventPayloads[K] };
}[T];
