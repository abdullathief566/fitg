// The deterministic week builder: targets → template → sessions → sets → day shapes → meals → prep tasks.
// Used by onboarding, the Sunday check-in, AI fallbacks and command re-plans. With AI candidates/picks it builds the
// AI version of the week (the AI only chooses ids; this code computes every number).
import type { Instant, LocalDate, TemplateKey } from '../types/enums.ts';
import type { MealProfile, Profile, Targets } from '../types/profile.ts';
import type {
  Candidates,
  DayShape,
  PlanDay,
  PlannedMeal,
  PlannedSet,
  PrepTask,
  Problem,
  SessionPlan,
  WeekPlan,
} from '../types/plan.ts';
import type { PlanLib } from '../types/commands.ts';
import type { WorkoutTemplate } from '../types/reference.ts';
import type { ProgressState } from '../types/workout.ts';
import { addMinutes, localTimeOf, weekDates } from '../util/time.ts';
import { makeIds, type IdFactory } from '../util/uuid.ts';
import { hash32 } from '../util/hash.ts';
import { dayShape } from '../meal/shape.ts';
import { deterministicCandidates, hasErrors, validateCandidates } from '../meal/candidates.ts';
import { planDays } from '../meal/plan.ts';
import { prepTasks } from '../meal/grocery.ts';
import { buildSession, normalizeSchedule, scheduleWeek } from '../workout/session.ts';
import { selectTemplate } from '../workout/select.ts';

export function mealProfileOf(profile: Profile, pantry: Set<string>, extra: Partial<MealProfile> = {}): MealProfile {
  return {
    diet: profile.diet,
    cuisine: profile.cuisine,
    allergies: profile.allergies,
    dislikes: profile.dislikes,
    eatingMode: profile.eatingMode,
    cookTimePref: profile.cookTimePref,
    budgetTier: profile.budgetTier,
    mealTimes: profile.mealTimes,
    weightKg: profile.weightKg,
    pantry,
    memoryDislikes: [],
    ...extra,
  };
}

/** Day shapes for dates, given the sessions on them (gym end = session start + duration). */
export function shapesFor(
  dates: readonly LocalDate[],
  sessions: readonly SessionPlan[],
  profile: Profile,
  tz: string,
): Record<LocalDate, DayShape> {
  const shapes: Record<LocalDate, DayShape> = {};
  for (const date of dates) {
    const s = sessions.find((x) => x.date === date && x.status !== 'skipped' && x.status !== 'moved');
    shapes[date] = dayShape({
      isGymDay: !!s,
      mealTimes: profile.mealTimes,
      ...(s ? { gymEnd: localTimeOf(addMinutes(s.plannedStart, s.plannedDurationMin), tz) } : {}),
      weightKg: profile.weightKg,
      eatingMode: profile.eatingMode,
    });
  }
  return shapes;
}

/** The plan-time seed for variety: frozen hash of user + week. */
export function weekSeed(userId: string, weekStart: LocalDate): number {
  return hash32(`${userId}:${weekStart}`);
}

export interface PlanWeekInput {
  profile: Profile;
  targets: Targets;
  weekStart: LocalDate;
  lib: PlanLib & { templates: Map<string, WorkoutTemplate> };
  pantry: Set<string>;
  progress?: ProgressState;
  lastCompletedKey?: TemplateKey;
  version?: number;
  /** AI meal candidates (validated first; invalid → deterministic fallback). */
  candidates?: Candidates;
  /** AI exercise picks: slotId → exerciseId (used only when valid). */
  aiPicks?: Record<string, string>;
  note?: string;
  ids?: IdFactory;
  /** Dev/tests: allow draft recipes. */
  allowDrafts?: boolean;
  now?: Instant;
}

export interface PlanWeekResult {
  plan: WeekPlan;
  problems: Problem[];
  notes: string[];
  usedAi: boolean;
  /**
   * Prep tasks announced BEFORE this week (e.g. soak rajma on Sunday for Monday's dinner). The caller attaches them to
   * the previous week's day with that date, or they would never be announced.
   */
  earlierPrepTasks: PrepTask[];
}

export function planWeek(p: PlanWeekInput): PlanWeekResult {
  // Ids are scoped by the user so device and server agree and applyCommand can recreate them.
  const ids = p.ids ?? makeIds(p.profile.userId);
  const tz = p.profile.tz;
  const version = p.version ?? 1;
  const gymDays = normalizeSchedule(p.profile.gymSchedule).length;
  const { templateId } = selectTemplate({ gymDays, equipment: p.profile.equipment, experience: p.profile.experience });
  const template = p.lib.templates.get(templateId);
  if (!template) throw new Error(`Unknown template ${templateId}`);

  const sessions = scheduleWeek({
    template,
    gymSchedule: p.profile.gymSchedule,
    weekStart: p.weekStart,
    tz,
    ...(p.lastCompletedKey ? { lastCompletedKey: p.lastCompletedKey } : {}),
    version,
    ids,
  }).map((s) => ({ ...s, version }));

  const notes: string[] = [];
  const sets: PlannedSet[] = [];
  for (const s of sessions) {
    const ts = template.sessions.find((x) => x.key === s.templateKey)!;
    const built = buildSession({
      session: ts,
      lib: p.lib.exercises,
      variant: template.variant,
      equipment: p.profile.equipment,
      homeDumbbellsKg: p.profile.homeDumbbellsKg,
      injuries: p.profile.injuries,
      progress: p.progress ?? {},
      bodyweightKg: p.profile.weightKg,
      sex: p.profile.sex,
      experience: p.profile.experience,
      durationMin: s.plannedDurationMin,
      ...(p.aiPicks ? { aiPicks: p.aiPicks } : {}),
      sessionId: s.id,
      ids,
    });
    sets.push(...built.sets);
    for (const n of built.notes) if (!notes.includes(n)) notes.push(n);
  }

  const dates = weekDates(p.weekStart);
  const shapes = shapesFor(dates, sessions, p.profile, tz);
  const mealProfile = mealProfileOf(p.profile, p.pantry, p.allowDrafts ? { allowDrafts: true } : {});
  const problems: Problem[] = [];
  let candidates = p.candidates;
  let usedAi = false;
  if (candidates) {
    const check = validateCandidates(candidates, p.lib.recipes, mealProfile, shapes);
    if (hasErrors(check)) {
      problems.push(...check);
      candidates = undefined;
    } else {
      usedAi = true;
    }
  }
  if (!candidates) {
    candidates = deterministicCandidates({
      dates,
      lib: p.lib.recipes,
      foods: p.lib.foods,
      profile: mealProfile,
      shapes,
      seed: weekSeed(p.profile.userId, p.weekStart),
    });
  }
  const planned = planDays({
    dates,
    targets: p.targets,
    candidates,
    lib: p.lib.recipes,
    foods: p.lib.foods,
    pantry: p.pantry,
    addons: p.lib.addons,
    profile: mealProfile,
    shapes,
    tz,
    ids,
    version,
  });
  problems.push(...planned.problems);

  const meals: PlannedMeal[] = planned.days.flatMap((d) => d.meals);
  const days: PlanDay[] = planned.days.map((d) => d.day);
  const earlierPrepTasks: PrepTask[] = [];
  for (const task of prepTasks(meals, p.lib.recipes, p.profile.notificationPrefs, tz)) {
    const day = days.find((d) => d.date === task.forDate);
    if (day) day.prepTasks.push(task);
    else earlierPrepTasks.push(task);
  }

  const plan: WeekPlan = {
    weekStart: p.weekStart,
    version,
    generatedBy: usedAi ? 'ai' : 'deterministic',
    templateId,
    days,
    sessions,
    sets,
    meals,
  };
  if (p.note) plan.note = p.note;
  return { plan, problems, notes, usedAi, earlierPrepTasks };
}
