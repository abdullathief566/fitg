import { describe, expect, it } from 'vitest';
import { EventPayloadSchemas, EventRowSchema, EventTypeSchema, type TypedEventRow } from '../src/mod.ts';

const EVENT_ID = '5f0c6a0e-1d2b-4c3d-8e4f-5a6b7c8d9e0f';
const at = '2026-11-02T13:05:00.000Z';

const PAYLOADS: Record<string, Record<string, unknown>> = {
  app_open: {},
  session_started: { sessionId: 's1', source: 'ping_action' },
  set_done: { sessionId: 's1', exerciseOrder: 0, setIndex: 2, weightKg: 32.5, reps: 10, via: 'lock_screen' },
  set_edited: { setId: 'set-1', weightKg: 30, reps: 9 },
  set_skipped: { setId: 'set-1' },
  session_ended: { sessionId: 's1', status: 'partial', reason: 'geofence_exit' },
  exercise_swapped: {
    sessionId: 's1',
    exerciseOrder: 1,
    fromExerciseId: 'bench_press_barbell',
    toExerciseId: 'chest_press_machine',
    reason: 'busy',
  },
  meal_status: { itemId: 'm1', status: 'replaced', logId: 'log-1', source: 'device_pick' },
  ping_action: { pingId: 'ping:2026-11-02:pre_gym', type: 'pre_gym', action: 'later_30' },
  geofence_enter: { placeId: 'p1', kind: 'gym' },
  geofence_exit: { placeId: 'p1', kind: 'gym' },
  weigh_in: { weightKg: 74.6, source: 'manual' },
  feedback: { target: 'recipe', id: 'dal-rice-meal', value: 'loved' },
  permission_changed: { permission: 'location', status: 'denied' },
};

describe('EventRowSchema', () => {
  it('covers every event type with a payload schema', () => {
    expect(Object.keys(EventPayloadSchemas).sort()).toEqual([...EventTypeSchema.options].sort());
    expect(Object.keys(PAYLOADS).sort()).toEqual([...EventTypeSchema.options].sort());
  });

  it('accepts a valid event of every type', () => {
    for (const [type, payload] of Object.entries(PAYLOADS)) {
      const r = EventRowSchema.safeParse({ id: EVENT_ID, type, at, deviceId: 'android-7', payload });
      expect(r.success, type).toBe(true);
    }
  });

  it('narrows the payload by type', () => {
    const r = EventRowSchema.parse({ id: EVENT_ID, type: 'set_done', at, deviceId: 'd', payload: PAYLOADS.set_done });
    const e: TypedEventRow = r;
    if (e.type === 'set_done') expect(e.payload.weightKg).toBe(32.5);
    else throw new Error('expected set_done');
  });

  it('rejects a payload that belongs to another type, unknown keys, and missing fields', () => {
    expect(
      EventRowSchema.safeParse({ id: EVENT_ID, type: 'set_done', at, deviceId: 'd', payload: PAYLOADS.set_edited })
        .success,
    ).toBe(false);
    expect(
      EventRowSchema.safeParse({ id: EVENT_ID, type: 'app_open', at, deviceId: 'd', payload: { x: 1 } }).success,
    ).toBe(false);
    expect(
      EventRowSchema.safeParse({ id: EVENT_ID, type: 'weigh_in', at, deviceId: 'd', payload: { weightKg: 74 } })
        .success,
    ).toBe(false);
    expect(
      EventRowSchema.safeParse({
        id: EVENT_ID,
        type: 'weigh_in',
        at,
        deviceId: 'd',
        payload: { weightKg: 20, source: 'manual' },
      }).success,
    ).toBe(false);
    expect(EventRowSchema.safeParse({ id: EVENT_ID, type: 'nap_taken', at, deviceId: 'd', payload: {} }).success).toBe(
      false,
    );
    expect(
      EventRowSchema.safeParse({ id: EVENT_ID, type: 'app_open', at, deviceId: 'd', payload: {}, extra: 1 }).success,
    ).toBe(false);
  });

  it('needs a uuid id, an ISO instant and a device id', () => {
    const ok = { id: EVENT_ID, type: 'app_open', at, deviceId: 'd', payload: {} };
    expect(EventRowSchema.safeParse({ ...ok, id: 'evt-1' }).success).toBe(false);
    expect(EventRowSchema.safeParse({ ...ok, at: '2026-11-02 13:05' }).success).toBe(false);
    expect(EventRowSchema.safeParse({ ...ok, deviceId: '' }).success).toBe(false);
  });
});
