// The app's `Sql` interface over Node's built-in SQLite, so the device repositories and the local backend run
// against a real SQLite engine in tests (same SQL as expo-sqlite on the phone).
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db/migrate';
import type { Sql, SqlValue } from '../src/db/sql';

function wrap(db: DatabaseSync, inTransaction: boolean): Sql {
  return {
    exec: async (source) => {
      db.exec(source);
    },
    run: async (source, params = []) => {
      db.prepare(source).run(...(params as SqlValue[]));
    },
    all: async <T>(source: string, params: readonly SqlValue[] = []) =>
      db.prepare(source).all(...(params as SqlValue[])) as T[],
    first: async <T>(source: string, params: readonly SqlValue[] = []) =>
      (db.prepare(source).get(...(params as SqlValue[])) as T | undefined) ?? null,
    transaction: async (task) => {
      if (inTransaction) return task(wrap(db, true));
      db.exec('BEGIN EXCLUSIVE');
      try {
        await task(wrap(db, true));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export async function memoryDb(): Promise<Sql> {
  const sql = wrap(new DatabaseSync(':memory:'), false);
  await migrate(sql);
  return sql;
}
