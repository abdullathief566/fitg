import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allowedNumbersFrom,
  assertNoForeignNumbers,
  BANNED_PATTERN_LABEL,
  BANNED_TERMS,
  containsBannedWords,
  extractNumbers,
  fmtQty,
  hash32,
  mulberry32,
  pn,
  refId,
  round,
  snapToLadder,
  uuidv5,
} from '../src/mod.ts';
import { ROOT } from './helpers/lib.ts';

describe('assertNoForeignNumbers (testing.md §1)', () => {
  it('"Bench 3×8 at 30 kg" with {3, 8, 30} → ok', () => {
    expect(assertNoForeignNumbers('Bench 3×8 at 30 kg', [3, 8, 30])).toEqual({ ok: true, foreign: [] });
  });
  it('"eat 1,800 kcal" with {1850} → foreign [1800]', () => {
    expect(assertNoForeignNumbers('eat 1,800 kcal', [1850])).toEqual({ ok: false, foreign: [1800] });
  });
  it('"Gym\'s at 6:30" with context time 18:30 → ok (12-hour form allowed)', () => {
    const allowed = allowedNumbersFrom({ gymStart: '18:30' });
    expect(allowed).toEqual(expect.arrayContaining([18, 30, 6]));
    expect(assertNoForeignNumbers("Gym's at 6:30", allowed).ok).toBe(true);
  });
  it('"1½ katori" → 1.5', () => {
    expect(extractNumbers('1½ katori')).toEqual([1.5]);
    expect(extractNumbers('½ katori dal, 2.5 kg, 1,850 kcal, 3x8')).toEqual([0.5, 2.5, 1850, 3, 8]);
  });
  it('habit_only (allowed []) rejects any digit', () => {
    expect(assertNoForeignNumbers('Two rotis and a katori of dal.', []).ok).toBe(true);
    expect(assertNoForeignNumbers('2 rotis', []).ok).toBe(false);
  });
  it('allowedNumbersFrom scans deeply (numbers, strings, nested)', () => {
    expect(allowedNumbersFrom({ a: 1850, b: ['Bench 3×8', { c: '21:15' }] })).toEqual([3, 8, 9, 15, 21, 1850]);
  });
});

describe('containsBannedWords', () => {
  it('"cheat day" and "Don’t break your streak" are flagged', () => {
    expect(containsBannedWords('Enjoy your cheat day')).toEqual(['cheat', 'cheat day']);
    expect(containsBannedWords('Don’t break your streak!')).toEqual(["don't break your streak"]);
    expect(containsBannedWords('Lose 5 kg in 10 days')).toEqual([BANNED_PATTERN_LABEL]);
  });
  it('"cheater", "fat loss" and "low-fat curd" are not flagged', () => {
    expect(containsBannedWords('cheater')).toEqual([]);
    expect(containsBannedWords('Great for fat loss')).toEqual([]);
    expect(containsBannedWords('low-fat curd')).toEqual([]);
    expect(containsBannedWords('learn it, secure it')).toEqual([]);
  });
  it('the list is exactly docs/10-design/copy.md §8a', () => {
    const copy = readFileSync(path.join(ROOT, 'docs/10-design/copy.md'), 'utf8');
    const line = copy.split('\n').find((l) => l.startsWith('cheat ·'))!;
    const fromDoc = line
      .split(' · ')
      .map((s) => s.trim())
      .filter((s) => !s.startsWith('and the pattern'));
    expect([...BANNED_TERMS]).toEqual(fromDoc);
    expect(line).toContain('lose \\d+ ?kg in \\d+ days');
  });
});

describe('frozen helpers', () => {
  it('round: half rounds up; snapToLadder: ties go up', () => {
    expect(round(1845.45, 10)).toBe(1850);
    expect(round(27, 2.5)).toBe(27.5);
    expect(round(56.25, 5)).toBe(55);
    expect(snapToLadder(11.25, [10, 12.5])).toBe(12.5);
  });
  it('hash32 (FNV-1a) and mulberry32 are frozen', () => {
    expect(hash32('')).toBe(0x811c9dc5);
    expect(hash32('a')).toBe(0xe40c292c);
    expect(hash32('foobar')).toBe(0xbf9cf968);
    // Standard mulberry32: seed 1 → 0.6270739405881613, 0.002735721180215478 (pinned so it can never drift).
    const r = mulberry32(1);
    expect([r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478]);
  });
  it("uuidv5 matches RFC 4122 test vector; reference ids are UUIDv5(key) in FitG's namespace", () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
    expect(refId('egg_whole')).toBe(uuidv5('egg_whole', '6f1c2c1e-7a3b-4c5d-9e8f-0a1b2c3d4e5f'));
    expect(refId('egg_whole')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('fmtQty and PlanNumber', () => {
    expect(fmtQty(1.5)).toBe('1½');
    expect(fmtQty(0.5)).toBe('½');
    expect(fmtQty(2)).toBe('2');
    expect(pn(3)).toBe(3);
    expect(() => pn(Number.NaN)).toThrow();
  });
});
