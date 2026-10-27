// Template choice, equipment availability and substitutes (engines.md §2.2, types.md §1).
import type { Equipment, Experience, TemplateKey } from '../types/enums.ts';
import type { ExerciseLib, ExerciseRow, WorkoutTemplate } from '../types/reference.ts';

const BASIC_UNAVAILABLE: ReadonlySet<string> = new Set(['barbell', 'rack']);

/** full = every tag; basic = every tag except barbell and rack; home_db = only dumbbell (bodyweight has no tags). */
export function equipmentTagAvailable(tag: string, equipment: Equipment): boolean {
  if (equipment === 'full') return true;
  if (equipment === 'basic') return !BASIC_UNAVAILABLE.has(tag);
  return tag === 'dumbbell';
}

/** An exercise is available when all of its equipment tags are available. */
export function isAvailable(ex: ExerciseRow, equipment: Equipment): boolean {
  return ex.equipment.every((t) => equipmentTagAvailable(t, equipment));
}

export function isInjurySafe(ex: ExerciseRow, injuries: readonly string[]): boolean {
  return !ex.injuryTags.some((t) => injuries.includes(t));
}

/** gymDays ≤ 3 → full_ab; 4+ → upper_lower. home_db → home_db; basic or new → machine; else gym. */
export function selectTemplate(p: { gymDays: number; equipment: Equipment; experience: Experience }): {
  templateId: string;
} {
  const split = p.gymDays >= 4 ? 'upper_lower' : 'full_ab';
  const variant =
    p.equipment === 'home_db' ? 'home_db' : p.equipment === 'basic' || p.experience === 'new' ? 'machine' : 'gym';
  return { templateId: `${split}_${variant}` };
}

/** Key sequence of a template (A, B, … or upper, lower, …). */
export function templateKeys(t: WorkoutTemplate): TemplateKey[] {
  return t.sessions.map((s) => s.key);
}

/** The key after `last` in the template's rotation (first key when there is no last). */
export function nextKey(t: WorkoutTemplate, last?: TemplateKey): TemplateKey {
  const keys = templateKeys(t);
  const first = keys[0];
  if (!first) throw new Error(`Template ${t.id} has no sessions`);
  if (!last) return first;
  const i = keys.indexOf(last);
  return i === -1 ? first : (keys[(i + 1) % keys.length] ?? first);
}

/**
 * Same movement_pattern AND primary_muscle first, then same pattern; only available, non-injury-tagged exercises;
 * prefer is_machine for experience 'new'; stable order by importance desc then name. Default n = 3.
 */
export function substitutes(p: {
  exerciseId: string;
  lib: ExerciseLib;
  equipment: Equipment;
  experience: Experience;
  injuries: readonly string[];
  n?: number;
}): ExerciseRow[] {
  const base = p.lib.byId.get(p.exerciseId);
  if (!base) return [];
  const n = p.n ?? 3;
  const pool = [...p.lib.byId.values()].filter(
    (ex) =>
      ex.id !== base.id &&
      ex.movementPattern === base.movementPattern &&
      isAvailable(ex, p.equipment) &&
      isInjurySafe(ex, p.injuries),
  );
  const group = (ex: ExerciseRow): number => (ex.primaryMuscle === base.primaryMuscle ? 0 : 1);
  const machinePref = (ex: ExerciseRow): number => (p.experience === 'new' ? (ex.isMachine ? 0 : 1) : 0);
  pool.sort(
    (a, b) =>
      group(a) - group(b) ||
      machinePref(a) - machinePref(b) ||
      b.importance - a.importance ||
      a.name.localeCompare(b.name),
  );
  return pool.slice(0, n);
}
