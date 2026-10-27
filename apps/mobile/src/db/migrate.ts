// Applies MIGRATIONS in order and records progress in PRAGMA user_version.
import { MIGRATIONS } from './migrations';
import type { Sql } from './sql';

export async function migrate(sql: Sql): Promise<number> {
  const row = await sql.first<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await sql.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[version]!);
      await tx.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
