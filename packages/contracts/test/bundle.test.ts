// The phone bundle round-trips: build-seed's bundle JSON → libFromBundle gives exactly the library the engine tests use.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../../data/scripts/build-seed.ts';
import { BundleError, libFromBundle, loadReferenceLib, type PhoneBundle } from '../src/mod.ts';
import { seedInput } from './helpers.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function readBundle(dir: string): PhoneBundle {
  const file = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  return {
    manifest: file('manifest.json'),
    foods: file('foods.json'),
    recipes: file('recipes.json'),
    homeDishes: file('home_dishes.json'),
    addons: file('protein_addons.json'),
    exercises: file('exercises.json'),
    templates: file('templates.json'),
  };
}

const out = mkdtempSync(join(tmpdir(), 'fitg-bundle-'));
const built = buildSeed({ mode: 'sample', root: REPO_ROOT, outDir: out });
const bundle = readBundle(join(out, 'bundle'));

describe('libFromBundle', () => {
  const lib = libFromBundle(bundle);
  const ref = loadReferenceLib(seedInput());

  it('rebuilds the same foods, recipes, home dishes, add-ons and exercises', () => {
    expect(lib.bundleVersion).toBe(built.bundle_version);
    expect(lib.mode).toBe('sample');
    expect(lib.foods).toEqual(ref.foods);
    expect(lib.recipes).toEqual(ref.recipes);
    expect(lib.homeDishes).toEqual(ref.homeDishes);
    expect(lib.addons).toEqual(ref.addons);
    expect(lib.exercises).toEqual(ref.exercises);
  });

  it('keys templates by id and keeps their display names apart', () => {
    expect([...lib.templates.values()]).toEqual(ref.templates);
    expect(lib.templates.get('full_ab_machine')?.id).toBe('full_ab_machine');
    expect(lib.templateNames.size).toBe(ref.templates.length);
    for (const name of lib.templateNames.values()) expect(name.length).toBeGreaterThan(0);
  });

  it('refuses a half-updated bundle (files from different builds)', () => {
    const stale = { ...bundle, recipes: { ...bundle.recipes, bundle_version: 'deadbeef' } };
    expect(() => libFromBundle(stale)).toThrow(BundleError);
    expect(() => libFromBundle(stale)).toThrow(/recipes\.json is version deadbeef/);
  });
});
