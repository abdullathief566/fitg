// Design acceptance checks that read the source (docs/code_review.md §3): #1 no hex outside theme.ts, #7 no banned
// words in UI strings, #8 every loop is cancellable, #10 reduced motion is consulted and haptics have one home.
// (#3 and #4 render components: test/tap.test.tsx and test/today.test.tsx; lint enforces #1/#3/#10 as you type.)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { containsBannedWords } from '@fitg/engine';
import * as copy from '../src/copy/ui';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const SOURCES = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))].map((p) => ({
  path: relative(ROOT, p),
  text: readFileSync(p, 'utf8'),
}));

/** Every string a copy export can produce: plain strings, and functions called with sample arguments. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return strings((value as (...a: unknown[]) => unknown)('Tuesday', 'Monday'));
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('design acceptance checks', () => {
  it('#1 no hex colour outside constants/theme.ts', () => {
    const offenders = SOURCES.filter((f) => /#[0-9A-Fa-f]{6}\b/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('#7 no banned words in any UI string', () => {
    const all = strings(copy);
    expect(all.length).toBeGreaterThan(100);
    const hits = all.flatMap((s) => containsBannedWords(s).map((w) => `${w}: ${s}`));
    expect(hits).toEqual([]);
  });

  it('#8 every withRepeat loop is cancelled and gated on focus / foreground / reduced motion', () => {
    for (const f of SOURCES.filter((x) => x.text.includes('withRepeat('))) {
      expect(f.text, f.path).toContain('cancelAnimation(');
      expect(f.text, f.path).toContain('useLoopActive(');
    }
  });

  it('#10 springs and loops consult reduced motion; expo-haptics lives only in lib/haptics.ts', () => {
    for (const f of SOURCES.filter((x) => /withSpring\(|withRepeat\(|\.springify\(\)/.test(x.text))) {
      expect(/useReducedMotion\(|useLoopActive\(/.test(f.text), f.path).toBe(true);
    }
    const haptics = SOURCES.filter((f) => f.text.includes("from 'expo-haptics'")).map((f) => f.path);
    expect(haptics).toEqual([]);
    expect(readFileSync(join(ROOT, 'lib/haptics.ts'), 'utf8')).toContain("from 'expo-haptics'");
  });
});
