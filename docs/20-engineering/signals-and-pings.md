# FitG signals and pings — how the app knows what you're doing

The app never "watches" the user. It always knows the **plan**, and these signals say what actually happened (PRD §4). Types: `types.md`.

| Signal | Phase | Source | Becomes |
|---|---|---|---|
| Setup answers | 2 | onboarding | profile → plan |
| The clock | 2 | plan times + local notifications | pings fire on time, offline; "reminded" status |
| Taps | 2–4 | ping actions, Today, gym mode, meal sheets | `events` rows |
| Geofence (optional) | 6 | `expo-location` region enter/exit | `geofence_enter` / `geofence_exit` events |
| Lock-screen buttons | 6 | Live Activity App Intents / notifee actions | `set_done` events (drained from the App Group / headless task) |
| Health data (optional) | v1.1 | HealthKit / Health Connect | derived daily flags only |

## 1. One source of truth: the events log

Every signal is appended to `events` (device SQLite first, synced later; client uuid → idempotent; payloads in `types.md` §8). Nothing edits an event. `UserState` is a **projection** computed by the same engine function on device and server:

```ts
export interface UserState {
  asOf: Instant; tz: string;
  day: { date: LocalDate; isGymDay: boolean; sessionId?: string };
  workout: { status: SessionStatus; startedAt?: Instant; endedAt?: Instant; startSource?: 'manual'|'geofence'|'ping_action';
             exerciseIdx: number; setIdx: number; setsDone: number; setsPlanned: number; laterCount: number };
  location: { permission: Permissions['location']; inGymZone?: boolean;
              lastRegionEvent?: { kind: 'gym'|'home'; type: 'enter'|'exit'; at: Instant } };
  meals: Array<{ itemId: string; slot: Slot; plannedAt: Instant; status: MealStatus }>;
  consumed: Nutrition; remaining: Nutrition;
  pings: { soundsToday: number; last?: { type: PingType; at: Instant; action?: string }; unansweredMealItemId?: string };
  nextStep: NextStep;
  health?: { sleepMin?: number; steps?: number };   // v1.1
}
export function deriveUserState(p: { plan: WeekPlan; sets: PlannedSet[]; events: EventRow[]; schedule: ScheduledPing[];
  permissions: Permissions; now: Instant; tz: string }): UserState;
export function nextStep(s: UserState, plan: WeekPlan, now: Instant): NextStep;
```

`nextStep` returns exactly one card, first match wins:
1. a workout `in_progress` or `ready` → resume gym mode;
2. a session starting within 60 min, or `reminded` → the workout card (Start · Later · Skip);
3. a missed session moved by `reshuffle` that the user hasn't seen → `comeback` card (once);
4. a finished/partial session today without a post-workout meal status → post-workout meal, until the next meal's cook-start time (its planned time − `cookTimePref` − 10 min, the same moment as its pre-meal ping) and for at most 2 h after the session ended;
5. an unconfirmed meal from 90 min before its planned time until 60 min after it → that meal (the earliest, if two qualify). Past that window an untapped meal is **never** the next step: it counts as eaten for today's math and is asked about once in the next ping ("Meals the user doesn't tap", §2);
6. a prep task due before the next meal → prep;
7. Sunday after 17:00 with the check-in not done → check-in;
8. **otherwise the next upcoming plan item today** (workout or meal, with its time);
9. nothing left today → on a **gym day**, `tomorrow` (tomorrow's first item, with its time); on a **rest day**, `rest` ("Rest day. Nothing to do but eat well."), with tomorrow's first item as the subtitle. A gym day never shows `rest`.

## 2. Gym-day state machine

```ts
export function transition(s: SessionStatus, e: SessionEvent, ctx: { setsDone: number; setsPlanned: number; now: Instant;
  startedAt?: Instant; plannedStart: Instant; sleep: LocalTime; tz: string }): SessionStatus;
```

| From | Event (`SessionEvent`) | To |
|---|---|---|
| planned | `pre_gym_time_passed` (derived: now ≥ the pre-gym ping's `fireAt`; no delivery event needed) | reminded |
| planned / reminded | `geofence_enter` within −2 h…+3 h of planned start | ready (a silent "Ready?" notification with Start, §6) |
| planned / reminded / ready | `start` (ping action, app button, lock screen) | in_progress |
| in_progress | all sets done, or `finish` with 100% | finished |
| in_progress | `finish` with < 100%, or `geofence_exit_confirmed` (after the 5-min debounce) with ≥ 1 set, or `timeout_3h` with ≥ 1 set | partial |
| in_progress / ready | `timeout_3h` or `geofence_exit_confirmed` with 0 sets | abandoned |
| planned / reminded / ready | `skip`, or `midnight` with no start | skipped → `reshuffle` (engines.md §2.3) |
| planned / reminded | `later` when `laterCount ≥ 2` and the new time would pass `sleep` | moved → `reshuffle` |

`finished | partial` → immediate after-gym ping (post-workout meal) → dinner flow. Geofence **enter is a hint, never an auto-start**: the user always taps Start.

**Meals the user doesn't tap.** FitG assumes you ate the plan for today's math (rebalance, protein bar) and asks once: the next ping carries a "Yes, ate it" action and one line ("Did lunch happen?"). No separate ping, no nagging. Which meal: `unansweredMealItemId` = the earliest meal today whose next-step window (rule 4 or 5 in §1) has closed with no status and that no earlier ping has asked about — one meal per ping, each meal asked at most once. Still unanswered at local midnight → status `unknown` (counted as eaten-as-planned for nutrition, **not** counted as confirmed in adherence metrics).

## 3. Ping scheduling (`packages/engine/src/pings/`)

```ts
export interface ScheduledPing {
  id: string;                 // `ping:${fireDate}:${type}` — fireDate = the local date the ping FIRES on (night_before about Tue fires Mon → 'ping:<Mon>:night_before')
  type: PingType; fireAt: Instant; title: string; body: string;
  categoryId: string;         // notification category with ≤ 3 action buttons (§4)
  channelId: 'pings_high'|'pings'|'gym'|'system';
  sound: boolean; interruption: 'timeSensitive'|'active'|'passive';
  data: { fireDate: LocalDate; aboutDate: LocalDate; planItemId?: string; sessionId?: string; askMealItemId?: string };
}
export function buildPingSchedule(p: { plan: WeekPlan /* covers today … today+3 */; prefs: NotificationPrefs; learned: LearnedTiming;
  copy: CopyBank; state: UserState; mealTimes: MealTimes; cookTimePref: number; wake: LocalTime; sleep: LocalTime;
  now: Instant; tz: string }): ScheduledPing[];
export function diffSchedule(existing: { id: string }[], desired: ScheduledPing[]): { cancel: string[]; schedule: ScheduledPing[] };
export function learnTiming(p: { events: PingEventRow[]; sessions: SessionPlan[]; meals: PlannedMeal[]; type: 'pre_gym'|'pre_dinner';
  currentShiftMin: number }): { shiftMin: number; samples: number };
```

**Times**
- `night_before` = `prefs.nightBefore` (default 21:30), moved earlier to `sleep − 30 min` if later than that. It is about **tomorrow**, counts toward the day it fires on, and is built only when tomorrow's plan exists (hence the plan window today … today+3).
- `pre_gym` = `planned_start − prefs.preGymOffsetMin (15) + learned.preGymShiftMin`.
- `post_gym` fallback = `planned_start + duration + 45 min`; cancelled and replaced by an immediate ping when the session finishes or a geofence exit ends it.
- `pre_dinner` = `mealTimes.dinner − cookTimePref − 10 min + learned.dinnerShiftMin` (Home Food mode: `dinner − 15 min`). Uses the **profile's** cooking time, not the recipe's.
- `trial_reminder`, `checkin`: silent (`sound: false`, `interruption: 'passive'`), don't count toward the cap, and are **not** managed by `diffSchedule` (they have their own id prefixes, §4).

**Rules (all enforced in `buildPingSchedule`, all unit-tested)**
1. **≤ 4 pings with `sound: true` per local day.** Gym day: night_before (for tomorrow) + pre_gym + post_gym + pre_dinner. Rest day: night_before + pre_dinner.
2. If a day has more candidates, keep by priority **pre_gym > post_gym > pre_dinner > night_before**.
3. **Gap**: if a lower-priority ping lands **less than 20 minutes** from a higher-priority one, drop it and append its `short` line to the higher one's body (exactly 20 minutes apart is fine).
4. **Quiet hours** = `sleep → wake`: a ping landing inside moves to `wake + 15 min` if the meal or session it is about hasn't happened yet by then; otherwise it is dropped.
5. Never schedule in the past; never schedule for a session already `in_progress|finished|partial|skipped|moved`.
6. **Copy**: built from the `CopyBank` (`copy.md` §3) — variant chosen by `hash32(fireDate + type) % n`; numbers filled by code. Validated AI copy (nightly `ping_copy`) may overlay title/body; the device never waits for the server to have a ping.
7. **Learned timing** (`learnTiming`): look at the last 3 acted events of the type. Lateness for `pre_gym` = `session.startedAt − plannedStart`; for `pre_dinner` = the "Start cooking" tap time − (`dinner − cookTimePref`). If all 3 are ≥ 20 min late → `shiftMin = min(median, 30)`; if all 3 are < 10 min late → 0; otherwise keep `currentShiftMin`. A shifted ping says so once ("Moved this to 6:45 since that's when you actually go").

**Rolling window**: pings for today … today+2 (plan known through today+3) → at most ~12 sounding pings pending, far below iOS's 64-pending limit. `diffSchedule` cancels and schedules by stable id, only for ids it owns — **never** `cancelAllScheduledNotificationsAsync`, **never** repeating DAILY/WEEKLY triggers (one DATE trigger per ping).

**Reschedule triggers**: app foreground; any plan change (local command or `sync-pull`); any ping action; session end; time-zone change; permission change; background task tick (`expo-background-task`, OS-decided ~15 min minimum — verify the API on SDK 54); a silent push from the nightly cron (best effort).

## 4. Notification plumbing (`apps/mobile/src/notifications/`)

- **Identifier prefixes**: `ping:` (owned by `diffSchedule`), `trial:` (paywall module), `checkin:` (check-in), `rest:` (rest-timer end), `ready:` (gym arrival). Each module manages only its own prefix.
- **Scheduling**: `Notifications.scheduleNotificationAsync({ identifier: ping.id, content: { title, body, data, categoryIdentifier, sound, interruptionLevel }, trigger: { type: SchedulableTriggerInputTypes.DATE, date } })`. Verify the exact prop names for SDK 54 (`interruptionLevel` on iOS needs the Time Sensitive entitlement in the dev build).
- **Categories** — **at most 3 action buttons each** (Android shows no more than 3). Action ids in brackets:
  - `night_before`: Got it [`ack`] · Change time [`change_time`, opens app]
  - `pre_gym`: Start [`start`, opens gym mode] · Later +30 [`later_30`] · Skip today [`skip`]
  - `post_gym`: Ate it [`ate`] · Swap [`swap`, opens app] · Not now [`not_now`]
  - `post_gym_fallback` (the +45 min version): Ate it [`ate`] · Swap [`swap`] · Still at the gym [`still_gym`]
  - `pre_dinner`: Start cooking [`cook`, opens kitchen mode] · Swap [`swap`, opens app] · Eating out [`eating_out`, opens app]
  - **ask variants** (`<category>_ask`): the lowest-priority action (Not now / Eating out / Skip today / Change time) is replaced by **"Yes, ate it"** [`ate_prev`]; the body names the slot ("Did lunch happen?"). One ask category per ping type — no per-slot categories.
  - `ready` (gym arrival): Start [`start`, opens gym mode]
- **Responses**: `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync()` on cold start. Every action writes a `ping_action` event (+ the domain event, e.g. `meal_status`), updates `ping_events` (acted_at, latency), then reschedules. **Verify** background action handling on iOS with the app killed; if unreliable, make every action open the app, handle it instantly and return to the previous screen.
- **Android channels**: `pings_high` (IMPORTANCE_HIGH, sound — pre_gym only), `pings` (DEFAULT, sound), `gym` (LOW, silent, ongoing), `system` (DEFAULT, silent). Runtime `POST_NOTIFICATIONS` prompt on Android 13+. **Exact alarms** (Android 12+ `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`): without them pings can drift ±10 min, which breaks "15 minutes before" — verify how expo-notifications SDK 54 handles it; add the permission and a Settings explainer.
- **Server ids**: the device id `ping:<fireDate>:<type>` is stored server-side as `ping_schedule.id = '<user_id>:ping:<fireDate>:<type>'` (the server adds the prefix in `sync-push`; `date` column = fireDate).
- **Delivery tracking**: foreground `addNotificationReceivedListener`; on app open, pings whose `fireAt` passed are marked delivered best-effort. Measure delivery rate per device model in `ping_events` (Indian OEMs kill background apps).

## 5. Gym mode on the lock screen (Phase 6, dev build)

**Shared payload** (both platforms):
```ts
interface GymActivityState { sessionId: string; sessionName: string; exerciseName: string; exerciseIdx: number;
  setIdx: number; setTotal: number; kg: number; reps: number; restEndsAt?: Instant; phase: 'lift'|'rest'|'done' }
```

**iOS Live Activity**
- `expo-apple-targets` config plugin creates `targets/workout-activity` (WidgetKit + ActivityKit, Swift/SwiftUI). A local Expo module `modules/live-activity` exposes `start(state)`, `update(state)`, `end()`.
- Buttons (iOS 17+) are `LiveActivityIntent`s compiled into the extension: `DoneSetIntent` **must work without the RN app running** — it appends `{sessionId, exerciseIdx, setIdx, at}` to an App Group `UserDefaults` key `pendingSetEvents`, advances the activity itself (next set + rest timer from the session's stored plan), and the RN app drains `pendingSetEvents` into `events` on foreground or background wake. `EditIntent` opens `fitg://gym/<sessionId>`.
- The rest timer uses `Text(timerInterval:)`, so no updates are needed during the countdown. Layouts: lock-screen banner, Dynamic Island compact/minimal/expanded (`docs/10-design/screens.md`). Always dark (`activityBackgroundTint #15110E`).
- A Live Activity starts **when the user taps Start** (the app is in the foreground then). iOS can't start one from the background, so gym arrival uses the silent "Ready?" notification (§6). (Push-to-start is v1.1.)
- iOS < 16.2: no Live Activity → pinned in-app gym mode + rest-timer notifications.
- Verify current `expo-apple-targets`, App Group signing on EAS and ActivityKit APIs before coding; the community `expo-live-activity` package is an alternative if it supports App Intents.

**Android ongoing notification**
- `@notifee/react-native` `displayNotification({ id: 'gym', android: { channelId: 'gym', ongoing: true, onlyAlertOnce: true, showChronometer: true, chronometerDirection: 'down', timestamp: restEndsAt, actions: [ {title: 'Done set', pressAction: {id: 'done_set'}}, {title: 'Edit', pressAction: {id: 'edit', launchActivity: 'default'}}, {title: 'End', pressAction: {id: 'end'}} ] } })` as a foreground service. `notifee.onBackgroundEvent` handles `done_set` headlessly (write event, recompute, re-display). Verify the current notifee API.
- Auto-end after 3 hours (scheduled check).

## 6. Geofence (Phase 6, dev build, optional)

- `Location.startGeofencingAsync('FITG_GEOFENCE', regions)` with `TaskManager.defineTask('FITG_GEOFENCE', handler)`; regions = the user's `places` (gym, home), radius 150 m (100–500 allowed), `notifyOnEnter` + `notifyOnExit`.
- Handler runs headless: open SQLite → `deriveUserState` →
  - **enter gym** with a session planned within −2 h…+3 h and status not in {in_progress, finished, partial}: write `geofence_enter`; show the **"Ready?" notification** — id `ready:<sessionId>`, category `ready`, **silent** (`interruption: 'passive'`, no sound), so it doesn't count toward the 4-a-day cap and isn't time-sensitive. It sits on the lock screen with a Start button: "Ready? Full body A. First up: leg press 3×10 at 40 kg."
  - **exit gym** while `in_progress`: debounce 5 min (ignore if re-entered); then `geofence_exit_confirmed` → partial/finished + immediate post-gym ping.
  - **enter home** within 3 h after a finished session with no post-workout meal status: update state only (the post-gym ping already fired).
- Permissions: `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]`; Android `ACCESS_BACKGROUND_LOCATION` (Google Play background-location declaration and a prominent-disclosure screen before the system prompt — budget time for review). **Without permission nothing changes except the Start button** (product law #6).

## 7. v1.1 health data (not in v1)
`health_samples` → derived flags in code only: sleep < 6 h → −1 set per exercise that day; steps > 12,000 → +100 kcal carbs at dinner. Raw HealthKit/Health Connect data is never sent to AI or analytics.
