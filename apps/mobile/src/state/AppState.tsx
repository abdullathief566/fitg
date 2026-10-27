// App-wide state: the database, the bundle, onboarding answers, the plan snapshot and the clock. Screens read it
// through useApp(); they never touch SQLite or the engine's planning functions directly.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { getCalendars } from 'expo-localization';
import { randomUUID } from 'expo-crypto';
import type { BundleLib } from '@fitg/contracts';
import { localDateOf, type Instant, type PlanCommandBody, type RejectReason } from '@fitg/engine';
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

export interface AppContextValue {
  status: Status;
  error?: string;
  lib: BundleLib;
  snapshot?: Snapshot;
  answers: OnboardingAnswers;
  updateAnswers: (patch: Partial<OnboardingAnswers>) => void;
  finishOnboarding: () => Promise<Snapshot>;
  enterApp: () => void;
  runPlanCommand: (body: PlanCommandBody) => Promise<RejectReason | undefined>;
  local: LocalContext;
  updateLocal: (patch: Partial<LocalContext>) => void;
  /** The app clock: real time plus the developer time-travel offset. */
  now: () => Instant;
  /** Bumps every 30 s and on foreground, so time-based screens re-render. */
  tick: number;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const lib = useMemo(() => getLib(), []);
  const tz = useMemo(() => deviceTimeZone(), []);
  const sqlRef = useRef<Sql | null>(null);
  const [status, setStatus] = useState<Status>('booting');
  const [error, setError] = useState<string>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS);
  const [local, setLocal] = useState<LocalContext>(EMPTY_LOCAL);
  const [devOffsetMs, setDevOffsetMs] = useState(0);
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [hapticsOn, setHapticsOnState] = useState(true);
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);
  const dayRef = useRef<string | undefined>(undefined);

  const now = useCallback((): Instant => new Date(Date.now() + offsetRef.current).toISOString(), []);
  const deps = useCallback((): BackendDeps => {
    if (!sqlRef.current) throw new Error('Database not open yet');
    return { sql: sqlRef.current, lib, newId: randomUUID };
  }, [lib]);

  const reload = useCallback(async () => {
    const snap = await loadSnapshot(deps(), now());
    setSnapshot(snap);
    if (snap) dayRef.current = localDateOf(now(), snap.profile.tz);
    return snap;
  }, [deps, now]);

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
        offsetRef.current = savedOffset ?? 0;
        setDevOffsetMs(savedOffset ?? 0);
        if (savedLocal) setLocal({ ...EMPTY_LOCAL, ...savedLocal });
        if (draft) setAnswers({ ...DEFAULT_ANSWERS, ...draft });
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
  }, [reload, now, tz]);

  // Clock: re-render every 30 s and on foreground; a new local day replans and catches up (missed sessions).
  useEffect(() => {
    const bump = () => {
      setTick((n) => n + 1);
      if (snapshot && dayRef.current !== localDateOf(now(), snapshot.profile.tz)) void reload();
    };
    const timer = setInterval(bump, 30_000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') bump();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [snapshot, now, reload]);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateAnswers = useCallback((patch: Partial<OnboardingAnswers>) => {
    setAnswers((cur) => {
      const next = { ...cur, ...patch };
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (sqlRef.current) void kvSet(sqlRef.current, KV.draft, next);
      }, 300);
      return next;
    });
  }, []);

  const finishOnboarding = useCallback(async () => {
    const snap = await completeOnboarding(deps(), answers, { now: now(), tz });
    if (sqlRef.current) await kvDelete(sqlRef.current, KV.draft);
    dayRef.current = localDateOf(now(), snap.profile.tz);
    setSnapshot(snap);
    track('onboarding_completed');
    return snap;
  }, [deps, answers, now, tz]);

  const enterApp = useCallback(() => setStatus('ready'), []);

  const runPlanCommand = useCallback(
    async (body: PlanCommandBody) => {
      if (!snapshot) return 'not_found' as const;
      const r = await runCommand(deps(), snapshot, body, now());
      setSnapshot(r.snapshot);
      return r.reject;
    },
    [deps, snapshot, now],
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
      offsetRef.current = ms;
      setDevOffsetMs(ms);
      if (sqlRef.current) await kvSet(sqlRef.current, PREFS.devOffset, ms);
      await reload();
      setTick((n) => n + 1);
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
    if (!sqlRef.current) return;
    await wipeAll(sqlRef.current, [...DEVICE_TABLES, 'outbox_commands', 'outbox_logs', 'sync_state', 'kv']);
    offsetRef.current = 0;
    setDevOffsetMs(0);
    setSnapshot(undefined);
    setAnswers(DEFAULT_ANSWERS);
    setLocal(EMPTY_LOCAL);
    setStatus('onboarding');
  }, []);

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
    now,
    tick,
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
