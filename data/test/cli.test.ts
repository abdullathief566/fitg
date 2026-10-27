// The three CLIs, run in-process against temp roots (never the real data/seed) and the FAKE fixtures.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { UsdaPinsFileSchema } from '@fitg/contracts';
import { runBuildSeed } from '../scripts/build-seed.ts';
import { runImportExercises } from '../scripts/import-exercises.ts';
import { runImportUsda } from '../scripts/import-usda.ts';
import { REPO_ROOT } from '../scripts/util.ts';

const FAKE_USDA = fileURLToPath(new URL('./fixtures/fake-usda/', import.meta.url));
const FAKE_EXDB = fileURLToPath(new URL('./fixtures/fake-free-exercise-db/exercises.json', import.meta.url));

const temps: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'fitg-cli-'));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** A temp root with copies of every seed file and the sample values. */
function tempRoot(): string {
  const root = tempDir();
  mkdirSync(join(root, 'data/seed'), { recursive: true });
  mkdirSync(join(root, 'data/sample'), { recursive: true });
  for (const f of readdirSync(join(REPO_ROOT, 'data/seed'))) {
    if (f !== 'usda_pins.json') copyFileSync(join(REPO_ROOT, 'data/seed', f), join(root, 'data/seed', f));
  }
  copyFileSync(join(REPO_ROOT, 'data/sample/foods.sample.json'), join(root, 'data/sample/foods.sample.json'));
  return root;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { log: (l: string) => out.push(l), error: (l: string) => err.push(l) }, out, err };
}

describe('build-seed CLI', () => {
  it('--sample --out <dir> builds and prints a summary', () => {
    const out = tempDir();
    const c = capture();
    expect(runBuildSeed(['--sample', '--out', out], { root: REPO_ROOT, io: c.io })).toBe(0);
    expect(c.out[0]).toMatch(/^FitG seed build \(sample\) — bundle_version [0-9a-f]{8}$/);
    expect(c.out.join('\n')).toMatch(/foods 25 .* templates 6/);
    expect(readdirSync(join(out, 'seed'))).toHaveLength(6);
  });

  it("--prod (the default) refuses today's data with exit code 1 and lists the offenders", () => {
    const root = tempRoot();
    const c = capture();
    expect(runBuildSeed([], { root, io: c.io })).toBe(1);
    expect(c.err.join('\n')).toMatch(/Production build refused[\s\S]*'paneer' curated values are still null/);
    expect(existsSync(join(root, 'supabase'))).toBe(false);
    expect(existsSync(join(root, 'apps'))).toBe(false);
  });

  it('rejects --sample with --prod', () => {
    const c = capture();
    expect(runBuildSeed(['--sample', '--prod'], { root: REPO_ROOT, io: c.io })).toBe(1);
    expect(c.err[0]).toMatch(/Pick one/);
  });
});

describe('import-usda CLI', () => {
  it('prints ranked matches and the --confirm line for every unpinned USDA food', () => {
    const root = tempRoot();
    const c = capture();
    expect(runImportUsda([], { root, usdaDir: FAKE_USDA, io: c.io })).toBe(0);
    const text = c.out.join('\n');
    expect(text).toContain('egg_whole — hint "Egg, whole, raw, fresh"');
    expect(text).toContain('  1. [sr_legacy 900001] Egg, whole, raw, fresh  (exact)');
    expect(text).toContain('pin with: npm run data:import-usda -- --confirm egg_whole=900001');
    expect(text).not.toContain('paneer'); // curated foods are never searched
    expect(existsSync(join(root, 'data/seed/usda_pins.json'))).toBe(false); // searching never pins
  });

  it('--key and --top narrow the output', () => {
    const c = capture();
    expect(
      runImportUsda(['--key', 'egg_whole', '--top', '2'], { root: tempRoot(), usdaDir: FAKE_USDA, io: c.io }),
    ).toBe(0);
    expect(c.out.filter((l) => /^ {2}\d+\. /.test(l))).toHaveLength(2);
    expect(c.out.join('\n')).not.toContain('rice_white_raw');
  });

  it('--confirm pins exactly what the founder chose, then searches skip pinned foods unless --all', () => {
    const root = tempRoot();
    const c = capture();
    expect(
      runImportUsda(['--confirm', 'egg_whole=900001', '--confirm', 'rice_white_raw=800003'], {
        root,
        usdaDir: FAKE_USDA,
        io: c.io,
      }),
    ).toBe(0);
    const pins = UsdaPinsFileSchema.parse(
      JSON.parse(readFileSync(join(root, 'data/seed/usda_pins.json'), 'utf8')),
    ).pins;
    expect(pins).toEqual([
      { key: 'egg_whole', fdc_id: 900001, dataset: 'sr_legacy', description: 'Egg, whole, raw, fresh' },
      {
        key: 'rice_white_raw',
        fdc_id: 800003,
        dataset: 'foundation',
        description: 'Rice, white, long grain, unenriched, raw',
      },
    ]);
    const again = capture();
    runImportUsda([], { root, usdaDir: FAKE_USDA, io: again.io });
    expect(again.out.join('\n')).not.toContain('egg_whole —');
    const all = capture();
    runImportUsda(['--all'], { root, usdaDir: FAKE_USDA, io: all.io });
    expect(all.out.join('\n')).toContain('egg_whole (pinned) —');
  });

  it('refuses bad confirmations and writes nothing', () => {
    const root = tempRoot();
    for (const [arg, msg] of [
      ['paneer=900001', /not a USDA food/],
      ['egg_whole=123', /fdc_id 123 is not in/],
      ['egg_whole', /expects <food_key>=<fdc_id>/],
    ] as const) {
      const c = capture();
      expect(runImportUsda(['--confirm', arg], { root, usdaDir: FAKE_USDA, io: c.io })).toBe(1);
      expect(c.err.join('\n')).toMatch(msg);
    }
    expect(existsSync(join(root, 'data/seed/usda_pins.json'))).toBe(false);
  });

  it('explains where to put the CSVs when they are missing', () => {
    const c = capture();
    expect(runImportUsda([], { root: tempRoot(), usdaDir: join(tempDir(), 'none'), io: c.io })).toBe(1);
    expect(c.err[0]).toMatch(/No USDA CSVs found/);
  });
});

describe('import-exercises CLI', () => {
  it('reports matches and misses (exit 2 while any source_name misses)', () => {
    const c = capture();
    expect(runImportExercises({ root: REPO_ROOT, file: FAKE_EXDB, io: c.io })).toBe(2);
    const text = c.out.join('\n');
    expect(text).toContain('Matched 4 of 33 exercises.');
    expect(text).toContain('✓ barbell_back_squat ← "Barbell Squat" (2 images)');
    expect(text).toMatch(
      /✗ bench_press_barbell \(source_name "Barbell Bench Press - Medium Grip"\)\n {6}closest: "Dumbbell Bench Press"/,
    );
    expect(text).toContain('only reports');
  });

  it('explains where to put exercises.json when it is missing', () => {
    const c = capture();
    expect(runImportExercises({ root: REPO_ROOT, file: join(tempDir(), 'missing.json'), io: c.io })).toBe(1);
    expect(c.err[0]).toMatch(/Not found/);
  });
});
