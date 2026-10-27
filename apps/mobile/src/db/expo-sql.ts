// The real `Sql`: expo-sqlite, one database file per install.
//
// Every top-level call goes through one queue. expo-sqlite's exclusive transactions run on a second connection with
// no busy timeout, so any other write while one is open fails at once with "database is locked" (a double tap, a
// reload racing a command). Queued, they simply wait their turn. Calls made inside a transaction use its own handle
// and are not queued (they would wait for themselves).
import * as SQLite from 'expo-sqlite';
import { migrate } from './migrate';
import type { Sql, SqlValue } from './sql';

type Enqueue = <T>(job: () => Promise<T>) => Promise<T>;

function serial(): Enqueue {
  let tail: Promise<unknown> = Promise.resolve();
  return (job) => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

function wrap(db: SQLite.SQLiteDatabase, enqueue: Enqueue | null): Sql {
  const q: Enqueue = enqueue ?? ((job) => job());
  return {
    exec: (source) => q(() => db.execAsync(source)),
    run: (source, params = []) =>
      q(async () => {
        await db.runAsync(source, params as SqlValue[]);
      }),
    all: <T>(source: string, params: readonly SqlValue[] = []) =>
      q(() => db.getAllAsync<T>(source, params as SqlValue[])),
    first: <T>(source: string, params: readonly SqlValue[] = []) =>
      q(() => db.getFirstAsync<T>(source, params as SqlValue[])),
    transaction: (task) =>
      enqueue ? q(() => db.withExclusiveTransactionAsync((txn) => task(wrap(txn, null)))) : task(wrap(db, null)), // already inside a transaction: run inline
  };
}

export async function openDatabase(name = 'fitg.db'): Promise<Sql> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const sql = wrap(db, serial());
  await migrate(sql);
  return sql;
}
