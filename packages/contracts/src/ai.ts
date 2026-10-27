// AI output schemas (ai-orchestration.md §4). The law: ids, enums and prose ONLY — no numeric value fields.
// The only numbers allowed are positional indexes named *Order / *Index (CoachCommand.SwapExercise.exerciseOrder).
// A contract test walks every schema here and fails on any other number.
//
// Length limits are NOT in these schemas on purpose: the validation order (§4.0) checks lengths after ids and engine
// validation, with its own reason code `too_long` (see AI_LENGTH_LIMITS). The SDK strips min/max from the JSON schema
// anyway, so they're always re-checked in code.
import { z } from 'zod';
import { CoachCommandSchema } from './commands.ts';

const Id = z.string().min(1);
const LocalDate = z.iso.date();

export const AiSlot = z.enum(['breakfast', 'lunch', 'post_workout', 'dinner', 'snack']);
export const AiUnit = z.enum([
  'g',
  'ml',
  'piece',
  'katori',
  'roti',
  'tsp',
  'tbsp',
  'cup',
  'slice',
  'scoop',
  'egg',
  'plate',
]);

export const PlanWeekOut = z.strictObject({
  meals: z.array(
    z.strictObject({
      date: LocalDate,
      slot: AiSlot,
      /** 1–3 unique recipe slugs, best first. */
      candidates: z.array(Id).min(1).max(3),
    }),
  ),
  exercises: z.array(z.strictObject({ slotId: Id, exerciseId: Id })),
  prepTasks: z.array(z.strictObject({ date: LocalDate, text: z.string() })),
  weekNote: z.string(),
});
export type PlanWeekOut = z.infer<typeof PlanWeekOut>;

export const PingCopyOut = z.strictObject({
  pings: z.array(z.strictObject({ id: Id, title: z.string(), body: z.string() })),
});
export type PingCopyOut = z.infer<typeof PingCopyOut>;

export const RebalanceLineOut = z.strictObject({ line: z.string() });
export type RebalanceLineOut = z.infer<typeof RebalanceLineOut>;

export const MealSwapOut = z.strictObject({
  picks: z
    .array(z.strictObject({ slug: Id, reason: z.string() }))
    .min(1)
    .max(3),
});
export type MealSwapOut = z.infer<typeof MealSwapOut>;

/** Observed photo quantities are enum strings, converted to numbers by code. */
export const OffplanQty = z.enum(['0.5', '1', '1.5', '2', '3', '4']);

export const OffplanParseOut = z.strictObject({
  items: z.array(
    z.strictObject({
      name: z.string().min(1),
      nameLocal: z.string().nullable(),
      unit: AiUnit,
      qty: OffplanQty,
      cooking: z.enum(['fried', 'curry', 'dry', 'raw', 'baked', 'unknown']),
      oilLevel: z.enum(['low', 'normal', 'high', 'unknown']),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
  ),
  question: z.strictObject({ text: z.string(), options: z.array(z.string()).min(1).max(4) }).nullable(),
});
export type OffplanParseOut = z.infer<typeof OffplanParseOut>;

export const MenuParseOut = z.strictObject({
  options: z.array(z.strictObject({ text: z.string().min(1), foods: z.array(z.string().min(1)) })),
});
export type MenuParseOut = z.infer<typeof MenuParseOut>;

export const CheckinNarrativeOut = z.strictObject({
  headline: z.string(),
  body: z.string(),
  nextWeekFocus: z.string(),
});
export type CheckinNarrativeOut = z.infer<typeof CheckinNarrativeOut>;

export const ThreadSummaryOut = z.strictObject({ summary: z.string() });
export type ThreadSummaryOut = z.infer<typeof ThreadSummaryOut>;

// ── Coach tools (all strict: additionalProperties false, every property required, nullable instead of optional) ──
// These Zod schemas VALIDATE tool inputs. Phase 5 TODO when building the `tools` array for the API: CoachPrefsPatch's
// fields are optional here; strict tools need every property required, so emit them as `nullable` in the tool JSON
// schema and drop nulls before validating (ai-orchestration.md §5).
export const ProposePlanChangeInput = z.strictObject({
  commands: z.array(CoachCommandSchema).min(1),
  why: z.string(),
});
export type ProposePlanChangeInput = z.infer<typeof ProposePlanChangeInput>;

export const RememberInput = z.strictObject({
  kind: z.enum(['preference', 'constraint', 'observation', 'feedback']),
  key: z.string().min(1),
  value: z.string().min(1),
});
export const LookupFoodInput = z.strictObject({ query: z.string().min(1) });
export const ExplainExerciseInput = z.strictObject({ exerciseId: Id });

export const COACH_TOOL_INPUTS = {
  propose_plan_change: ProposePlanChangeInput,
  remember: RememberInput,
  lookup_food: LookupFoodInput,
  explain_exercise: ExplainExerciseInput,
} as const;
export type CoachToolName = keyof typeof COACH_TOOL_INPUTS;

/** API-shaped coach response (mock fixtures hold this; the real provider returns the SDK's Message). */
export const CoachResponse = z.looseObject({
  stop_reason: z.string(),
  stop_details: z.looseObject({ category: z.string().optional() }).nullable().optional(),
  content: z.array(z.looseObject({ type: z.string() })),
});
export type CoachResponse = z.infer<typeof CoachResponse>;

export type CallType =
  | 'plan_week'
  | 'ping_copy'
  | 'rebalance_line'
  | 'meal_swap'
  | 'offplan_parse'
  | 'menu_parse'
  | 'coach_chat'
  | 'checkin_narrative'
  | 'thread_summary';

export const CALL_TYPES: readonly CallType[] = [
  'plan_week',
  'ping_copy',
  'rebalance_line',
  'meal_swap',
  'offplan_parse',
  'menu_parse',
  'coach_chat',
  'checkin_narrative',
  'thread_summary',
];

/** Structured-output schema per call type (coach_chat uses tools instead). */
export const AI_OUTPUT_SCHEMAS = {
  plan_week: PlanWeekOut,
  ping_copy: PingCopyOut,
  rebalance_line: RebalanceLineOut,
  meal_swap: MealSwapOut,
  offplan_parse: OffplanParseOut,
  menu_parse: MenuParseOut,
  checkin_narrative: CheckinNarrativeOut,
  thread_summary: ThreadSummaryOut,
} as const;

/**
 * Prose length limits (ai-orchestration.md §3–§4), checked in code at step 5 of the validation order.
 * `words` limits count words; the rest count characters.
 */
export const AI_LENGTH_LIMITS: Record<string, { chars?: number; words?: number }> = {
  'plan_week.weekNote': { chars: 200 },
  'plan_week.prepTasks.text': { chars: 200 },
  'ping_copy.title': { chars: 40 },
  'ping_copy.body': { chars: 120 },
  'rebalance_line.line': { chars: 90 },
  'meal_swap.reason': { words: 8 },
  'checkin_narrative.headline': { chars: 60 },
  'checkin_narrative.body': { chars: 240 },
  'checkin_narrative.nextWeekFocus': { chars: 80 },
  'thread_summary.summary': { chars: 600 },
  'coach_chat.why': { chars: 200 },
};
