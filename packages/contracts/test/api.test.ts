import { describe, expect, it } from 'vitest';
import {
  API_ERROR_STATUS,
  ApiErrorCodeSchema,
  ApiErrorSchema,
  ApiFunctions,
  DeleteAccountRequestSchema,
  LogOffplanRequestSchema,
  MenuPickRequestSchema,
  OnboardCompleteRequestSchema,
  PlanCommandRequestSchema,
  ProfileUpdateRequestSchema,
  RevenuecatWebhookRequestSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
} from '../src/mod.ts';
import { T1_PROFILE, USER_ID, readText } from './helpers.ts';

const UUID_A = '9b2f1c3e-6a7d-4e8f-9a0b-1c2d3e4f5a6b';
const UUID_B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_C = '7c6b5a49-3829-4716-a5b4-c3d2e1f0a9b8';
const PHOTO = `meal-photos/${USER_ID}/${UUID_C}.jpg`;

describe('ApiFunctions', () => {
  it('has request and response schemas for every function in backend-api.md §2', () => {
    const doc = readText('docs/20-engineering/backend-api.md');
    const section = doc.slice(doc.indexOf('## 2. Functions'), doc.indexOf('## 3.'));
    const names = [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
    expect(names).toHaveLength(20);
    expect(Object.keys(ApiFunctions).sort()).toEqual([...names].sort());
  });
});

describe('onboard-complete', () => {
  const { userId: _u, learnedTiming: _l, journeyStartedAt: _j, ...answers } = T1_PROFILE;

  it('accepts the T1 onboarding answers (userId comes from the JWT, never the body)', () => {
    const body = {
      profile: answers,
      pantryFoodKeys: ['egg_whole', 'atta_whole_wheat', 'rice_white_raw'],
      places: [{ kind: 'gym', name: 'Cult, Madhapur', lat: 17.4483, lng: 78.3915 }],
    };
    expect(OnboardCompleteRequestSchema.safeParse(body).success).toBe(true);
    expect(OnboardCompleteRequestSchema.safeParse({ ...body, profile: { ...answers, userId: USER_ID } }).success).toBe(
      false,
    );
    expect(
      OnboardCompleteRequestSchema.safeParse({ ...body, pantryFoodKeys: ['egg_whole', 'egg_whole'] }).success,
    ).toBe(false);
    expect(
      OnboardCompleteRequestSchema.safeParse({ ...body, places: [{ kind: 'gym', name: 'x', lat: 95, lng: 0 }] })
        .success,
    ).toBe(false);
  });
});

describe('profile-update', () => {
  it('needs a patch or a body change', () => {
    expect(ProfileUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(ProfileUpdateRequestSchema.safeParse({ patch: { cookTimePref: 30 } }).success).toBe(true);
    expect(ProfileUpdateRequestSchema.safeParse({ body: { weightKg: 74 } }).success).toBe(true);
  });
});

describe('plan-command', () => {
  it('takes 1+ commands with uuid ids, no duplicate ids', () => {
    const cmd = { id: UUID_A, basePlanVersion: 3, kind: 'SkipSession', sessionId: 's1' };
    expect(PlanCommandRequestSchema.safeParse({ commands: [cmd] }).success).toBe(true);
    expect(PlanCommandRequestSchema.safeParse({ commands: [] }).success).toBe(false);
    expect(PlanCommandRequestSchema.safeParse({ commands: [cmd, cmd] }).success).toBe(false);
    expect(PlanCommandRequestSchema.safeParse({ commands: [{ ...cmd, id: 'cmd-1' }] }).success).toBe(false);
  });
});

describe('sync-push (offline-sync.md §4)', () => {
  const body = {
    deviceId: 'ios-AB12',
    events: [{ id: UUID_A, type: 'app_open', at: '2026-11-02T02:30:00.000Z', deviceId: 'ios-AB12', payload: {} }],
    pingEvents: [
      {
        id: UUID_B,
        pingId: 'ping:2026-11-02:pre_gym',
        type: 'pre_gym',
        scheduledFor: '2026-11-02T12:45:00.000Z',
        deliveredAt: '2026-11-02T12:45:02.000Z',
        actedAt: '2026-11-02T12:47:00.000Z',
        action: 'start',
        latencyS: 118,
      },
    ],
    pingSchedule: [
      {
        id: 'ping:2026-11-02:pre_gym',
        type: 'pre_gym',
        fireAt: '2026-11-02T12:45:00.000Z',
        title: 'Gym in 15',
        body: 'Full body A at 6:30.',
        categoryId: 'pre_gym',
        channelId: 'pings_high',
        sound: true,
        interruption: 'timeSensitive',
        data: { fireDate: '2026-11-02', aboutDate: '2026-11-02', sessionId: 's1' },
      },
    ],
    commands: [
      { id: UUID_C, basePlanVersion: 1, kind: 'SetMealStatus', itemId: 'm1', status: 'replaced', logId: UUID_A },
    ],
    weighIns: [{ id: UUID_A, at: '2026-11-02T01:30:00.000Z', weightKg: 74.8, source: 'manual' }],
    foodLogs: [
      {
        id: UUID_A,
        date: '2026-11-02',
        slot: 'lunch',
        source: 'pick',
        status: 'confirmed',
        items: [
          {
            kind: 'home_dish',
            key: 'dal_tadka',
            name: 'Dal tadka',
            grams: 150,
            unit: 'katori',
            qty: 1,
            label: '1 katori dal tadka',
            nutrition: { kcal: 180.2, proteinG: 9.8, carbsG: 25.1, fatG: 4.9 },
          },
        ],
        nutrition: { kcal: 180.2, proteinG: 9.8, carbsG: 25.1, fatG: 4.9 },
      },
    ],
    pendingLogs: [
      { id: UUID_B, date: '2026-11-02', slot: 'dinner', source: 'text', text: '2 plates of biryani' },
      { id: UUID_C, date: '2026-11-02', slot: 'snack', source: 'photo', photoPath: PHOTO },
    ],
  };

  it('accepts the full body', () => {
    const r = SyncPushRequestSchema.safeParse(body);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('requires every list (empty is fine) and rejects unknown keys', () => {
    const empty = {
      deviceId: 'd',
      events: [],
      pingEvents: [],
      pingSchedule: [],
      commands: [],
      weighIns: [],
      foodLogs: [],
      pendingLogs: [],
    };
    expect(SyncPushRequestSchema.safeParse(empty).success).toBe(true);
    const { pendingLogs: _p, ...missing } = empty;
    expect(SyncPushRequestSchema.safeParse(missing).success).toBe(false);
    expect(SyncPushRequestSchema.safeParse({ ...empty, sets: [] }).success).toBe(false);
  });

  it('device-computed logs are Pick logs only; pending logs need text or a photo path', () => {
    const log = body.foodLogs[0]!;
    expect(SyncPushRequestSchema.safeParse({ ...body, foodLogs: [{ ...log, source: 'photo' }] }).success).toBe(false);
    expect(
      SyncPushRequestSchema.safeParse({
        ...body,
        pendingLogs: [{ id: UUID_B, date: '2026-11-02', slot: 'dinner', source: 'text' }],
      }).success,
    ).toBe(false);
    expect(
      SyncPushRequestSchema.safeParse({
        ...body,
        pendingLogs: [
          { id: UUID_B, date: '2026-11-02', slot: 'dinner', source: 'photo', photoPath: '../../etc/passwd' },
        ],
      }).success,
    ).toBe(false);
  });

  it('response: acceptedIds, rejected with a RejectReason, changedRows, parsedLogs', () => {
    expect(
      SyncPushResponseSchema.safeParse({
        acceptedIds: [UUID_A, 'ping:2026-11-02:pre_gym'],
        rejected: [{ id: UUID_C, reason: 'stale' }],
        changedRows: { removed: { sessions: ['s9'] } },
        parsedLogs: [
          {
            logId: UUID_B,
            items: [],
            nutrition: { kcal: 900, proteinG: 25, carbsG: 110, fatG: 38 },
            question: { text: 'How much oil?', options: ['A little', 'Normal', 'A lot'] },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      SyncPushResponseSchema.safeParse({
        acceptedIds: [],
        rejected: [{ id: UUID_C, reason: 'nope' }],
        changedRows: {},
        parsedLogs: [],
      }).success,
    ).toBe(false);
  });
});

describe('sync-pull', () => {
  it('returns DB rows per table, a cursor and the bundle version', () => {
    expect(
      SyncPullResponseSchema.safeParse({
        rows: { weigh_ins: [] },
        cursor: '2026-11-02T08:00:00.123456+00:00',
        bundleVersion: 'a1b2c3d4',
      }).success,
    ).toBe(true);
    expect(
      SyncPullResponseSchema.safeParse({ rows: { recipes: [] }, cursor: '2026-11-02T08:00:00Z', bundleVersion: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('logging and eat-out', () => {
  it('log-offplan: text needs text, photo needs a photo path in the user folder format', () => {
    expect(
      LogOffplanRequestSchema.safeParse({ source: 'text', text: 'poha', date: '2026-11-02', slot: 'breakfast' })
        .success,
    ).toBe(true);
    expect(LogOffplanRequestSchema.safeParse({ source: 'text', date: '2026-11-02', slot: 'breakfast' }).success).toBe(
      false,
    );
    expect(
      LogOffplanRequestSchema.safeParse({ source: 'photo', photoPath: PHOTO, date: '2026-11-02', slot: 'lunch' })
        .success,
    ).toBe(true);
    expect(
      LogOffplanRequestSchema.safeParse({ source: 'voice', text: 'x', date: '2026-11-02', slot: 'lunch' }).success,
    ).toBe(false);
  });

  it('menu-pick needs the menu as text or a photo', () => {
    expect(MenuPickRequestSchema.safeParse({ date: '2026-11-02', slot: 'lunch' }).success).toBe(false);
    expect(
      MenuPickRequestSchema.safeParse({ text: 'paneer tikka, dal makhani, naan', date: '2026-11-02', slot: 'lunch' })
        .success,
    ).toBe(true);
  });
});

describe('errors and the webhook', () => {
  it('the shared error body', () => {
    expect(
      ApiErrorSchema.safeParse({
        error: { code: 'invalid_input', message: 'Bad body', details: ['commands: Required'] },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'rate_limited', message: 'Slow down', retry_after_s: 3600 } }).success,
    ).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(false);
    for (const code of ApiErrorCodeSchema.options) expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
  });

  it('delete-account needs the literal confirmation', () => {
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
    expect(DeleteAccountRequestSchema.safeParse({ confirm: 'yes' }).success).toBe(false);
  });

  it('revenuecat-webhook keeps their extra fields (loose)', () => {
    const r = RevenuecatWebhookRequestSchema.safeParse({
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: USER_ID,
        period_type: 'TRIAL',
        store: 'APP_STORE',
        price_in_purchased_currency: 0,
      },
      something_new: true,
    });
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).something_new).toBe(true);
  });
});
