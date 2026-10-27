// No guilt, ever (PRD §8 law 5). The automated list is docs/10-design/copy.md §8a, verbatim — a test keeps them equal.
// Runs on the copy bank, UI strings and every AI prose output — never on prompt files (they quote the list on purpose).

export const BANNED_TERMS: readonly string[] = [
  'cheat',
  'cheat day',
  'guilty',
  'guilt-free',
  'naughty',
  'bad food',
  'junk food',
  'clean eating',
  'detox',
  'burn off',
  'earn it',
  'lazy',
  'excuse',
  'excuses',
  'fail',
  'failed',
  'failure',
  'broke your streak',
  "don't break your streak",
  'skinny',
  'cure',
  'toxins',
  'boost metabolism',
  'no pain no gain',
];

/** The pattern from §8a: `lose \d+ ?kg in \d+ days`. */
export const BANNED_PATTERN_LABEL = 'lose X kg in Y days';
const BANNED_PATTERN = /(?<![\p{L}\p{N}])lose\s+\d+\s?kg\s+in\s+\d+\s+days(?![\p{L}\p{N}])/iu;

function escape(s: string): string {
  // No '-' here: outside a character class it needs no escaping, and `\-` is invalid with the `u` flag.
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TERM_RES: ReadonlyArray<{ term: string; re: RegExp }> = BANNED_TERMS.map((term) => {
  const body = term
    .split(' ')
    .map((w) => escape(w).replace(/'/g, "['’]"))
    .join('\\s+');
  return { term, re: new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu') };
});

/** Case-insensitive, whole words, ' and ’ both matched. Returns the banned terms found (empty = clean). */
export function containsBannedWords(text: string): string[] {
  const found: string[] = [];
  for (const { term, re } of TERM_RES) if (re.test(text)) found.push(term);
  if (BANNED_PATTERN.test(text)) found.push(BANNED_PATTERN_LABEL);
  return found;
}
