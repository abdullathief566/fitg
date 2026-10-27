// Small file helpers shared by the data scripts.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root (data/scripts/ → ../../). */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function readJsonFile(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`, { cause: e });
  }
}

/** Pretty JSON with a trailing newline (stable, diff-friendly). */
export function writeJsonFile(file: string, data: unknown): void {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** True when the module at `metaUrl` is the script node/tsx was started with (not imported by a test). */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
}

/** `--name value` / `--name=value` (repeatable) from argv. */
export function argValues(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === name) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
      out.push(v);
      i++;
    } else if (a.startsWith(`${name}=`)) {
      out.push(a.slice(name.length + 1));
    }
  }
  return out;
}
