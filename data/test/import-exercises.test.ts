// Matcher tests against a tiny FAKE free-exercise-db fixture (data/test/fixtures/fake-free-exercise-db/).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeExercisesFrom, matchExercises, normalizeName } from '../scripts/import-exercises.ts';

const db = freeExercisesFrom(
  JSON.parse(readFileSync(new URL('./fixtures/fake-free-exercise-db/exercises.json', import.meta.url), 'utf8')),
);

describe('free-exercise-db matching', () => {
  it('skips entries without a name', () => {
    expect(db).toHaveLength(5);
  });

  it('normalizes case, punctuation and spacing', () => {
    expect(normalizeName('  Barbell  Bench Press - Medium Grip ')).toBe('barbell bench press medium grip');
  });

  it('matches exact names (case-insensitive) and reports misses with the closest names', () => {
    const { matches, misses } = matchExercises(
      [
        { id: 'barbell_back_squat', source_name: 'Barbell Squat' },
        { id: 'push_up', source_name: 'pushups' },
        { id: 'leg_press_machine', source_name: 'Leg Press' },
        { id: 'bench_press_barbell', source_name: 'Barbell Bench Press - Medium Grip' },
        { id: 'dead_bug', source_name: null },
      ],
      db,
    );
    expect(matches.map((m) => m.id)).toEqual(['barbell_back_squat', 'push_up', 'leg_press_machine']);
    expect(matches[0]).toMatchObject({
      dbName: 'Barbell Squat',
      dbId: 'Barbell_Squat',
      images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'],
    });
    expect(misses.map((m) => m.id)).toEqual(['bench_press_barbell', 'dead_bug']);
    expect(misses[0]?.suggestions[0]).toBe('Dumbbell Bench Press');
    expect(misses[1]?.sourceName).toBeNull();
  });
});
