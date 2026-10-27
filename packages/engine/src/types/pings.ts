// Pings and state (docs/20-engineering/types.md §7, signals-and-pings.md §1–§3).
import type { Instant, LocalDate, LocalTime, MealStatus, PingType, SessionStatus, Slot } from './enums.ts';
import type { Nutrition } from './nutrition.ts';

/** `short` = one line (≤ 60 chars) used when this ping is merged into another. */
export interface CopyTemplate {
  title: string;
  body: string;
  short: string;
}

export type CopyVariant = 'standard' | 'late' | 'comeback' | 'ask';
export type DayKind = 'gym' | 'rest';

export type CopyBank = Record<PingType, Partial<Record<DayKind, Partial<Record<CopyVariant, CopyTemplate[]>>>>>;

export interface PingEventRow {
  id: string;
  pingId: string;
  type: PingType;
  scheduledFor: Instant;
  deliveredAt?: Instant;
  actedAt?: Instant;
  action?: string;
  latencyS?: number;
}

export interface Permissions {
  notifications: 'granted' | 'denied' | 'undetermined';
  location: 'always' | 'when_in_use' | 'denied' | 'undetermined';
  exactAlarms?: boolean;
}

export type SessionEvent =
  | { type: 'pre_gym_time_passed' } // derived from the schedule: now ≥ the pre_gym ping's fireAt
  | { type: 'geofence_enter' }
  | { type: 'geofence_exit_confirmed' } // exit after the 5-min debounce
  | { type: 'start'; source: 'manual' | 'geofence' | 'ping_action' }
  | { type: 'set_done' }
  | { type: 'finish' }
  | { type: 'timeout_3h' }
  | { type: 'skip' }
  | { type: 'later'; laterCount: number }
  | { type: 'midnight' };

export interface NextStepAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'quiet';
}

export interface NextStep {
  kind: 'workout' | 'meal' | 'prep' | 'rest' | 'checkin' | 'comeback' | 'tomorrow';
  refId?: string;
  time?: Instant;
  title: string;
  subtitle?: string;
  detail?: string;
  actions: NextStepAction[];
}

export interface ScheduledPing {
  /** `ping:${fireDate}:${type}` — fireDate = the local date the ping FIRES on. */
  id: string;
  type: PingType;
  fireAt: Instant;
  title: string;
  body: string;
  /** Notification category with ≤ 3 action buttons (signals-and-pings.md §4). */
  categoryId: string;
  channelId: 'pings_high' | 'pings' | 'gym' | 'system';
  sound: boolean;
  interruption: 'timeSensitive' | 'active' | 'passive';
  data: { fireDate: LocalDate; aboutDate: LocalDate; planItemId?: string; sessionId?: string; askMealItemId?: string };
}

export interface UserState {
  asOf: Instant;
  tz: string;
  day: { date: LocalDate; isGymDay: boolean; sessionId?: string };
  workout: {
    status: SessionStatus;
    startedAt?: Instant;
    endedAt?: Instant;
    startSource?: 'manual' | 'geofence' | 'ping_action';
    exerciseIdx: number;
    setIdx: number;
    setsDone: number;
    setsPlanned: number;
    laterCount: number;
  };
  location: {
    permission: Permissions['location'];
    inGymZone?: boolean;
    lastRegionEvent?: { kind: 'gym' | 'home'; type: 'enter' | 'exit'; at: Instant };
  };
  meals: Array<{ itemId: string; slot: Slot; plannedAt: Instant; status: MealStatus }>;
  /** Eaten today, with untapped meals whose time has passed counted as eaten as planned. */
  consumed: Nutrition;
  /** Still to come today: the planned nutrition of meals not yet counted in `consumed`. */
  remaining: Nutrition;
  pings: {
    soundsToday: number;
    last?: { type: PingType; at: Instant; action?: string };
    unansweredMealItemId?: string;
  };
  nextStep: NextStep;
  health?: { sleepMin?: number; steps?: number };
}

/** Local time helper type used by ping and state builders. */
export interface WakeSleep {
  wake: LocalTime;
  sleep: LocalTime;
}
