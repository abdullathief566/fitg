// The validation order (ai-orchestration.md §4.0) — every call, mock and real. The first failure decides the reason;
// the caller then uses its deterministic fallback.
//   1. stop_reason refusal → refused; max_tokens → invalid (schema)
//   2. strict schema (unknown keys rejected)          → schema
//   3. ids and slugs exist in the menu sent           → unknown_slug / unknown_id
//   4. engine validation (validateCandidates, dry runs) → validation
//   5. lengths                                         → too_long
//   6. numbers (assertNoForeignNumbers)                → foreign_number
//   7. banned words (containsBannedWords)              → banned_word
import {
  AI_LENGTH_LIMITS,
  AI_OUTPUT_SCHEMAS,
  COACH_TOOL_INPUTS,
  CoachResponse,
  type CallType,
  type MealSwapOut,
  type PingCopyOut,
  type PlanWeekOut,
} from '@fitg/contracts';
import {
  assertNoForeignNumbers,
  containsBannedWords,
  numbersInText,
  type Candidates,
  type CoachCommand,
  type Problem,
  type RebalanceDiff,
  type RejectReason,
} from '@fitg/engine';

export type RejectCode =
  'schema' | 'unknown_slug' | 'unknown_id' | 'validation' | 'too_long' | 'foreign_number' | 'banned_word';

export interface ValidationOutcome {
  status: 'valid' | 'refused' | 'reject';
  reason?: RejectCode;
  detail?: string;
  /** The parsed output (structured calls) or the parsed tool inputs + text (coach). */
  value?: unknown;
  refusalCategory?: string;
}

export interface ValidationContext {
  /** Numbers the prose may use (context deep scan + 12-hour hours). `[]` in habit-only mode. */
  allowedNumbers: number[];
  /** plan_week: slugs on the recipe menu that was sent. */
  recipeMenu?: readonly string[];
  /** plan_week: slotId → exercise ids offered for it. */
  exerciseMenu?: Readonly<Record<string, readonly string[]>>;
  /** plan_week: the engine check (validateCandidates with the user's lib, profile and shapes). */
  checkCandidates?: (c: Candidates) => Problem[];
  /** ping_copy: the template-filled pings that were sent. */
  pings?: ReadonlyArray<{ id: string; title: string; body: string }>;
  /** meal_swap: the pre-filtered candidate slugs that were sent. */
  candidates?: readonly string[];
  /** rebalance_line: the diff that was sent (its numbers are allowed). */
  diff?: readonly RebalanceDiff[];
  /** coach_chat: ids that exist in the user's plan (checked when given). */
  coachIds?: {
    sessions?: readonly string[];
    meals?: readonly string[];
    recipes?: readonly string[];
    exercises?: readonly string[];
  };
  /** coach_chat: dry-run each proposed command with applyCommand; returns a reject reason or null. */
  dryRun?: (cmds: CoachCommand[]) => RejectReason | null;
  /** no_deficit users: prose may not suggest eating less or skipping meals. */
  noDeficit?: boolean;
}

const ok = (value: unknown): ValidationOutcome => ({ status: 'valid', value });
const reject = (reason: RejectCode, detail: string): ValidationOutcome => ({ status: 'reject', reason, detail });

interface Prose {
  path: string;
  text: string;
  /** Length rule key in AI_LENGTH_LIMITS. */
  limit?: string;
  /** Numbers allowed for this field (defaults to ctx.allowedNumbers). */
  allowed?: number[];
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function tooLong(p: Prose): boolean {
  if (!p.limit) return false;
  const rule = AI_LENGTH_LIMITS[p.limit];
  if (!rule) return false;
  if (rule.chars !== undefined && p.text.length > rule.chars) return true;
  if (rule.words !== undefined && words(p.text) > rule.words) return true;
  return false;
}

const NO_DEFICIT_RE =
  /\b(eat less|eating less|skip (a |the |your |this )?(meal|breakfast|lunch|dinner|snack)|cut (back|down) on|smaller portions?|lose weight faster)\b/i;

/** Steps 5–7 over a list of prose fields. */
function checkProse(fields: Prose[], ctx: ValidationContext): ValidationOutcome | null {
  for (const f of fields) if (tooLong(f)) return reject('too_long', `${f.path} is too long (${f.text.length} chars)`);
  for (const f of fields) {
    const r = assertNoForeignNumbers(f.text, f.allowed ?? ctx.allowedNumbers);
    if (!r.ok) return reject('foreign_number', `${f.path} has numbers not in its input: ${r.foreign.join(', ')}`);
  }
  for (const f of fields) {
    const banned = containsBannedWords(f.text);
    if (banned.length > 0) return reject('banned_word', `${f.path} uses: ${banned.join(', ')}`);
    if (ctx.noDeficit && NO_DEFICIT_RE.test(f.text))
      return reject('banned_word', `${f.path} suggests eating less (no_deficit)`);
  }
  return null;
}

function diffNumbers(diff: readonly RebalanceDiff[]): number[] {
  const out: number[] = [];
  for (const d of diff) {
    for (const v of [d.from, d.to]) {
      if (typeof v === 'number') out.push(v);
      else if (typeof v === 'string') out.push(...numbersInText(v));
    }
  }
  return out;
}

function candidatesOf(out: PlanWeekOut): Candidates {
  const c: Candidates = {};
  for (const m of out.meals) {
    const day = (c[m.date] ??= {});
    day[m.slot] = [...m.candidates];
  }
  return c;
}

/** Validates one structured output or coach response against §4.0. */
export function validateOutput(
  type: CallType,
  raw: unknown,
  ctx: ValidationContext,
  stopReason?: string | null,
  refusalCategory?: string,
): ValidationOutcome {
  // 1. stop_reason first.
  if (stopReason === 'refusal') return refusalCategory ? { status: 'refused', refusalCategory } : { status: 'refused' };
  if (stopReason === 'max_tokens') return reject('schema', 'stopped at max_tokens');

  if (type === 'coach_chat') return validateCoach(raw, ctx);

  // 2. Strict schema.
  const schema = AI_OUTPUT_SCHEMAS[type];
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return reject('schema', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const value = parsed.data;

  switch (type) {
    case 'plan_week': {
      const out = value as PlanWeekOut;
      // 3. Ids and slugs.
      if (ctx.recipeMenu) {
        const menu = new Set(ctx.recipeMenu);
        for (const m of out.meals)
          for (const s of m.candidates) if (!menu.has(s)) return reject('unknown_slug', `${s} is not on the menu`);
      }
      if (ctx.exerciseMenu) {
        for (const e of out.exercises) {
          const options = ctx.exerciseMenu[e.slotId];
          if (!options) return reject('unknown_id', `unknown exercise slot ${e.slotId}`);
          if (!options.includes(e.exerciseId))
            return reject('unknown_id', `${e.exerciseId} is not offered for ${e.slotId}`);
        }
      }
      // 4. Engine validation.
      if (ctx.checkCandidates) {
        const errors = ctx.checkCandidates(candidatesOf(out)).filter((p) => p.severity === 'error');
        if (errors.length > 0)
          return reject('validation', errors.map((e) => `${e.date ?? ''} ${e.slot ?? ''} ${e.code}`.trim()).join('; '));
      }
      const fail = checkProse(
        [
          { path: 'weekNote', text: out.weekNote, limit: 'plan_week.weekNote' },
          ...out.prepTasks.map((t, i) => ({
            path: `prepTasks.${i}.text`,
            text: t.text,
            limit: 'plan_week.prepTasks.text',
          })),
        ],
        ctx,
      );
      return fail ?? ok(out);
    }
    case 'ping_copy': {
      const out = value as PingCopyOut;
      const sent = new Map((ctx.pings ?? []).map((p) => [p.id, p]));
      if (ctx.pings)
        for (const p of out.pings) if (!sent.has(p.id)) return reject('unknown_id', `unknown ping id ${p.id}`);
      const fail = checkProse(
        out.pings.flatMap((p) => {
          const input = sent.get(p.id);
          const allowed = input ? numbersInText(`${input.title} ${input.body}`) : ctx.allowedNumbers;
          return [
            { path: `${p.id}.title`, text: p.title, limit: 'ping_copy.title', allowed },
            { path: `${p.id}.body`, text: p.body, limit: 'ping_copy.body', allowed },
          ];
        }),
        ctx,
      );
      return fail ?? ok(out);
    }
    case 'rebalance_line': {
      const out = value as { line: string };
      const allowed = [...ctx.allowedNumbers, ...diffNumbers(ctx.diff ?? [])];
      return checkProse([{ path: 'line', text: out.line, limit: 'rebalance_line.line', allowed }], ctx) ?? ok(out);
    }
    case 'meal_swap': {
      const out = value as MealSwapOut;
      if (ctx.candidates) {
        const allowed = new Set(ctx.candidates);
        for (const p of out.picks)
          if (!allowed.has(p.slug)) return reject('unknown_slug', `${p.slug} was not a candidate`);
      }
      if (new Set(out.picks.map((p) => p.slug)).size !== out.picks.length)
        return reject('validation', 'duplicate picks');
      const fail = checkProse(
        // Reasons may contain no digits at all.
        out.picks.map((p, i) => ({
          path: `picks.${i}.reason`,
          text: p.reason,
          limit: 'meal_swap.reason',
          allowed: [],
        })),
        ctx,
      );
      return fail ?? ok(out);
    }
    case 'offplan_parse': {
      const out = value as {
        items: Array<{ name: string; nameLocal: string | null }>;
        question: { text: string; options: string[] } | null;
      };
      const fields: Prose[] = [];
      out.items.forEach((it, i) => {
        fields.push({ path: `items.${i}.name`, text: it.name });
        if (it.nameLocal) fields.push({ path: `items.${i}.nameLocal`, text: it.nameLocal });
      });
      if (out.question) {
        fields.push({ path: 'question.text', text: out.question.text });
        out.question.options.forEach((o, i) => fields.push({ path: `question.options.${i}`, text: o }));
      }
      return checkProse(fields, ctx) ?? ok(out);
    }
    case 'menu_parse': {
      const out = value as { options: Array<{ text: string; foods: string[] }> };
      const fields: Prose[] = out.options.flatMap((o, i) => [
        { path: `options.${i}.text`, text: o.text },
        ...o.foods.map((f, j) => ({ path: `options.${i}.foods.${j}`, text: f })),
      ]);
      return checkProse(fields, ctx) ?? ok(out);
    }
    case 'checkin_narrative': {
      const out = value as { headline: string; body: string; nextWeekFocus: string };
      return (
        checkProse(
          [
            { path: 'headline', text: out.headline, limit: 'checkin_narrative.headline' },
            { path: 'body', text: out.body, limit: 'checkin_narrative.body' },
            { path: 'nextWeekFocus', text: out.nextWeekFocus, limit: 'checkin_narrative.nextWeekFocus' },
          ],
          ctx,
        ) ?? ok(out)
      );
    }
    case 'thread_summary': {
      const out = value as { summary: string };
      return checkProse([{ path: 'summary', text: out.summary, limit: 'thread_summary.summary' }], ctx) ?? ok(out);
    }
  }
}

export interface CoachValue {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
}

function validateCoach(raw: unknown, ctx: ValidationContext): ValidationOutcome {
  const parsed = CoachResponse.safeParse(raw);
  if (!parsed.success) return reject('schema', 'not a coach response');
  const res = parsed.data;
  // Step 1 on the response itself (mock fixtures carry their own stop_reason).
  if (res.stop_reason === 'refusal') {
    const cat = res.stop_details?.category;
    return cat ? { status: 'refused', refusalCategory: cat } : { status: 'refused' };
  }
  if (res.stop_reason === 'max_tokens') return reject('schema', 'stopped at max_tokens');

  // Read blocks by type — never content[0].
  const texts: string[] = [];
  const toolCalls: CoachValue['toolCalls'] = [];
  for (const block of res.content) {
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
    if (block.type === 'tool_use') {
      const name = String(block.name ?? '');
      const schema = COACH_TOOL_INPUTS[name as keyof typeof COACH_TOOL_INPUTS];
      if (!schema) return reject('schema', `unknown tool ${name}`);
      const input = schema.safeParse(block.input);
      if (!input.success)
        return reject(
          'schema',
          `${name}: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      toolCalls.push({ id: String(block.id ?? ''), name, input: input.data });
    }
  }

  const proposals = toolCalls
    .filter((t) => t.name === 'propose_plan_change')
    .map((t) => t.input as { commands: CoachCommand[]; why: string });
  if (proposals.length > 1) return reject('validation', 'more than one change set in one reply');

  // 3. Ids exist.
  const ids = ctx.coachIds;
  if (ids) {
    for (const p of proposals) {
      for (const c of p.commands) {
        if ('sessionId' in c && ids.sessions && !ids.sessions.includes(c.sessionId))
          return reject('unknown_id', `unknown session ${c.sessionId}`);
        if ('itemId' in c && ids.meals && !ids.meals.includes(c.itemId))
          return reject('unknown_id', `unknown meal ${c.itemId}`);
        if (c.kind === 'SwapMeal' && ids.recipes && !ids.recipes.includes(c.recipeSlug))
          return reject('unknown_slug', `unknown recipe ${c.recipeSlug}`);
        if (c.kind === 'SwapExercise' && ids.exercises && !ids.exercises.includes(c.exerciseId))
          return reject('unknown_id', `unknown exercise ${c.exerciseId}`);
      }
    }
  }
  // 4. Dry run.
  if (ctx.dryRun) {
    for (const p of proposals) {
      const why = ctx.dryRun(p.commands);
      if (why) return reject('validation', `dry run rejected: ${why}`);
    }
  }
  // 5–7 on the reply text and the proposal's reason.
  const fields: Prose[] = texts.map((t, i) => ({ path: `text.${i}`, text: t }));
  proposals.forEach((p, i) =>
    fields.push({ path: `propose_plan_change.${i}.why`, text: p.why, limit: 'coach_chat.why' }),
  );
  const fail = checkProse(fields, ctx);
  if (fail) return fail;
  const value: CoachValue = { text: texts.join('\n'), toolCalls };
  return ok(value);
}

/** "valid" | "refused" | "reject:<reason>" — the fixture `expect` format. */
export function outcomeLabel(o: ValidationOutcome): string {
  return o.status === 'reject' ? `reject:${o.reason}` : o.status;
}
