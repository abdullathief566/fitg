// Typed repositories over the device tables. Writes go in as Postgres-shaped rows (contracts mappers), reads come
// back validated with the same Zod schemas and mapped to engine types. Phase 2 has no backend: this is the truth.
import {
  DbTables,
  fromEngineMeal,
  fromEnginePlanDay,
  fromEngineProfile,
  fromEngineSession,
  fromEngineSet,
  fromEngineTargets,
  refLookupFromLib,
  toEngineMeal,
  toEnginePlanDay,
  toEngineProfile,
  toEngineSession,
  toEngineSet,
  toEngineTargets,
  type BundleLib,
  type DbRow,
  type RefLookup,
} from '@fitg/contracts';
import {
  addDays,
  makeIds,
  refId,
  SLOT_ORDER,
  type Instant,
  type LocalDate,
  type PlanCommand,
  type PlanDay,
  type Profile,
  type Targets,
  type WeekPlan,
} from '@fitg/engine';
import type { DeviceTable } from './migrations';
import type { Sql, SqlValue } from './sql';

interface DocRow {
  id: string;
  sort_key?: string | null;
  parent_id?: string | null;
  updated_at: string;
  row: unknown;
}

async function putDocs(sql: Sql, table: DeviceTable, userId: string, docs: readonly DocRow[]): Promise<void> {
  for (const d of docs) {
    await sql.run(
      `INSERT OR REPLACE INTO ${table} (id, user_id, sort_key, parent_id, updated_at, row) VALUES (?, ?, ?, ?, ?, ?)`,
      [d.id, userId, d.sort_key ?? null, d.parent_id ?? null, d.updated_at, JSON.stringify(d.row)],
    );
  }
}

async function readDocs<T extends DeviceTable>(
  sql: Sql,
  table: T,
  where: string,
  params: readonly SqlValue[],
): Promise<Array<DbRow<T>>> {
  const rows = await sql.all<{ row: string }>(`SELECT row FROM ${table} WHERE ${where} ORDER BY sort_key, id`, params);
  const schema = DbTables[table];
  return rows.map((r) => schema.parse(JSON.parse(r.row)) as DbRow<T>);
}

// ─── kv ───

export async function kvGet<T>(sql: Sql, key: string): Promise<T | undefined> {
  const r = await sql.first<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  return r ? (JSON.parse(r.value) as T) : undefined;
}

export async function kvSet(sql: Sql, key: string, value: unknown): Promise<void> {
  await sql.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

export async function kvDelete(sql: Sql, key: string): Promise<void> {
  await sql.run('DELETE FROM kv WHERE key = ?', [key]);
}

// ─── profile, targets, pantry, places ───

export async function saveProfile(sql: Sql, p: Profile, now: Instant, onboardingCompletedAt: Instant): Promise<void> {
  const row = { ...fromEngineProfile(p, { onboardingCompletedAt }), created_at: now, updated_at: now };
  await putDocs(sql, 'profiles', p.userId, [{ id: p.userId, updated_at: now, row: DbTables.profiles.parse(row) }]);
}

export async function loadProfile(sql: Sql, userId: string): Promise<Profile | undefined> {
  const [row] = await readDocs(sql, 'profiles', 'user_id = ?', [userId]);
  return row ? toEngineProfile(row) : undefined;
}

export async function saveTargets(
  sql: Sql,
  userId: string,
  t: Targets,
  meta: { effectiveFrom: LocalDate; reason: 'onboarding' | 'weekly_adjust' | 'recompute' | 'manual'; now: Instant },
): Promise<void> {
  const id = makeIds(userId)('targets', meta.effectiveFrom, meta.reason);
  const row = {
    ...fromEngineTargets(t, { id, userId, effectiveFrom: meta.effectiveFrom, reason: meta.reason }),
    created_at: meta.now,
    updated_at: meta.now,
  };
  await putDocs(sql, 'targets', userId, [
    { id, sort_key: meta.effectiveFrom, updated_at: meta.now, row: DbTables.targets.parse(row) },
  ]);
}

/** The targets in force on `date`: the latest row whose effective_from is on or before it. */
export async function loadTargets(sql: Sql, userId: string, date: LocalDate): Promise<Targets | undefined> {
  const rows = await readDocs(sql, 'targets', 'user_id = ? AND sort_key <= ?', [userId, date]);
  const latest = rows.at(-1);
  return latest ? toEngineTargets(latest) : undefined;
}

export async function savePantry(sql: Sql, userId: string, keys: Iterable<string>, lib: BundleLib, now: Instant) {
  await sql.run('DELETE FROM pantry_items WHERE user_id = ?', [userId]);
  const docs: DocRow[] = [];
  for (const key of keys) {
    const food = lib.foods.get(key)?.food;
    if (!food) continue;
    const id = makeIds(userId)('pantry', key);
    const row = {
      id,
      user_id: userId,
      food_id: refId(key),
      label: food.name,
      kind: 'staple',
      expires_at: null,
      created_at: now,
      updated_at: now,
    };
    docs.push({ id, updated_at: now, row: DbTables.pantry_items.parse(row) });
  }
  await putDocs(sql, 'pantry_items', userId, docs);
}

export async function loadPantry(sql: Sql, userId: string, refs: RefLookup): Promise<Set<string>> {
  const rows = await readDocs(sql, 'pantry_items', 'user_id = ?', [userId]);
  return new Set(rows.flatMap((r) => refs.foods.get(r.food_id) ?? []));
}

export async function saveGymPlace(sql: Sql, userId: string, pin: { lat: number; lng: number }, now: Instant) {
  const id = makeIds(userId)('place', 'gym');
  const row = {
    id,
    user_id: userId,
    kind: 'gym',
    name: 'My gym',
    lat: pin.lat,
    lng: pin.lng,
    radius_m: 150,
    created_at: now,
    updated_at: now,
  };
  await putDocs(sql, 'places', userId, [{ id, updated_at: now, row: DbTables.places.parse(row) }]);
}

// ─── week plans ───

export function weeklyPlanId(userId: string, weekStart: LocalDate): string {
  return makeIds(userId)('weekly_plan', weekStart);
}

const WEEK_TABLES = ['plan_days', 'workout_sessions', 'workout_sets', 'meal_items'] as const;

/** Replaces every plan row of the week (rows the week no longer has are deleted) in one transaction. */
export async function saveWeek(sql: Sql, userId: string, week: WeekPlan, lib: BundleLib, now: Instant): Promise<void> {
  const refs = refLookupFromLib(lib);
  const planId = weeklyPlanId(userId, week.weekStart);
  const end = addDays(week.weekStart, 6);
  const dayIdByDate = new Map(week.days.map((d) => [d.date, d.id]));
  const dayId = (date: LocalDate): string => {
    const id = dayIdByDate.get(date);
    if (!id) throw new Error(`No plan day for ${date} in the week of ${week.weekStart}`);
    return id;
  };
  const sessionDate = new Map(week.sessions.map((s) => [s.id, s.date]));
  const ts = { created_at: now, updated_at: now };

  await sql.transaction(async (tx) => {
    for (const t of WEEK_TABLES) {
      await tx.run(`DELETE FROM ${t} WHERE user_id = ? AND sort_key >= ? AND sort_key <= ?`, [
        userId,
        week.weekStart,
        end,
      ]);
    }
    const planRow = {
      id: planId,
      user_id: userId,
      week_start: week.weekStart,
      version: week.version,
      status: 'active',
      generated_by: week.generatedBy,
      ai_call_id: null,
      summary: week.note ?? null,
      ...ts,
    };
    await putDocs(tx, 'weekly_plans', userId, [
      { id: planId, sort_key: week.weekStart, updated_at: now, row: DbTables.weekly_plans.parse(planRow) },
    ]);
    await putDocs(
      tx,
      'plan_days',
      userId,
      week.days.map((d) => ({
        id: d.id,
        sort_key: d.date,
        parent_id: planId,
        updated_at: now,
        row: DbTables.plan_days.parse({ ...fromEnginePlanDay(d, { userId, weeklyPlanId: planId }), updated_at: now }),
      })),
    );
    await putDocs(
      tx,
      'workout_sessions',
      userId,
      week.sessions.map((s) => ({
        id: s.id,
        sort_key: s.date,
        parent_id: dayId(s.date),
        updated_at: now,
        row: DbTables.workout_sessions.parse({ ...fromEngineSession(s, { userId, planDayId: dayId(s.date) }), ...ts }),
      })),
    );
    await putDocs(
      tx,
      'workout_sets',
      userId,
      week.sets.map((s) => ({
        id: s.id,
        sort_key: sessionDate.get(s.sessionId) ?? week.weekStart,
        parent_id: s.sessionId,
        updated_at: now,
        row: DbTables.workout_sets.parse({ ...fromEngineSet(s, { userId }), updated_at: now }),
      })),
    );
    await putDocs(
      tx,
      'meal_items',
      userId,
      week.meals.map((m) => ({
        id: m.id,
        sort_key: m.date,
        parent_id: dayId(m.date),
        updated_at: now,
        row: DbTables.meal_items.parse({ ...fromEngineMeal(m, { userId, planDayId: dayId(m.date) }, refs), ...ts }),
      })),
    );
  });
}

/** The saved week, or undefined. `templateId` isn't a column; it is re-derived from the profile (selectTemplate). */
export async function loadWeek(
  sql: Sql,
  userId: string,
  weekStart: LocalDate,
  lib: BundleLib,
  templateId: string,
): Promise<WeekPlan | undefined> {
  const planId = weeklyPlanId(userId, weekStart);
  const [plan] = await readDocs(sql, 'weekly_plans', 'id = ?', [planId]);
  if (!plan) return undefined;
  const refs = refLookupFromLib(lib);
  const range = [userId, weekStart, addDays(weekStart, 6)] as const;
  const inWeek = 'user_id = ? AND sort_key >= ? AND sort_key <= ?';
  const days: PlanDay[] = (await readDocs(sql, 'plan_days', inWeek, range)).map(toEnginePlanDay);
  const sessions = (await readDocs(sql, 'workout_sessions', inWeek, range)).map(toEngineSession);
  const sets = (await readDocs(sql, 'workout_sets', inWeek, range)).map(toEngineSet);
  const meals = (await readDocs(sql, 'meal_items', inWeek, range)).map((r) => toEngineMeal(r, refs));
  sessions.sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : a.plannedStart > b.plannedStart ? 1 : 0));
  const sessionOrder = new Map(sessions.map((s, i) => [s.id, i]));
  const week: WeekPlan = {
    weekStart,
    version: plan.version,
    generatedBy: plan.generated_by,
    templateId,
    days,
    sessions,
    sets: sets.sort(
      (a, b) =>
        (sessionOrder.get(a.sessionId) ?? 0) - (sessionOrder.get(b.sessionId) ?? 0) ||
        a.exerciseOrder - b.exerciseOrder ||
        a.setIndex - b.setIndex,
    ),
    // The engine's own order: by date, then slot order (breakfast → snack).
    meals: meals.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    ),
  };
  if (plan.summary) week.note = plan.summary;
  return week;
}

// ─── commands outbox (Phase 3 pushes these) ───

export async function enqueueCommand(sql: Sql, cmd: PlanCommand, now: Instant): Promise<void> {
  await sql.run('INSERT OR REPLACE INTO outbox_commands (id, created_at, body, state) VALUES (?, ?, ?, ?)', [
    cmd.id,
    now,
    JSON.stringify(cmd),
    'pending',
  ]);
}

/** Wipes everything on this device (Settings → Developer → Start over). */
export async function wipeAll(sql: Sql, tables: readonly string[]): Promise<void> {
  await sql.transaction(async (tx) => {
    for (const t of tables) await tx.run(`DELETE FROM ${t}`);
  });
}
