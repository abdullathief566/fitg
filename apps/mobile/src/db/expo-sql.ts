// The real `Sql`: expo-sqlite, one database file per install.
import * as SQLite from 'expo-sqlite';
import { migrate } from './migrate';
import type { Sql, SqlValue } from './sql';

/** `inTransaction`: the handle is an exclusive transaction's `txn`; nested `transaction()` calls just run inline. */
function wrap(db: SQLite.SQLiteDatabase, inTransaction = false): Sql {
  return {
    exec: (source) => db.execAsync(source),
    run: async (source, params = []) => {
      await db.runAsync(source, params as SqlValue[]);
    },
    all: <T>(source: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(source, params as SqlValue[]),
    first: <T>(source: string, params: readonly SqlValue[] = []) => db.getFirstAsync<T>(source, params as SqlValue[]),
    transaction: async (task) => {
      if (inTransaction) await task(wrap(db, true));
      else await db.withExclusiveTransactionAsync((txn) => task(wrap(txn, true)));
    },
  };
}

export async function openDatabase(name = 'fitg.db'): Promise<Sql> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(wrap(db));
  return wrap(db);
}
