// App-wide state: the database, the bundle, onboarding answers, the plan snapshot and the clock. Screens read it
// through useApp(); they never touch SQLite or the engine's planning functions directly.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { getCalendars } from 'expo-localization';
import { randomUUID } from 'expo-crypto';
import type { BundleLib } from '@fitg/contracts';
import { localDateOf, msOf, type Instant, type PlanCommandBody, type RejectReason } from '@fitg/engine';
import { setHapticsEnabled } from '@/lib/haptics';
import { openDatabase } from '../db/expo-sql';
import { DEVICE_TABLES } from '../db/migrations';
import type { Sql } from '../db/sql';
import { kvDelete, kvGet, kvSet, wipeAll } from '../db/store';
import { completeOnboarding, KV, loadSnapshot, runCommand, type BackendDeps, type Snapshot } from '../domain/backend';
import { getLib } from '../domain/bundle';
import { DEFAULT_ANSWERS, type OnboardingAnswers } from '../domain/onboarding';
import type { LocalContext } from '../domain/today';
import { track } from '../analytics/analytics';
import type { Appearance } from '../ui/theme';

type Status = 'booting' | 'onboarding' | 'ready' | 'error';

const PREFS = {
  appearance: 'appearance',
  haptics: 'haptics',
  devOffset: 'dev_time_offset_ms',
  local: 'local_context',
  lastOpenDay: 'last_open_day',
} as const;

/** How often time-based screens refresh while open. */
const CLOCK_MS = 30_000;

/** Time travel in Settings. On unless EXPO_PUBLIC_DEV_TOOLS=0 (store builds); off also ignores a saved offset. */
export const DEV_TOOLS = process.env.EXPO_PUBLIC_DEV_TOOLS !== '0';

export interface AppContextValue {
  status: Status;
  error?: string;
  lib: BundleLib;
  snapshot?: Snapshot;
  answers: OnboardingAnswers;
  updateAnswers: (patch: Partial<OnboardingAnswers>) => void;
  /** Builds the plan from the current answers (or returns the plan already built from exactly these answers). */
  finishOnboarding: () => Promise<Snapshot>;
  enterApp: () => void;
  runPlanCommand: (body: PlanCommandBody) => Promise<RejectReason | undefined>;
  local: LocalContext;
  updateLocal: (patch: Partial<LocalContext>) => void;
  /**
   * The app clock as a value: real time plus the developer time-travel offset, refreshed every 30 s, on foreground
   * and after every change. Screens build their views from it, so a view can't silently keep an old time.
   */
  clock: Instant;
  /** The current instant (for timestamps the moment something happens). */
  now: () => Instant;
  tz: string;
  devOffsetMs: number;
  setDevOffset: (ms: number) => Promise<void>;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  hapticsOn: boolean;
  setHapticsOn: (on: boolean) => void;
  startOver: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

const EMPTY_LOCAL: LocalContext = {
  permissions: { notifications: 'undetermined', location: 'undetermined' },
  seenComebackIds: [],
  doneTaskKeys: [],
};

/** Runs `task` once at a time: a call while one is running gets the running promise. */
function useSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  const running = useRef<Promise<T> | null>(null);
  const latest = useRef(task);
  useEffect(() => {
    latest.current = task;
  });
  return useCallback(() => {
    running.current ??= latest.current().finally(() => {
      running.current = null;
    });
    return running.current;
  }, []);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const lib = useMemo(() => getLib(), []);
  const tz = useMemo(() => deviceTimeZone(), []);
  const sqlRef = useRef<Sql | null>(null);
  const [status, setStatus] = useState<Status>('booting');
  const [error, setError] = useState<string>();
  const [snapshot, setSnapshotState] = useState<Snapshot>();
  const snapshotRef = useRef<Snapshot | undefined>(undefined);
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS);
  const answersRef = useRef<OnboardingAnswers>(DEFAULT_ANSWERS);
  /** The answers the current snapshot was built from (onboarding only). */
  const builtFrom = useRef<string | null>(null);
  const [local, setLocal] = useState<LocalContext>(EMPTY_LOCAL);
  const [devOffsetMs, setDevOffsetMs] = useState(0);
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [hapticsOn, setHapticsOnState] = useState(true);
  const offsetRef = useRef(0);
  const dayRef = useRef<string | undefined>(undefined);
  const commands = useRef<Promise<unknown>>(Promise.resolve());

  const now = useCallback((): Instant => new Date(Date.now() + offsetRef.current).toISOString(), []);
  const [clock, setClock] = useState<Instant>(() => now());
  const refreshClock = useCallback(() => setClock(now()), [now]);

  const setSnapshot = useCallback((snap: Snapshot | undefined) => {
    snapshotRef.current = snap;
    setSnapshotState(snap);
  }, []);

  const deps = useCallback((): BackendDeps => {
    if (!sqlRef.current) throw new Error('Database not open yet');
    return { sql: sqlRef.current, lib, newId: randomUUID };
  }, [lib]);

  const reload = useSingleFlight(async () => {
    const snap = await loadSnapshot(deps(), now());
    setSnapshot(snap);
    if (snap) dayRef.current = localDateOf(now(), snap.profile.tz);
    refreshClock();
    return snap;
  });

  // Boot: open the database, restore settings, the draft and the plan.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sql = await openDatabase();
        sqlRef.current = sql;
        const [savedAppearance, savedHaptics, savedOffset, savedLocal, draft] = await Promise.all([
          kvGet<Appearance>(sql, PREFS.appearance),
          kvGet<boolean>(sql, PREFS.haptics),
          kvGet<number>(sql, PREFS.devOffset),
          kvGet<LocalContext>(sql, PREFS.local),
          kvGet<OnboardingAnswers>(sql, KV.draft),
        ]);
        if (!alive) return;
        if (savedAppearance) setAppearanceState(savedAppearance);
        if (savedHaptics !== undefined) {
          setHapticsOnState(savedHaptics);
          setHapticsEnabled(savedHaptics);
        }
        offsetRef.current = DEV_TOOLS ? (savedOffset ?? 0) : 0;
        setDevOffsetMs(offsetRef.current);
        if (savedLocal) setLocal({ ...EMPTY_LOCAL, ...savedLocal });
        if (draft) {
          answersRef.current = { ...DEFAULT_ANSWERS, ...draft };
          setAnswers(answersRef.current);
        }
        const snap = await reload();
        if (!alive) return;
        setStatus(snap ? 'ready' : 'onboarding');
        const day = localDateOf(now(), snap?.profile.tz ?? tz);
        if ((await kvGet<string>(sql, PREFS.lastOpenDay)) !== day) {
          await kvSet(sql, PREFS.lastOpenDay, day);
          track('app_opened');
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
    // Boot runs once.
  }, []);

  // Clock: refresh every 30 s and on foreground; a new local day replans and catches up (missed sessions).
  useEffect(() => {
    const bump = () => {
      refreshClock();
      const snap = snapshotRef.current;
      if (snap && dayRef.current !== localDateOf(now(), snap.profile.tz)) void reload();
    };
    const timer = setInterval(bump, CLOCK_MS);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') bump();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [now, reload, refreshClock]);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateAnswers = useCallback((patch: Partial<OnboardingAnswers>) => {
    const next = { ...answersRef.current, ...patch };
    answersRef.current = next;
    setAnswers(next);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (sqlRef.current) void kvSet(sqlRef.current, KV.draft, next);
    }, 300);
  }, []);

  const finishOnboarding = useSingleFlight(async () => {
    const answersNow = answersRef.current;
    const key = JSON.stringify(answersNow);
    const existing = snapshotRef.current;
    // Back from the reveal without changing anything: keep the plan. Any changed answer rebuilds it (same user id,
    // rows replaced by id and date range).
    if (existing && builtFrom.current === key) return existing;
    const snap = await completeOnboarding(deps(), answersNow, { now: now(), tz });
    builtFrom.current = key;
    dayRef.current = localDateOf(now(), snap.profile.tz);
    setSnapshot(snap);
    refreshClock();
    track('onboarding_completed');
    return snap;
  });

  const enterApp = useCallback(() => {
    if (sqlRef.current) void kvDelete(sqlRef.current, KV.draft);
    setStatus('ready');
  }, []);

  const runPlanCommand = useCallback(
    (body: PlanCommandBody): Promise<RejectReason | undefined> => {
      // One command at a time, each applied to the plan the previous one produced.
      const run = commands.current.then(async () => {
        const snap = snapshotRef.current;
        if (!snap) return 'not_found' as const;
        const r = await runCommand(deps(), snap, body, now());
        setSnapshot(r.snapshot);
        refreshClock();
        return r.reject;
      });
      commands.current = run.catch(() => undefined);
      return run;
    },
    [deps, now, setSnapshot, refreshClock],
  );

  const updateLocal = useCallback((patch: Partial<LocalContext>) => {
    setLocal((cur) => {
      const next = { ...cur, ...patch };
      if (sqlRef.current) void kvSet(sqlRef.current, PREFS.local, next);
      return next;
    });
  }, []);

  const setDevOffset = useCallback(
    async (ms: number) => {
      // Never before the moment the plan starts: the app has no plan or targets for earlier dates.
      const sql = sqlRef.current;
      const onboardedAt = sql ? await kvGet<string>(sql, KV.onboardedAt) : undefined;
      const floor = onboardedAt ? msOf(onboardedAt) - Date.now() : -Infinity;
      const offset = Math.max(ms, floor);
      offsetRef.current = offset;
      setDevOffsetMs(offset);
      if (sql) await kvSet(sql, PREFS.devOffset, offset);
      await reload();
    },
    [reload],
  );

  const setAppearance = useCallback((a: Appearance) => {
    setAppearanceState(a);
    if (sqlRef.current) void kvSet(sqlRef.current, PREFS.appearance, a);
  }, []);

  const setHapticsOn = useCallback((on: boolean) => {
    setHapticsOnState(on);
    setHapticsEnabled(on);
    if (sqlRef.current) void kvSet(sqlRef.current, PREFS.haptics, on);
  }, []);

  const startOver = useCallback(async () => {
    const sql = sqlRef.current;
    if (!sql) return;
    await wipeAll(sql, [...DEVICE_TABLES, 'outbox_commands', 'outbox_logs', 'sync_state', 'kv']);
    // Device preferences survive starting over; only the user's data goes.
    await kvSet(sql, PREFS.appearance, appearance);
    await kvSet(sql, PREFS.haptics, hapticsOn);
    offsetRef.current = 0;
    setDevOffsetMs(0);
    setSnapshot(undefined);
    builtFrom.current = null;
    answersRef.current = DEFAULT_ANSWERS;
    setAnswers(DEFAULT_ANSWERS);
    setLocal(EMPTY_LOCAL);
    setError(undefined);
    refreshClock();
    setStatus('onboarding');
  }, [appearance, hapticsOn, setSnapshot, refreshClock]);

  const value: AppContextValue = {
    status,
    ...(error ? { error } : {}),
    lib,
    ...(snapshot ? { snapshot } : {}),
    answers,
    updateAnswers,
    finishOnboarding,
    enterApp,
    runPlanCommand,
    local,
    updateLocal,
    clock,
    now,
    tz,
    devOffsetMs,
    setDevOffset,
    appearance,
    setAppearance,
    hapticsOn,
    setHapticsOn,
    startOver,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() outside <AppProvider>');
  return ctx;
}
