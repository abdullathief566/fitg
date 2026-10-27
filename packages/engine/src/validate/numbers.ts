// Product law #4: the AI never invents a number. Every number in AI prose must appear in what it was given (engines.md §4).

const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅛': 0.125,
};
const FRACTION_CHARS = Object.keys(FRACTIONS).join('');

// A comma is a thousands separator only when followed by exactly 3 digits ("1,850" → 1850). Decimals use ".".
// Vulgar fractions attach to a preceding integer ("1½" → 1.5) or stand alone ("½" → 0.5).
const NUMBER_RE = new RegExp(`(\\d+(?:,\\d{3}(?!\\d))*(?:\\.\\d+)?)([${FRACTION_CHARS}])?|([${FRACTION_CHARS}])`, 'g');

/** "Bench 3×8 at 30 kg" → [3, 8, 30]; "6:30" → [6, 30]; "1½ katori" → [1.5]; "1,850" → [1850]. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    if (m[1] !== undefined) {
      const base = Number(m[1].replace(/,/g, ''));
      out.push(m[2] ? base + (FRACTIONS[m[2]] ?? 0) : base);
    } else if (m[3] !== undefined) {
      out.push(FRACTIONS[m[3]] ?? 0);
    }
  }
  return out;
}

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

/** ok only if every number in `text` is in `allowed`. In habit-only mode callers pass `allowed = []`. */
export function assertNoForeignNumbers(text: string, allowed: readonly number[]): { ok: boolean; foreign: number[] } {
  const foreign: number[] = [];
  for (const n of extractNumbers(text)) {
    if (!allowed.some((a) => same(a, n)) && !foreign.some((f) => same(f, n))) foreign.push(n);
  }
  return { ok: foreign.length === 0, foreign };
}

const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

/** The 12-hour form of a 24-hour hour: 18 → 6, 0 → 12, 12 → 12. */
export function hour12(h: number): number {
  return h % 12 === 0 ? 12 : h % 12;
}

/** Numbers a text makes available: every number in it plus the 12-hour form of every "HH:MM" hour. */
export function numbersInText(text: string): number[] {
  const out = extractNumbers(text);
  for (const m of text.matchAll(TIME_RE)) out.push(hour12(Number(m[1])));
  return out;
}

/**
 * Deep scan of a context value (the JSON sent to the model): every number, every number inside strings,
 * the hour and minute parts of every time, and the 12-hour form of every hour ("18:30" → 18, 30, 6).
 */
export function allowedNumbersFrom(...values: unknown[]): number[] {
  const out: number[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.push(v);
    } else if (typeof v === 'string') {
      out.push(...numbersInText(v));
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v instanceof Map) {
      for (const [k, x] of v) {
        visit(k);
        visit(x);
      }
    } else if (v instanceof Set) {
      for (const x of v) visit(x);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) visit(x);
    }
  };
  values.forEach(visit);
  const unique: number[] = [];
  for (const n of out) if (!unique.some((u) => same(u, n))) unique.push(n);
  return unique.sort((a, b) => a - b);
}
