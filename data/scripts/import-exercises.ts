// import-exercises.ts — match exercises.seed.json `source_name`s against free-exercise-db (data-pipeline.md §1).
//
// Input: data/raw/free-exercise-db/exercises.json — the repo's dist/exercises.json, an array of { name, id, images, … }
// (gitignored download; tests use a tiny fake fixture instead).
// Usage: npm run data:import-exercises
// Reports matches and misses (with the closest names for each miss). Copying images to apps/mobile/assets/exercises/
// as WebP ≤ 60 KB is Phase 2+, so this script only reports.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ExercisesFileSchema, issueLines } from '@fitg/contracts';
import { REPO_ROOT, isMain, readJsonFile } from './util.ts';

export interface FreeExercise {
  name: string;
  id?: string;
  images?: string[];
}

export interface ExerciseMatch {
  id: string;
  sourceName: string;
  dbName: string;
  dbId?: string;
  images: string[];
}

export interface ExerciseMiss {
  id: string;
  sourceName: string | null;
  /** Closest free-exercise-db names by word overlap (best first). */
  suggestions: string[];
}

/** Case-, punctuation- and spacing-insensitive form of a name. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

/** Keeps entries that have a string `name` (the JSON is someone else's file). */
export function freeExercisesFrom(json: unknown): FreeExercise[] {
  if (!Array.isArray(json)) throw new Error('free-exercise-db exercises.json must be an array');
  return json.flatMap((e): FreeExercise[] => {
    if (typeof e !== 'object' || e === null) return [];
    const r = e as Record<string, unknown>;
    if (typeof r.name !== 'string' || r.name === '') return [];
    const out: FreeExercise = { name: r.name };
    if (typeof r.id === 'string') out.id = r.id;
    if (Array.isArray(r.images)) out.images = r.images.filter((x): x is string => typeof x === 'string');
    return [out];
  });
}

/** Exact (normalized) name match; misses get up to 3 suggestions ranked by word overlap (Jaccard). */
export function matchExercises(
  seed: ReadonlyArray<{ id: string; source_name: string | null }>,
  db: readonly FreeExercise[],
): { matches: ExerciseMatch[]; misses: ExerciseMiss[] } {
  const byName = new Map<string, FreeExercise>();
  for (const e of db) {
    const k = normalizeName(e.name);
    if (!byName.has(k)) byName.set(k, e);
  }
  const matches: ExerciseMatch[] = [];
  const misses: ExerciseMiss[] = [];
  for (const ex of seed) {
    const hit = ex.source_name === null ? undefined : byName.get(normalizeName(ex.source_name));
    if (hit && ex.source_name !== null) {
      const m: ExerciseMatch = { id: ex.id, sourceName: ex.source_name, dbName: hit.name, images: hit.images ?? [] };
      if (hit.id !== undefined) m.dbId = hit.id;
      matches.push(m);
      continue;
    }
    const want = words(ex.source_name ?? ex.id.replace(/_/g, ' '));
    const scored = db
      .map((e) => {
        const have = words(e.name);
        let inter = 0;
        for (const w of want) if (have.has(w)) inter++;
        const union = new Set([...want, ...have]).size;
        return { name: e.name, score: union > 0 ? inter / union : 0 };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    misses.push({ id: ex.id, sourceName: ex.source_name, suggestions: scored.slice(0, 3).map((s) => s.name) });
  }
  return { matches, misses };
}

export interface CliIO {
  log: (line: string) => void;
  error: (line: string) => void;
}
const consoleIO: CliIO = { log: (l) => console.log(l), error: (l) => console.error(l) };

/** The CLI, with the repo root, input file and output injectable. Exit code: 0 all matched, 2 misses, 1 error. */
export function runImportExercises(opts: { root: string; file?: string; io?: CliIO } = { root: REPO_ROOT }): number {
  const io = opts.io ?? consoleIO;
  const file = opts.file ?? join(opts.root, 'data/raw/free-exercise-db/exercises.json');
  if (!existsSync(file)) {
    io.error(
      `Not found: ${file}\nDownload dist/exercises.json from github.com/yuhonas/free-exercise-db (Unlicense) and put it there.`,
    );
    return 1;
  }
  const seed = ExercisesFileSchema.safeParse(readJsonFile(join(opts.root, 'data/seed/exercises.seed.json')));
  if (!seed.success) {
    io.error(issueLines('exercises.seed.json', seed.error).join('\n'));
    return 1;
  }
  const { matches, misses } = matchExercises(seed.data.exercises, freeExercisesFrom(readJsonFile(file)));
  io.log(`Matched ${matches.length} of ${seed.data.exercises.length} exercises.`);
  for (const m of matches)
    io.log(`  ✓ ${m.id} ← "${m.dbName}" (${m.images.length} image${m.images.length === 1 ? '' : 's'})`);
  if (misses.length > 0) {
    io.log(`\nMisses (${misses.length}) — fix source_name in data/seed/exercises.seed.json:`);
    for (const m of misses) {
      io.log(`  ✗ ${m.id} (source_name ${m.sourceName === null ? 'missing' : `"${m.sourceName}"`})`);
      if (m.suggestions.length > 0) io.log(`      closest: ${m.suggestions.map((x) => `"${x}"`).join(', ')}`);
    }
  }
  io.log('\nImages are copied in Phase 2+ (WebP ≤ 60 KB into apps/mobile/assets/exercises/); this run only reports.');
  return misses.length > 0 ? 2 : 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = runImportExercises();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
