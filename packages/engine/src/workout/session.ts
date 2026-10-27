// Scheduling a week of sessions and building one session's sets (engines.md §2.2).
import type { Equipment, Experience, LocalDate, MovementPattern, Sex, TemplateKey } from '../types/enums.ts';
import type { ExerciseLib, ExerciseRow, TemplateSession, TemplateSlot, WorkoutTemplate } from '../types/reference.ts';
import type { GymSlot } from '../types/profile.ts';
import type { PlannedSet, SessionPlan } from '../types/plan.ts';
import type { ProgressState } from '../types/workout.ts';
import { addDays, toInstant } from '../util/time.ts';
import { defaultIds, type IdFactory } from '../util/uuid.ts';
import { isAvailable, isInjurySafe, nextKey, substitutes } from './select.ts';
import { snapWeight, startingWeight, stepsFor } from './steps.ts';

/** v1 caps at 4 sessions a week. */
export const MAX_SESSIONS_PER_WEEK = 4;
export const EXERCISES_PER_DURATION: Record<45 | 60 | 75, number> = { 45: 4, 60: 5, 75: 6 };

/** One session per scheduled weekday (first slot wins on a duplicate weekday), in weekday order, max 4. */
export function normalizeSchedule(gymSchedule: readonly GymSlot[]): GymSlot[] {
  const byDay = new Map<number, GymSlot>();
  for (const s of gymSchedule) if (!byDay.has(s.weekday)) byDay.set(s.weekday, s);
  return [...byDay.values()].sort((a, b) => a.weekday - b.weekday).slice(0, MAX_SESSIONS_PER_WEEK);
}

/**
 * Sessions go on the gym_schedule days in order; keys alternate A,B,A… (or upper,lower…) starting from the key
 * AFTER lastCompletedKey (first week: A / upper). plannedStart = local date + slot start; duration = slot duration.
 */
export function scheduleWeek(p: {
  template: WorkoutTemplate;
  gymSchedule: readonly GymSlot[];
  weekStart: LocalDate;
  tz: string;
  lastCompletedKey?: TemplateKey;
  version?: number;
  ids?: IdFactory;
}): SessionPlan[] {
  const ids = p.ids ?? defaultIds;
  const slots = normalizeSchedule(p.gymSchedule);
  let key = nextKey(p.template, p.lastCompletedKey);
  return slots.map((slot, ordinal) => {
    const session = p.template.sessions.find((s) => s.key === key);
    if (!session) throw new Error(`Template ${p.template.id} has no session ${key}`);
    const date = addDays(p.weekStart, slot.weekday);
    const plan: SessionPlan = {
      id: ids('session', p.weekStart, ordinal),
      date,
      templateKey: key,
      name: session.name,
      plannedStart: toInstant(date, slot.start, p.tz),
      plannedDurationMin: slot.durationMin,
      status: 'planned',
      importance: session.importance,
      version: p.version ?? 1,
    };
    key = nextKey(p.template, key);
    return plan;
  });
}

const PATTERN_WORDS: Record<MovementPattern, string> = {
  squat: 'squats',
  hinge: 'hip hinges',
  h_push: 'pressing',
  v_push: 'overhead pressing',
  h_pull: 'rows',
  v_pull: 'pulldowns',
  lunge: 'lunges',
  core: 'core work',
  isolation: 'isolation work',
};

function slotWords(slot: TemplateSlot): string {
  return slot.pattern === 'isolation' ? `${slot.primaryMuscle} work` : PATTERN_WORDS[slot.pattern];
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export interface BuildSessionInput {
  session: TemplateSession;
  lib: ExerciseLib;
  variant: 'gym' | 'machine' | 'home_db';
  equipment: Equipment;
  homeDumbbellsKg?: number[];
  injuries: string[];
  progress: ProgressState;
  bodyweightKg: number;
  sex: Sex;
  experience: Experience;
  durationMin: 45 | 60 | 75;
  /** slotId → exerciseId from plan_week, used only if valid. */
  aiPicks?: Record<string, string>;
  /** The SessionPlan these sets belong to. */
  sessionId?: string;
  ids?: IdFactory;
}

/**
 * Picks an exercise for a slot: the AI pick if it is in `preferred`, available and not injury-tagged; else the first
 * preferred id that is available and safe; else substitutes(); else null (the slot is dropped with a note).
 */
export function fillSlot(slot: TemplateSlot, p: BuildSessionInput): ExerciseRow | null {
  const ok = (ex: ExerciseRow | undefined): ex is ExerciseRow =>
    !!ex && isAvailable(ex, p.equipment) && isInjurySafe(ex, p.injuries);
  const pick = p.aiPicks?.[slot.slotId];
  if (pick && slot.preferred.includes(pick)) {
    const ex = p.lib.byId.get(pick);
    if (ok(ex)) return ex;
  }
  for (const id of slot.preferred) {
    const ex = p.lib.byId.get(id);
    if (ok(ex)) return ex;
  }
  for (const id of slot.preferred) {
    const sub = substitutes({
      exerciseId: id,
      lib: p.lib,
      equipment: p.equipment,
      experience: p.experience,
      injuries: p.injuries,
      n: 1,
    })[0];
    if (sub) return sub;
  }
  return null;
}

/**
 * Exercises per duration: 45 → 4, 60 → 5, 75 → 6 — the highest-importance slots that could be filled are kept, in
 * template order. A slot that can't be filled (injury / equipment) is dropped with a note, and the next most
 * important slot takes its place. Sets and rest come from the slot; reps come from the slot except for bodyweight
 * exercises (their load can't increase, so they use the exercise's own range).
 * targetReps: repMin for a new weight; otherwise min(repMax, min(lastReps) + 1).
 */
export function buildSession(p: BuildSessionInput): { sets: PlannedSet[]; notes: string[] } {
  const ids = p.ids ?? defaultIds;
  const sessionId = p.sessionId ?? ids('session', p.session.key);
  const notes: string[] = [];
  const filled: Array<{ slot: TemplateSlot; index: number; ex: ExerciseRow }> = [];

  p.session.slots.forEach((slot, index) => {
    const ex = fillSlot(slot, p);
    if (ex) {
      filled.push({ slot, index, ex });
      return;
    }
    const blocking = new Set<string>();
    for (const id of slot.preferred) {
      const pref = p.lib.byId.get(id);
      for (const tag of pref?.injuryTags ?? []) if (p.injuries.includes(tag)) blocking.add(tag);
    }
    notes.push(
      blocking.size > 0
        ? `Skipped ${slotWords(slot)} today because of your ${joinWords([...blocking])}.`
        : `Skipped ${slotWords(slot)} today: nothing fits your equipment.`,
    );
  });

  const keep = new Set(
    [...filled]
      .sort((a, b) => b.slot.importance - a.slot.importance || a.index - b.index)
      .slice(0, EXERCISES_PER_DURATION[p.durationMin])
      .map((f) => f.index),
  );

  const sets: PlannedSet[] = [];
  let order = 0;
  for (const f of filled) {
    if (!keep.has(f.index)) continue;
    const { slot, ex } = f;
    const steps = stepsFor(ex, p.equipment === 'home_db' ? p.homeDumbbellsKg : undefined);
    const prog = p.progress[ex.id];
    const weight =
      prog !== undefined
        ? snapWeight(prog.currentWeightKg, steps)
        : startingWeight(ex, { bodyweightKg: p.bodyweightKg, sex: p.sex, experience: p.experience, steps });
    const bodyweight = ex.loadType === 'bodyweight';
    const repMin = bodyweight ? ex.repMin : slot.repMin;
    const repMax = bodyweight ? ex.repMax : slot.repMax;
    const lastReps = prog?.lastReps;
    const targetReps = lastReps && lastReps.length > 0 ? Math.min(repMax, Math.min(...lastReps) + 1) : repMin;
    for (let setIndex = 0; setIndex < slot.sets; setIndex++) {
      sets.push({
        id: ids('set', sessionId, order, setIndex),
        sessionId,
        exerciseId: ex.id,
        exerciseOrder: order,
        setIndex,
        targetWeightKg: weight,
        targetRepsMin: repMin,
        targetRepsMax: repMax,
        targetReps: Math.max(repMin, targetReps),
        restSec: slot.restSec,
        status: 'planned',
      });
    }
    order++;
  }
  return { sets, notes };
}
