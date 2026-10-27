// Template expansion (engines.md §2.1): two seed splits → six rows `${split}_${variant}`, each slot keeping
// only its variant's preferred list and getting slotId = `${sessionKey}:${slotIndex}:${pattern}`.
import type { TemplateVariant } from '../types/enums.ts';
import type { TemplateSplitSeed, WorkoutTemplate } from '../types/reference.ts';

export const TEMPLATE_VARIANTS: readonly TemplateVariant[] = ['gym', 'machine', 'home_db'];

export function slotIdOf(sessionKey: string, slotIndex: number, pattern: string): string {
  return `${sessionKey}:${slotIndex}:${pattern}`;
}

export function expandTemplates(splits: readonly TemplateSplitSeed[]): WorkoutTemplate[] {
  const out: WorkoutTemplate[] = [];
  for (const split of splits) {
    for (const variant of TEMPLATE_VARIANTS) {
      out.push({
        id: `${split.split}_${variant}`,
        split: split.split,
        variant,
        daysPerWeek: [...split.daysPerWeek],
        sessions: split.sessions.map((s) => ({
          key: s.key,
          name: s.name,
          importance: s.importance,
          slots: s.slots.map((slot, i) => ({
            slotId: slotIdOf(s.key, i, slot.pattern),
            pattern: slot.pattern,
            primaryMuscle: slot.primaryMuscle,
            sets: slot.sets,
            repMin: slot.repMin,
            repMax: slot.repMax,
            restSec: slot.restSec,
            importance: slot.importance,
            preferred: [...slot.preferred[variant]],
          })),
        })),
      });
    }
  }
  return out;
}

const SPLIT_NAMES: Record<WorkoutTemplate['split'], string> = { full_ab: 'Full body A/B', upper_lower: 'Upper/lower' };
const VARIANT_NAMES: Record<TemplateVariant, string> = { gym: 'gym', machine: 'machines', home_db: 'home dumbbells' };

/** Display name for a template row, e.g. "Full body A/B (machines)". */
export function templateName(t: Pick<WorkoutTemplate, 'split' | 'variant'>): string {
  return `${SPLIT_NAMES[t.split]} (${VARIANT_NAMES[t.variant]})`;
}

export function templateIndex(templates: readonly WorkoutTemplate[]): Map<string, WorkoutTemplate> {
  return new Map(templates.map((t) => [t.id, t]));
}
