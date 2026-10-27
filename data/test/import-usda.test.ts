// Importer tests against tiny FAKE fixtures (data/test/fixtures/fake-usda/ — invented rows, not USDA data).
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CsvParser,
  loadPinnedValues,
  loadUsdaFoods,
  parseCsv,
  readNutrientAmounts,
  readUsdaFoods,
  searchUsda,
  tokenize,
  upsertPin,
  valuesFromNutrients,
} from '../scripts/import-usda.ts';

const FAKE_USDA = fileURLToPath(new URL('./fixtures/fake-usda/', import.meta.url));

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, CRLF, newlines inside quotes, a BOM and blank lines', () => {
    const text = '﻿a,"b, with comma","c ""quoted"""\r\n\r\n1,"multi\nline",3\nlast,,"x"';
    expect(parseCsv(text)).toEqual([
      ['a', 'b, with comma', 'c "quoted"'],
      ['1', 'multi\nline', '3'],
      ['last', '', 'x'],
    ]);
  });

  it('gives the same rows however the text is chunked', () => {
    const text = '"id","desc"\n"1","Egg, ""large"", raw"\n"2","two\r\nlines"\r\n';
    const whole = parseCsv(text);
    for (const size of [1, 2, 3, 5, 7]) {
      const p = new CsvParser();
      const rows: string[][] = [];
      for (let i = 0; i < text.length; i += size) rows.push(...p.push(text.slice(i, i + size)));
      rows.push(...p.end());
      expect(rows, `chunk size ${size}`).toEqual(whole);
    }
  });

  it('refuses a file that ends inside quotes', () => {
    expect(() => parseCsv('a,"open')).toThrow(/inside a quoted field/);
  });
});

describe('food.csv', () => {
  it('reads SR Legacy rows', () => {
    const foods = readUsdaFoods(`${FAKE_USDA}sr_legacy`, 'sr_legacy');
    expect(foods).toHaveLength(7);
    expect(foods.find((f) => f.fdcId === 900007)?.description).toBe('Cheese, "fake" brand, with a comma');
  });

  it("keeps only the Foundation dataset's own rows (drops sub_sample_food)", () => {
    const foods = readUsdaFoods(`${FAKE_USDA}foundation`, 'foundation');
    expect(foods.map((f) => f.fdcId)).toEqual([800001, 800003]);
  });

  it('loads both datasets in search order', () => {
    const { foods, missing } = loadUsdaFoods(FAKE_USDA);
    expect(missing).toEqual([]);
    expect(foods[0]?.dataset).toBe('sr_legacy');
    expect(foods.at(-1)?.dataset).toBe('foundation');
  });
});

describe('searchUsda (token overlap; never guesses)', () => {
  const { foods } = loadUsdaFoods(FAKE_USDA);

  it('tokenizes to lower-case words without stop words', () => {
    expect(tokenize('Rice, white, long-grain, regular, raw, enriched')).toEqual([
      'rice',
      'white',
      'long',
      'grain',
      'regular',
      'raw',
      'enriched',
    ]);
    expect(tokenize('Beans, kidney, red, mature seeds, raw')).toContain('seeds');
    expect(tokenize('Peppers with salt and the oil')).toEqual(['peppers', 'salt', 'oil']);
  });

  it('ranks the exact description first, then by recall and precision, SR Legacy before Foundation on ties', () => {
    const m = searchUsda('Egg, whole, raw, fresh', foods, 10);
    expect(m[0]?.food.fdcId).toBe(900001);
    expect(m[0]?.exact).toBe(true);
    expect(m[1]?.food.fdcId).toBe(900003); // 3 of 4 query words
    expect(m.slice(2, 4).map((x) => x.food.fdcId)).toEqual([900002, 800001]); // same recall + precision → SR Legacy first
    expect(m.every((x) => x.recall > 0)).toBe(true);
  });

  it('finds the hint even when USDA words differ in order or punctuation', () => {
    const m = searchUsda('Rice, white, long-grain, regular, raw, enriched', foods, 3);
    expect(m[0]?.food.fdcId).toBe(900004);
    expect(m.map((x) => x.food.fdcId)).toContain(800003);
  });

  it('returns nothing when no row shares a word', () => {
    expect(searchUsda('Paneer', foods)).toEqual([]);
    expect(searchUsda('', foods)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchUsda('raw', foods, 2)).toHaveLength(2);
  });
});

describe('nutrient values (per 100 g)', () => {
  it('energy: 1008, else 2047, else 2048', () => {
    const base: Array<[number, number]> = [
      [1003, 10],
      [1004, 5],
      [1005, 20],
      [1079, 2],
    ];
    expect(valuesFromNutrients(new Map([[1008, 100], [2047, 200], [2048, 300], ...base])).values?.kcal).toBe(100);
    expect(valuesFromNutrients(new Map([[2047, 200], [2048, 300], ...base])).values?.kcal).toBe(200);
    const r = valuesFromNutrients(new Map([[2048, 300], ...base]));
    expect(r.values).toEqual({ kcal: 300, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 2 });
    expect(r.energyId).toBe(2048);
  });

  it('a missing macro is reported, never guessed; missing fibre becomes 0 with a warning', () => {
    const noCarbs = valuesFromNutrients(
      new Map([
        [1008, 884],
        [1003, 0],
        [1004, 100],
      ]),
    );
    expect(noCarbs.values).toBeNull();
    expect(noCarbs.missing).toEqual(['carbohydrate (1005)']);
    const noEnergy = valuesFromNutrients(
      new Map([
        [1003, 1],
        [1004, 1],
        [1005, 1],
      ]),
    );
    expect(noEnergy.missing).toEqual(['energy (1008/2047/2048)']);
    const noFibre = valuesFromNutrients(
      new Map([
        [1008, 1],
        [1003, 1],
        [1004, 1],
        [1005, 1],
      ]),
    );
    expect(noFibre.values?.fiber_g).toBe(0);
    expect(noFibre.warnings[0]).toMatch(/fibre/);
  });

  it('rounds to the database scale (2 decimals)', () => {
    expect(
      valuesFromNutrients(
        new Map([
          [1008, 222.226],
          [1003, 6.6],
          [1004, 0.6],
          [1005, 77.7],
        ]),
      ).values?.kcal,
    ).toBe(222.23);
  });

  it('streams only the wanted fdc_ids from food_nutrient.csv', () => {
    const amounts = readNutrientAmounts(`${FAKE_USDA}sr_legacy/food_nutrient.csv`, new Set([900001]));
    expect([...amounts.keys()]).toEqual([900001]);
    expect(amounts.get(900001)?.get(1003)).toBe(11.1);
  });

  it('loadPinnedValues resolves pins and lists every problem', () => {
    const r = loadPinnedValues(FAKE_USDA, [
      { key: 'egg_whole', fdc_id: 900001, dataset: 'sr_legacy', description: 'Egg, whole, raw, fresh' },
      { key: 'rice_white_raw', fdc_id: 900004, dataset: 'sr_legacy', description: 'Rice' },
      { key: 'oil_sunflower', fdc_id: 900006, dataset: 'sr_legacy', description: 'Oil' },
      { key: 'ghost', fdc_id: 999999, dataset: 'sr_legacy', description: 'Not there' },
      { key: 'egg_foundation', fdc_id: 800001, dataset: 'foundation', description: 'Eggs' },
      { key: 'rice_foundation', fdc_id: 800003, dataset: 'foundation', description: 'Rice' },
      { key: 'sub_sample', fdc_id: 800002, dataset: 'foundation', description: 'Not a foundation_food row' },
    ]);
    expect(r.values.get('egg_whole')).toEqual({ kcal: 111, protein_g: 11.1, carbs_g: 0.8, fat_g: 8.8, fiber_g: 0 });
    expect(r.values.get('rice_white_raw')?.kcal).toBe(222.23);
    expect(r.values.get('egg_foundation')?.kcal).toBe(144); // 2047 when 1008 is absent
    expect(r.values.get('rice_foundation')?.kcal).toBe(360); // 2048 when 1008 and 2047 are absent
    expect(r.warnings.join('\n')).toMatch(/rice_white_raw.*fibre/);
    const problems = r.problems.join('\n');
    expect(problems).toMatch(/oil_sunflower.*carbohydrate \(1005\)/);
    expect(problems).toMatch(/ghost.*999999/);
    expect(problems).toMatch(/sub_sample.*800002/);
    expect(r.values.has('oil_sunflower')).toBe(false);
  });

  it('loadPinnedValues reports missing CSVs', () => {
    const r = loadPinnedValues(`${FAKE_USDA}nope`, [
      { key: 'egg_whole', fdc_id: 900001, dataset: 'sr_legacy', description: 'x' },
    ]);
    expect(r.problems[0]).toMatch(/USDA CSV not found/);
  });
});

describe('upsertPin', () => {
  it('adds, replaces and keeps pins sorted by key', () => {
    let file = upsertPin(null, { key: 'rice_white_raw', fdc_id: 2, dataset: 'sr_legacy', description: 'Rice' });
    file = upsertPin(file, { key: 'egg_whole', fdc_id: 1, dataset: 'sr_legacy', description: 'Egg' });
    file = upsertPin(file, { key: 'rice_white_raw', fdc_id: 3, dataset: 'foundation', description: 'Rice 2' });
    expect(file.pins.map((p) => [p.key, p.fdc_id])).toEqual([
      ['egg_whole', 1],
      ['rice_white_raw', 3],
    ]);
    expect(file._note).toBeTruthy();
  });
});
