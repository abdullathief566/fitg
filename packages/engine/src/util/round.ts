// Rounding helpers (engines.md §0). The golden tests depend on these exact definitions.

/** Decimal places in a step, e.g. 0.25 → 2, 2.5 → 1, 5 → 0. */
function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Removes binary floating-point noise from a value that is a multiple of `step`. */
function clean(value: number, step: number): number {
  return Number(value.toFixed(Math.min(decimalsOf(step) + 2, 10)));
}

/** `Math.round(x / step) * step` — half rounds up for positive numbers. */
export function round(x: number, step: number): number {
  return clean(Math.round(x / step) * step, step);
}

/** `Math.ceil(x / step) * step`. */
export function ceilTo(x: number, step: number): number {
  return clean(Math.ceil(x / step) * step, step);
}

/** `Math.floor(x / step) * step`. */
export function floorTo(x: number, step: number): number {
  return clean(Math.floor(x / step) * step, step);
}

/** Nearest ladder value; ties go up. The ladder must be non-empty. */
export function snapToLadder(x: number, ladder: readonly number[]): number {
  const sorted = [...ladder].sort((a, b) => a - b);
  let best = sorted[0];
  if (best === undefined) throw new Error('snapToLadder: empty ladder');
  let bestDist = Math.abs(x - best);
  for (const v of sorted) {
    const d = Math.abs(x - v);
    // `<=` with an ascending ladder makes ties go to the higher value.
    if (d < bestDist || (d === bestDist && v > best)) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

/** Rounds to a fixed number of decimals (for display/storage), e.g. roundDp(1904.0999, 1) = 1904.1. */
export function roundDp(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
