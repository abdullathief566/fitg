import { describe, expect, it } from 'vitest';
import { refId } from '@fitg/engine';
import {
  ChatMessagesRowSchema,
  DbEnums,
  DbTables,
  EventsRowSchema,
  ExercisesRowSchema,
  MealItemsRowSchema,
  PlanCommandsRowSchema,
  PlanDaysRowSchema,
  ProfilesRowSchema,
  SYNC_PULL_TABLES,
} from '../src/mod.ts';
import { USER_ID, readText } from './helpers.ts';

const SQL = readText('docs/20-engineering/schema.sql');
const NOW = '2026-11-02T08:00:00.123456+00:00';

/** `create table <name> ( … );` → column names. Constraint lines (unique/primary key/check …) are skipped. */
function sqlTables(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const m of sql.matchAll(/create table (\w+) \(\n([\s\S]*?)\n\);/g)) {
    const columns: string[] = [];
    for (const raw of (m[2] ?? '').split('\n')) {
      const line = raw.replace(/--.*$/, '').trim();
      if (line === '' || /^(unique|primary key|constraint|check|foreign key|exclude)\b/i.test(line)) continue;
      const name = /^(\w+)/.exec(line)?.[1];
      if (name) columns.push(name);
    }
    tables.set(m[1] ?? '', columns);
  }
  return tables;
}

function sqlEnums(sql: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  for (const m of sql.matchAll(/create type (\w+)\s+as enum \(([\s\S]*?)\);/g)) {
    enums.set(
      m[1] ?? '',
      [...(m[2] ?? '').matchAll(/'([^']*)'/g)].map((v) => v[1] ?? ''),
    );
  }
  return enums;
}

describe('DbTables ↔ schema.sql', () => {
  const tables = sqlTables(SQL);

  it('finds all 35 tables in schema.sql', () => {
    expect(tables.size).toBe(35);
  });

  it('has a row schema for every table and no extra ones', () => {
    expect(Object.keys(DbTables).sort()).toEqual([...tables.keys()].sort());
  });

  // The generated `search` tsvector columns are part of both sets; the row schemas make them optional.
  for (const [table, columns] of sqlTables(SQL)) {
    it(`${table}: same column set as the SQL`, () => {
      const schema = DbTables[table as keyof typeof DbTables];
      expect(schema, `no schema for ${table}`).toBeDefined();
      expect(Object.keys(schema.shape).sort()).toEqual([...columns].sort());
    });
  }

  it('every Postgres enum has a Zod enum with the same values', () => {
    const enums = sqlEnums(SQL);
    expect(enums.size).toBe(38);
    expect(Object.keys(DbEnums).sort()).toEqual([...enums.keys()].sort());
    for (const [name, values] of enums) {
      const zodEnum = DbEnums[name as keyof typeof DbEnums];
      expect([...zodEnum.options].sort(), name).toEqual([...values].sort());
    }
  });

  it('sync-pull tables are real tables with updated_at', () => {
    for (const t of SYNC_PULL_TABLES) expect(Object.keys(DbTables[t].shape)).toContain('updated_at');
  });
});

const profileRow = {
  user_id: USER_ID,
  display_name: 'Arjun',
  sex: 'male',
  birth_year: 1998,
  height_cm: 175,
  weight_kg: 75,
  goal_weight_kg: null,
  goal: 'fat_loss',
  activity: 'desk',
  experience: 'new',
  injuries: [],
  equipment: 'full',
  home_dumbbells_kg: [],
  gym_schedule: [
    { weekday: 0, start: '18:30', duration_min: 60 },
    { weekday: 2, start: '18:30', duration_min: 60 },
  ],
  available_days: [0, 1, 2, 3, 4, 5, 6],
  diet: 'non_veg',
  cuisine_pref: 'indian',
  allergies: [],
  dislikes: [],
  eating_mode: 'cook',
  wake_time: '07:00:00',
  sleep_time: '23:00',
  meal_times: { breakfast: '08:00', lunch: '13:00', dinner: '21:15' },
  cook_time_pref: 20,
  budget_tier: 2,
  safety_flags: {},
  timezone: 'Asia/Kolkata',
  units: 'kg',
  notification_prefs: {},
  learned_timing: { pre_gym_shift_min: 0, dinner_shift_min: 0 },
  onboarding_completed_at: NOW,
  journey_started_at: '2026-11-02',
  created_at: NOW,
  updated_at: NOW,
};

describe('row schemas', () => {
  it('parse a profile row (time columns accept HH:MM and HH:MM:SS; notification_prefs may be {})', () => {
    expect(ProfilesRowSchema.safeParse(profileRow).success).toBe(true);
  });

  it('reject unknown columns, bad enums, out-of-range CHECK values and bad time zones', () => {
    expect(ProfilesRowSchema.safeParse({ ...profileRow, extra: 1 }).success).toBe(false);
    expect(ProfilesRowSchema.safeParse({ ...profileRow, diet: 'paleo' }).success).toBe(false);
    expect(ProfilesRowSchema.safeParse({ ...profileRow, weight_kg: 20 }).success).toBe(false);
    expect(ProfilesRowSchema.safeParse({ ...profileRow, birth_year: 2015 }).success).toBe(false);
    expect(ProfilesRowSchema.safeParse({ ...profileRow, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(ProfilesRowSchema.safeParse({ ...profileRow, wake_time: '7:00' }).success).toBe(false);
    expect(
      ProfilesRowSchema.safeParse({
        ...profileRow,
        gym_schedule: [
          { weekday: 0, start: '18:30', duration_min: 60 },
          { weekday: 0, start: '07:00', duration_min: 45 },
        ],
      }).success,
    ).toBe(false);
  });

  it('a column missing from a row is an error (rows are read back with every column)', () => {
    const { display_name: _omit, ...rest } = profileRow;
    expect(ProfilesRowSchema.safeParse(rest).success).toBe(false);
  });

  it('parse plan_days with prep tasks, ok and problems', () => {
    const row = {
      id: refId('day-1'),
      weekly_plan_id: refId('plan-1'),
      user_id: USER_ID,
      date: '2026-11-07',
      is_gym_day: false,
      kcal_target: 1850,
      protein_target: 120,
      prep_tasks: [
        {
          for_date: '2026-11-07',
          text: 'Soak the rajma tonight.',
          at: '2026-11-07T15:00:00.000Z',
          recipe_slug: 'rajma-rice-meal',
        },
      ],
      tomorrow_delta_kcal: -200,
      ok: false,
      problems: [{ code: 'protein_short', severity: 'error', date: '2026-11-07', detail: 'protein 101 g < 114 g' }],
      updated_at: NOW,
    };
    expect(PlanDaysRowSchema.safeParse(row).success).toBe(true);
    expect(PlanDaysRowSchema.safeParse({ ...row, tomorrow_delta_kcal: 250 }).success).toBe(false);
  });

  it('meal_items portions need exactly one reference id', () => {
    const base = {
      id: refId('meal-1'),
      user_id: USER_ID,
      plan_day_id: refId('day-1'),
      date: '2026-11-02',
      slot: 'dinner',
      planned_at: '2026-11-02T15:45:00.000Z',
      kind: 'home_food',
      recipe_id: null,
      home_dish_ids: [refId('dal_tadka')],
      multiplier: 1,
      portions: [{ home_dish_id: refId('dal_tadka'), grams: 150, unit: 'katori', qty: 1, label: '1 katori dal tadka' }],
      addons: [{ addon_key: 'boiled_egg', qty: 2 }],
      nutrition: { kcal: 410.5, protein_g: 24.1, carbs_g: 40, fat_g: 12.2 },
      status: 'planned',
      status_at: null,
      replaced_by_log_id: null,
      version: 1,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(MealItemsRowSchema.safeParse(base).success).toBe(true);
    const twoIds = { ...base, portions: [{ ...base.portions[0], food_id: refId('egg_whole') }] };
    expect(MealItemsRowSchema.safeParse(twoIds).success).toBe(false);
    const noId = { ...base, portions: [{ grams: 150, unit: 'katori', qty: 1, label: 'x' }] };
    expect(MealItemsRowSchema.safeParse(noId).success).toBe(false);
  });

  it('events rows validate the payload for their type', () => {
    const row = {
      id: '0e7c3f8a-2b1d-4c5e-9f6a-7b8c9d0e1f2a',
      user_id: USER_ID,
      device_id: 'ios-1',
      type: 'set_done',
      at: NOW,
      payload: { sessionId: 's1', exerciseOrder: 0, setIndex: 1, weightKg: 30, reps: 10, via: 'app' },
      received_at: NOW,
    };
    expect(EventsRowSchema.safeParse(row).success).toBe(true);
    expect(EventsRowSchema.safeParse({ ...row, type: 'weigh_in' }).success).toBe(false);
    expect(EventsRowSchema.safeParse({ ...row, type: 'app_open', payload: {} }).success).toBe(true);
  });

  it('plan_commands store a PlanCommand; chat_messages accept blocks or a system string', () => {
    expect(
      PlanCommandsRowSchema.safeParse({
        id: '0e7c3f8a-2b1d-4c5e-9f6a-7b8c9d0e1f2a',
        user_id: USER_ID,
        command: {
          id: '0e7c3f8a-2b1d-4c5e-9f6a-7b8c9d0e1f2a',
          basePlanVersion: 1,
          kind: 'SkipSession',
          sessionId: 's1',
        },
        status: 'rejected',
        reason: 'stale',
        received_at: NOW,
      }).success,
    ).toBe(true);
    const msg = {
      id: refId('m1'),
      thread_id: refId('t1'),
      user_id: USER_ID,
      seq: 0,
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: 'Moved it.' },
      ],
      proposal: null,
      created_at: NOW,
    };
    expect(ChatMessagesRowSchema.safeParse(msg).success).toBe(true);
    expect(
      ChatMessagesRowSchema.safeParse({ ...msg, role: 'system', content: 'App context (as of 18:00): {}' }).success,
    ).toBe(true);
  });

  it('exercises enforce rep_max ≥ rep_min and exactly 3 form cues', () => {
    const ex = {
      id: 'bench_press_barbell',
      source_name: 'Barbell Bench Press - Medium Grip',
      name: 'Barbell bench press',
      primary_muscle: 'chest',
      secondary_muscles: ['triceps'],
      movement_pattern: 'h_push',
      equipment: ['barbell', 'bench'],
      load_type: 'barbell',
      is_machine: false,
      level: 'beginner',
      injury_tags: ['shoulder'],
      form_cues: ['a', 'b', 'c'],
      image_paths: [],
      start_load_ratio: 0.4,
      increment_kg: 2.5,
      rep_min: 8,
      rep_max: 12,
      importance: 3,
    };
    expect(ExercisesRowSchema.safeParse(ex).success).toBe(true);
    expect(ExercisesRowSchema.safeParse({ ...ex, search: "'bench':2" }).success).toBe(true);
    expect(ExercisesRowSchema.safeParse({ ...ex, rep_max: 6 }).success).toBe(false);
    expect(ExercisesRowSchema.safeParse({ ...ex, form_cues: ['a', 'b'] }).success).toBe(false);
  });
});
