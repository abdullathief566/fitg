// The slice of expo-sqlite the app uses. Repositories depend on this interface, so tests can run them against an
// in-memory fake without a native module.
export type SqlValue = string | number | null;

export interface Sql {
  exec(source: string): Promise<void>;
  run(source: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(source: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T>(source: string, params?: readonly SqlValue[]): Promise<T | null>;
  /** All-or-nothing: either every write in `task` lands or none does. */
  transaction(task: (tx: Sql) => Promise<void>): Promise<void>;
}
