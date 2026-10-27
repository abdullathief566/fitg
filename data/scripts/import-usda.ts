// import-usda.ts — find each food's USDA FoodData Central row and pin the founder's choice (data-pipeline.md §1).
//
// CSV layout (downloads are gitignored; nothing here is needed by tests):
//   data/raw/usda/sr_legacy/food.csv            ← FoodData Central "SR Legacy" CSV download, unzipped (searched first)
//   data/raw/usda/sr_legacy/food_nutrient.csv
//   data/raw/usda/foundation/food.csv           ← FoodData Central "Foundation Foods" CSV download, unzipped
//   data/raw/usda/foundation/food_nutrient.csv
// (Unzip each download and rename its folder to `sr_legacy` / `foundation`; the other CSVs in it are unused.)
//
// Usage:
//   npm run data:import-usda                              search every unpinned USDA food, print the top matches
//   npm run data:import-usda -- --key egg_whole --top 8   one food, more matches
//   npm run data:import-usda -- --all                     include foods that already have a pin
//   npm run data:import-usda -- --confirm egg_whole=171287 [--confirm …]   pin a match into data/seed/usda_pins.json
//
// `usda_query` is a search HINT, not an exact name. This script only ranks rows by token overlap and prints them;
// it never pins anything by itself — a pin is always the founder's explicit `--confirm <key>=<fdc_id>`.
// Nutrient ids (per 100 g): energy 1008, else 2047 (Atwater general), else 2048 (Atwater specific);
// protein 1003; total fat 1004; carbohydrate by difference 1005; fibre 1079.
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { roundDp } from '@fitg/engine';
import {
  FoodsMapFileSchema,
  UsdaPinsFileSchema,
  issueLines,
  type FoodValues,
  type UsdaPin,
  type UsdaPinsFile,
} from '@fitg/contracts';
import { REPO_ROOT, argValues, isMain, readJsonFile, writeJsonFile } from './util.ts';

export type UsdaDataset = 'sr_legacy' | 'foundation';
/** Search order: SR Legacy first, then Foundation Foods. */
export const USDA_DATASETS: readonly UsdaDataset[] = ['sr_legacy', 'foundation'];
/** `food.data_type` values kept per dataset (the Foundation download also ships sub-sample and acquisition rows). */
const DATA_TYPES: Record<UsdaDataset, readonly string[]> = {
  sr_legacy: ['sr_legacy_food'],
  foundation: ['foundation_food'],
};

export const NUTRIENT_IDS = {
  energy: [1008, 2047, 2048],
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
} as const;

// ───────────────────────── CSV ─────────────────────────

/**
 * RFC 4180 CSV parser that can be fed in chunks: quoted fields, "" escapes, commas and newlines inside quotes,
 * CRLF line ends, a UTF-8 BOM. Blank lines are skipped.
 */
export class CsvParser {
  private field = '';
  private row: string[] = [];
  private inQuotes = false;
  private quotePending = false;
  private started = false;

  push(chunk: string): string[][] {
    const rows: string[][] = [];
    let i = 0;
    const n = chunk.length;
    if (!this.started && n > 0) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) i = 1;
    }
    while (i < n) {
      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (chunk[i] === '"') {
            this.field += '"';
            i++;
            continue;
          }
          this.inQuotes = false;
          continue; // re-read this character outside the quotes
        }
        const q = chunk.indexOf('"', i);
        if (q === -1) {
          this.field += chunk.slice(i);
          break;
        }
        this.field += chunk.slice(i, q);
        this.quotePending = true;
        i = q + 1;
        continue;
      }
      const ch = chunk[i];
      if (ch === ',') {
        this.row.push(this.field);
        this.field = '';
        i++;
      } else if (ch === '\n') {
        this.row.push(this.field);
        this.field = '';
        this.flushRow(rows);
        i++;
      } else if (ch === '\r') {
        i++;
      } else if (ch === '"') {
        this.inQuotes = true;
        i++;
      } else {
        let j = i + 1;
        while (j < n) {
          const c = chunk[j];
          if (c === ',' || c === '\n' || c === '\r' || c === '"') break;
          j++;
        }
        this.field += chunk.slice(i, j);
        i = j;
      }
    }
    return rows;
  }

  end(): string[][] {
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
    }
    if (this.inQuotes) throw new Error('CSV ends inside a quoted field');
    const rows: string[][] = [];
    if (this.field !== '' || this.row.length > 0) {
      this.row.push(this.field);
      this.field = '';
      this.flushRow(rows);
    }
    return rows;
  }

  private flushRow(rows: string[][]): void {
    const r = this.row;
    this.row = [];
    if (r.length === 1 && r[0] === '') return; // blank line
    rows.push(r);
  }
}

export function parseCsv(text: string): string[][] {
  const p = new CsvParser();
  return [...p.push(text), ...p.end()];
}

/** Streams a CSV file row by row (1 MiB chunks), so food_nutrient.csv never has to fit in memory. */
export function forEachCsvRow(file: string, onRow: (row: string[]) => void): void {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    const decoder = new TextDecoder('utf-8');
    const parser = new CsvParser();
    for (;;) {
      const read = readSync(fd, buf, 0, buf.length, null);
      if (read === 0) break;
      for (const row of parser.push(decoder.decode(buf.subarray(0, read), { stream: true }))) onRow(row);
    }
    for (const row of parser.push(decoder.decode())) onRow(row);
    for (const row of parser.end()) onRow(row);
  } finally {
    closeSync(fd);
  }
}

/** Column positions by header name; throws when a needed column is missing. */
export function columnIndex(header: readonly string[], names: readonly string[], file: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of names) {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${file}: missing column '${name}' (header: ${header.join(', ')})`);
    out[name] = i;
  }
  return out;
}

// ───────────────────────── food.csv ─────────────────────────

export interface UsdaFood {
  fdcId: number;
  description: string;
  dataset: UsdaDataset;
}

/** Reads `<dir>/food.csv`, keeping only the dataset's own rows (data_type filter when the column exists). */
export function readUsdaFoods(dir: string, dataset: UsdaDataset): UsdaFood[] {
  const file = join(dir, 'food.csv');
  const out: UsdaFood[] = [];
  let idx: Record<string, number> | null = null;
  let typeCol = -1;
  forEachCsvRow(file, (row) => {
    if (idx === null) {
      idx = columnIndex(row, ['fdc_id', 'description'], file);
      typeCol = row.indexOf('data_type');
      return;
    }
    if (typeCol >= 0 && !DATA_TYPES[dataset].includes(row[typeCol] ?? '')) return;
    const fdcId = Number(row[idx.fdc_id!]);
    const description = row[idx.description!] ?? '';
    if (Number.isInteger(fdcId) && fdcId > 0 && description !== '') out.push({ fdcId, description, dataset });
  });
  return out;
}

/** Loads every dataset whose food.csv exists under `usdaDir`, in search order. */
export function loadUsdaFoods(usdaDir: string): { foods: UsdaFood[]; missing: string[] } {
  const foods: UsdaFood[] = [];
  const missing: string[] = [];
  for (const ds of USDA_DATASETS) {
    const dir = join(usdaDir, ds);
    if (existsSync(join(dir, 'food.csv'))) foods.push(...readUsdaFoods(dir, ds));
    else missing.push(join(dir, 'food.csv'));
  }
  return { foods, missing };
}

// ───────────────────────── search ─────────────────────────

const STOP_WORDS = new Set(['and', 'or', 'with', 'the', 'of', 'a', 'an', 'in', 'to', 'for']);

/** Lower-case word tokens (letters/digits), minus a few stop words. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== '' && !STOP_WORDS.has(t));
}

export interface UsdaMatch {
  food: UsdaFood;
  /** Share of the query's tokens found in the description (0–1). */
  recall: number;
  /** Share of the description's tokens that are in the query (0–1). */
  precision: number;
  /** Same tokens in the same order as the query. */
  exact: boolean;
}

/**
 * Ranks rows by token overlap with the hint: exact token match first, then recall, then precision, then
 * SR Legacy before Foundation, then the shorter description, then fdc_id. Rows sharing no token are dropped.
 */
export function searchUsda(query: string, foods: readonly UsdaFood[], limit = 5): UsdaMatch[] {
  const qTokens = tokenize(query);
  const q = new Set(qTokens);
  if (q.size === 0) return [];
  const qJoined = qTokens.join(' ');
  const matches: UsdaMatch[] = [];
  for (const food of foods) {
    const dTokens = tokenize(food.description);
    const d = new Set(dTokens);
    let overlap = 0;
    for (const t of q) if (d.has(t)) overlap++;
    if (overlap === 0) continue;
    matches.push({
      food,
      recall: overlap / q.size,
      precision: d.size > 0 ? overlap / d.size : 0,
      exact: dTokens.join(' ') === qJoined,
    });
  }
  const dsRank = (ds: UsdaDataset): number => USDA_DATASETS.indexOf(ds);
  matches.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.recall - a.recall ||
      b.precision - a.precision ||
      dsRank(a.food.dataset) - dsRank(b.food.dataset) ||
      a.food.description.length - b.food.description.length ||
      a.food.fdcId - b.food.fdcId,
  );
  return matches.slice(0, limit);
}

// ───────────────────────── food_nutrient.csv ─────────────────────────

/** Nutrient amounts (per 100 g) for the wanted fdc_ids: fdc_id → nutrient_id → amount (first row wins). */
export function readNutrientAmounts(file: string, wanted: ReadonlySet<number>): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  let idx: Record<string, number> | null = null;
  forEachCsvRow(file, (row) => {
    if (idx === null) {
      idx = columnIndex(row, ['fdc_id', 'nutrient_id', 'amount'], file);
      return;
    }
    const fdcId = Number(row[idx.fdc_id!]);
    if (!wanted.has(fdcId)) return;
    const nutrientId = Number(row[idx.nutrient_id!]);
    const raw = row[idx.amount!] ?? '';
    const amount = Number(raw);
    if (raw === '' || !Number.isFinite(amount)) return;
    let m = out.get(fdcId);
    if (!m) out.set(fdcId, (m = new Map()));
    if (!m.has(nutrientId)) m.set(nutrientId, amount);
  });
  return out;
}

export interface ExtractedValues {
  values: FoodValues | null;
  /** Nutrients that are required but absent (values is null when any is missing). */
  missing: string[];
  warnings: string[];
  /** Which energy id was used (1008, 2047 or 2048). */
  energyId?: number;
}

/** USDA amounts → per-100 g values, rounded to the database's 2 decimals. Never guesses a missing macro. */
export function valuesFromNutrients(amounts: ReadonlyMap<number, number>): ExtractedValues {
  const missing: string[] = [];
  const warnings: string[] = [];
  const energyId = NUTRIENT_IDS.energy.find((id) => amounts.has(id));
  if (energyId === undefined) missing.push('energy (1008/2047/2048)');
  const get = (id: number, label: string): number | undefined => {
    const v = amounts.get(id);
    if (v === undefined) missing.push(`${label} (${id})`);
    return v;
  };
  const protein = get(NUTRIENT_IDS.protein, 'protein');
  const fat = get(NUTRIENT_IDS.fat, 'fat');
  const carbs = get(NUTRIENT_IDS.carbs, 'carbohydrate');
  let fiber = amounts.get(NUTRIENT_IDS.fiber);
  if (fiber === undefined) {
    fiber = 0;
    warnings.push('no fibre value (1079) — using 0');
  }
  if (
    missing.length > 0 ||
    energyId === undefined ||
    protein === undefined ||
    fat === undefined ||
    carbs === undefined
  ) {
    return { values: null, missing, warnings };
  }
  const values: FoodValues = {
    kcal: roundDp(amounts.get(energyId)!, 2),
    protein_g: roundDp(protein, 2),
    carbs_g: roundDp(carbs, 2),
    fat_g: roundDp(fat, 2),
    fiber_g: roundDp(fiber, 2),
  };
  return { values, missing, warnings, energyId };
}

export interface PinnedValues {
  values: Map<string, FoodValues>;
  problems: string[];
  warnings: string[];
}

/**
 * Values for every pin, read from `<usdaDir>/<dataset>/{food,food_nutrient}.csv`. Problems (missing CSVs, an fdc_id
 * not in its dataset, a missing macro) are collected, never papered over.
 */
export function loadPinnedValues(usdaDir: string, pins: readonly UsdaPin[]): PinnedValues {
  const values = new Map<string, FoodValues>();
  const problems: string[] = [];
  const warnings: string[] = [];
  for (const ds of USDA_DATASETS) {
    const dsPins = pins.filter((p) => p.dataset === ds);
    if (dsPins.length === 0) continue;
    const dir = join(usdaDir, ds);
    const foodFile = join(dir, 'food.csv');
    const nutrientFile = join(dir, 'food_nutrient.csv');
    const absent = [foodFile, nutrientFile].filter((f) => !existsSync(f));
    if (absent.length > 0) {
      problems.push(`USDA CSV not found: ${absent.join(', ')} (needed for ${dsPins.map((p) => p.key).join(', ')})`);
      continue;
    }
    const known = new Set(readUsdaFoods(dir, ds).map((f) => f.fdcId));
    const amounts = readNutrientAmounts(nutrientFile, new Set(dsPins.map((p) => p.fdc_id)));
    for (const pin of dsPins) {
      if (!known.has(pin.fdc_id)) {
        problems.push(`usda_pins.json: '${pin.key}' → fdc_id ${pin.fdc_id} is not a ${ds} food in ${foodFile}`);
        continue;
      }
      const r = valuesFromNutrients(amounts.get(pin.fdc_id) ?? new Map());
      if (r.values === null) {
        problems.push(`usda_pins.json: '${pin.key}' → fdc_id ${pin.fdc_id} has no ${r.missing.join(', ')}`);
        continue;
      }
      for (const w of r.warnings) warnings.push(`'${pin.key}' (fdc_id ${pin.fdc_id}): ${w}`);
      values.set(pin.key, r.values);
    }
  }
  return { values, problems, warnings };
}

// ───────────────────────── pins ─────────────────────────

/** Adds or replaces the pin for `pin.key`; pins stay sorted by key. Pure. */
export function upsertPin(file: UsdaPinsFile | null, pin: UsdaPin): UsdaPinsFile {
  const pins = [...(file?.pins ?? []).filter((p) => p.key !== pin.key), pin].sort((a, b) => a.key.localeCompare(b.key));
  return {
    _note:
      file?._note ??
      'Pinned by data/scripts/import-usda.ts --confirm <key>=<fdc_id>. Each pin is the founder-confirmed USDA FoodData Central row for a foods.map.json key.',
    pins,
  };
}

export function readPinsFile(file: string): UsdaPinsFile | null {
  if (!existsSync(file)) return null;
  const r = UsdaPinsFileSchema.safeParse(readJsonFile(file));
  if (!r.success)
    throw new Error(`usda_pins.json failed schema validation:\n${issueLines('usda_pins.json', r.error).join('\n')}`);
  return r.data;
}

// ───────────────────────── CLI ─────────────────────────

export interface CliIO {
  log: (line: string) => void;
  error: (line: string) => void;
}
const consoleIO: CliIO = { log: (l) => console.log(l), error: (l) => console.error(l) };

/** The CLI, with the repo root and output injectable (tests run it against a temp root and fake CSVs). */
export function runImportUsda(
  argv: readonly string[],
  opts: { root: string; usdaDir?: string; io?: CliIO } = { root: REPO_ROOT },
): number {
  const io = opts.io ?? consoleIO;
  const usdaDir = opts.usdaDir ?? join(opts.root, 'data/raw/usda');
  const pinsFile = join(opts.root, 'data/seed/usda_pins.json');
  const map = FoodsMapFileSchema.safeParse(readJsonFile(join(opts.root, 'data/seed/foods.map.json')));
  if (!map.success) {
    io.error(issueLines('foods.map.json', map.error).join('\n'));
    return 1;
  }
  const usdaFoods = new Map(
    map.data.foods.flatMap((f) => (f.usda_query === null ? [] : [[f.key, f.usda_query] as const])),
  );
  const { foods, missing } = loadUsdaFoods(usdaDir);
  if (foods.length === 0) {
    io.error(
      `No USDA CSVs found. Expected:\n  ${missing.join('\n  ')}\nDownload SR Legacy and Foundation Foods (CSV) from FoodData Central and unzip them there.`,
    );
    return 1;
  }
  for (const m of missing) io.log(`(not found, skipped: ${m})`);

  const confirms = argValues(argv, '--confirm');
  if (confirms.length > 0) {
    let file = readPinsFile(pinsFile);
    for (const c of confirms) {
      const m = /^([a-z0-9_]+)=(\d+)$/.exec(c);
      if (!m) {
        io.error(`--confirm expects <food_key>=<fdc_id>, got '${c}'`);
        return 1;
      }
      const key = m[1]!;
      const fdcId = Number(m[2]);
      if (!usdaFoods.has(key)) {
        io.error(`'${key}' is not a USDA food in foods.map.json (unknown key, or a curated food)`);
        return 1;
      }
      const hit = foods.find((f) => f.fdcId === fdcId);
      if (!hit) {
        io.error(`fdc_id ${fdcId} is not in the SR Legacy or Foundation CSVs`);
        return 1;
      }
      file = upsertPin(file, { key, fdc_id: fdcId, dataset: hit.dataset, description: hit.description });
      io.log(`Pinned ${key} → [${hit.dataset} ${fdcId}] ${hit.description}`);
    }
    writeJsonFile(pinsFile, file);
    io.log(`Wrote ${pinsFile}`);
    return 0;
  }

  const top = Number(argValues(argv, '--top')[0] ?? 5);
  if (!Number.isInteger(top) || top < 1) {
    io.error('--top expects a whole number ≥ 1');
    return 1;
  }
  const only = argValues(argv, '--key');
  for (const k of only) {
    if (!usdaFoods.has(k)) {
      io.error(`'${k}' is not a USDA food in foods.map.json`);
      return 1;
    }
  }
  const pinned = new Set((readPinsFile(pinsFile)?.pins ?? []).map((p) => p.key));
  const keys = [...usdaFoods.keys()].filter((k) =>
    only.length > 0 ? only.includes(k) : argv.includes('--all') || !pinned.has(k),
  );
  if (keys.length === 0) io.log('Every USDA food is pinned. Use --all to search them again.');
  for (const key of keys) {
    const query = usdaFoods.get(key)!;
    io.log(`\n${key}${pinned.has(key) ? ' (pinned)' : ''} — hint "${query}"`);
    const matches = searchUsda(query, foods, top);
    if (matches.length === 0)
      io.log('  no rows share a word with the hint — edit usda_query or make it a curated food');
    matches.forEach((m, i) => {
      const tag = m.exact ? 'exact' : `overlap ${Math.round(m.recall * 100)}%`;
      io.log(`  ${i + 1}. [${m.food.dataset} ${m.food.fdcId}] ${m.food.description}  (${tag})`);
    });
    if (matches[0]) io.log(`  pin with: npm run data:import-usda -- --confirm ${key}=${matches[0].food.fdcId}`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = runImportUsda(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
