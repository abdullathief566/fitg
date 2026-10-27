// T3 Workout detail: the session's exercises with sets × reps × kg (all engine numbers) and the three form cues.
import type { BundleLib } from '@fitg/contracts';
import { pn, type PlanNumber, type SessionStatus } from '@fitg/engine';
import type { Snapshot } from './backend';
import { dayLabel, timeLabel } from './format';

export interface WorkoutExercise {
  id: string;
  order: number;
  name: string;
  muscle: string;
  sets: PlanNumber;
  /** "8–12" or "10". */
  reps: string;
  /** Undefined for bodyweight moves. */
  kg?: PlanNumber;
  /** Dumbbell moves: the weight is per hand ("10 kg each"). */
  perHand: boolean;
  restSec: PlanNumber;
  cues: string[];
  isMachine: boolean;
}

export interface WorkoutView {
  id: string;
  name: string;
  when: string;
  durationMin: PlanNumber;
  status: SessionStatus;
  movedFrom?: string;
  exercises: WorkoutExercise[];
}

export function workoutView(snapshot: Snapshot, lib: BundleLib, sessionId: string): WorkoutView | undefined {
  for (const week of snapshot.weeks) {
    const s = week.sessions.find((x) => x.id === sessionId);
    if (!s) continue;
    const sets = week.sets.filter((x) => x.sessionId === s.id && x.status !== 'skipped');
    const orders = [...new Set(sets.map((x) => x.exerciseOrder))].sort((a, b) => a - b);
    const exercises = orders.map((order): WorkoutExercise => {
      const group = sets.filter((x) => x.exerciseOrder === order);
      const first = group[0]!;
      const ex = lib.exercises.byId.get(first.exerciseId);
      const reps =
        first.targetRepsMin === first.targetRepsMax
          ? `${first.targetReps}`
          : `${first.targetRepsMin}–${first.targetRepsMax}`;
      const out: WorkoutExercise = {
        id: first.exerciseId,
        order,
        name: ex?.name ?? first.exerciseId,
        muscle: ex?.primaryMuscle ?? '',
        sets: pn(group.length),
        reps,
        restSec: pn(first.restSec),
        cues: ex ? [...ex.formCues] : [],
        isMachine: ex?.isMachine ?? false,
        perHand: ex?.loadType === 'dumbbell',
      };
      if (first.targetWeightKg > 0) out.kg = pn(first.targetWeightKg);
      return out;
    });
    const view: WorkoutView = {
      id: s.id,
      name: s.name,
      when: `${dayLabel(s.date)} · ${timeLabel(s.plannedStart, snapshot.profile.tz)}`,
      durationMin: pn(s.plannedDurationMin),
      status: s.status,
      exercises,
    };
    if (s.movedFromDate) view.movedFrom = dayLabel(s.movedFromDate);
    return view;
  }
  return undefined;
}
