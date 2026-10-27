// Small text helpers shared by labels, pings and next-step cards. Numbers are formatted, never invented.

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 1.5 → '1½', 0.5 → '½', 2 → '2', 0.25 → '¼'. Other decimals print as-is. */
export function fmtQty(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const frac = Number((q - whole).toFixed(2));
  if (frac === 0) return String(whole);
  const sym = FRACTIONS[String(frac)];
  if (!sym) return String(Number(q.toFixed(2)));
  return whole === 0 ? sym : `${whole}${sym}`;
}

/** '1,850' style thousands separators for kcal etc. */
export function fmtInt(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Drops trailing zeros: 2.50 → '2.5', 30 → '30'. */
export function fmtNum(n: number): string {
  return String(Number(n.toFixed(2)));
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** 'chicken-curry-rice' → 'Chicken curry rice' (fallback when no display name is known). */
export function humanizeSlug(slug: string): string {
  return capitalize(slug.replace(/[-_]+/g, ' '));
}

/** Simple English plural for household units and foods. */
export function plural(word: string, qty: number): string {
  if (qty <= 1) return word;
  if (/(s|sh|ch|x)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Fills `{placeholder}`s. Unknown placeholders are left visible so tests catch them. */
export function fillTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined ? m : String(v);
  });
}

/** Collapses spaces left by empty placeholders and tidies punctuation. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\.\s*\./g, '.')
    .trim();
}
