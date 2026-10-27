// Device schema (data-model.md §4): versioned migrations, applied in order, tracked with PRAGMA user_version.
//
// Every per-user table the device mirrors (`SYNC_PULL_TABLES` + the `events` outbox) is stored the same way: the
// Postgres row as JSON in `row`, validated with its contracts Zod schema on every read, plus the columns we query by.
// `sort_key` is the row's local date (plan rows, sets carry their session's date) or its instant (events), so a week
// is one range query. Phase 3 sync upserts the exact rows sync-pull returns.
import { SYNC_PULL_TABLES } from '@fitg/contracts';

export const DEVICE_TABLES = [...SYNC_PULL_TABLES, 'events'] as const;
export type DeviceTable = (typeof DEVICE_TABLES)[number];

const docTable = (t: string) => `
CREATE TABLE IF NOT EXISTS ${t} (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  sort_key TEXT,
  parent_id TEXT,
  updated_at TEXT NOT NULL,
  row TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ${t}_by_user_key ON ${t} (user_id, sort_key);
CREATE INDEX IF NOT EXISTS ${t}_by_parent ON ${t} (parent_id);`;

export const MIGRATIONS: readonly string[] = [
  // 1 — the mirror tables, the outboxes, the sync cursors, and small settings.
  [
    ...DEVICE_TABLES.map(docTable),
    `CREATE TABLE IF NOT EXISTS outbox_commands (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      body TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      reason TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS outbox_logs (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      body TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending'
    );`,
    `CREATE TABLE IF NOT EXISTS sync_state (table_name TEXT PRIMARY KEY NOT NULL, cursor TEXT NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  ].join('\n'),
];
