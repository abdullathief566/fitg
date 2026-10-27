# FitG testing strategy

Every phase ends green on `npm test && npm run typecheck` (root scripts fan out to all workspaces), plus `deno test supabase/functions` from Phase 3. CI always runs with `AI_PROVIDER=mock`. Each test below is tagged with the phase that builds it.

## 1. Engine golden tests (`packages/engine/test/`, Vitest) — Phase 1
Fixtures `test/fixtures/golden/*.json` as `{ input, expected }`. Expected values were computed with a reference implementation of `engines.md` on 2026-10-27; if code disagrees, the code is wrong (or the spec changed — update both together). Meal tests load the seed recipes and `data/sample/foods.sample.json` **in-process** (they never depend on `data:build` output) with `allowDrafts: true`.

**The T1 full profile** (end-to-end week, M1–M2, P1): male, born 1998 (28 y), 175 cm, 75 kg, goal `fat_loss`, activity `desk`, experience `new`, equipment `full`, no injuries, gym schedule Mon/Wed/Fri 18:30 for 60 min, all days available, diet `non_veg`, cuisine `indian`, eating mode `cook`, wake 07:00, sleep 23:00, meals breakfast 08:00 · lunch 13:00 · **snack 17:00** · dinner 21:15, cook time 20 min, budget 2, timezone `Asia/Kolkata`, night-before ping 21:30, pre-gym offset 15, pantry = the foods marked `staple: true` in `foods.map.json` (egg, atta, rice, toor dal, curd, milk, oats, onion, tomato, potato, oil). Expected: targets **1850 / P120 / F55 / C220**; template `full_ab_machine` (experience `new` → machine variant); week Mon A · Wed B · Fri A; **every day planned `ok`** (kcal within ±5% of 1850, protein ≥ 114 g, post-workout ≥ 30 g on gym days) — the reference run achieves all 7; each gym day has exactly 4 sounding pings at 18:15 · 20:15 · 20:45 · 21:30.

**Targets** (`computeTargets`, `weeklyAdjust`) — T1–T11 and T8 exactly as in `engines.md` §5, plus property tests: kcal never below the floor; protein never above 40% of kcal; carbs ≥ 50 g; `habit_only` only with `edHistory`; adjust ≥ 0 whenever pregnant/diabetes/glp1; AF always has ≤ 2 decimals.

**Workout** — W1–W6 as in `engines.md` §5, plus:
- `selectTemplate`: (3 days, full, gt6m) → `full_ab_gym`; (2, basic, lt6m) → `full_ab_machine`; (3, full, new) → `full_ab_machine`; (4, home_db, any) → `upper_lower_home_db`.
- `buildSession` duration fit: 45 → 4 exercises, 60 → 5, 75 → 6 (lowest-importance slots dropped first); home_db never gets a barbell/machine/cable exercise; `aiPicks` used only when valid; sets/rest from the slot, reps from the slot except bodyweight exercises.
- `startingWeight`: barbell for `new` = 20; dumbbells snap to the ladder; never below the minimum step.
- `calibrate`: 20 kg barbell `too_easy` → 25 (≥ +1 step); 10 kg dumbbell `too_heavy` → 7.5.
- `scheduleWeek`: keys alternate from the key after `lastCompletedKey`; never two sessions a day.

**Meals** (seed recipes + `foods.sample.json` values):
- **M1** T1 targets, gym day, items breakfast `egg-bhurji-roti`, lunch `chicken-curry-rice`, post-workout `chicken-rice-bowl`, dinner `dal-rice-meal`, snack `curd-banana-pb-snack`: `scaleDay` → `ok`; kcal within ±5% of 1850; protein ≥ 114 g; post-workout ≥ 30 g. Reference: 1,904.1 kcal / 114.6 g with multipliers 1 · 1 · 1 · 0.5 · 1 and no add-ons.
- **M2** T1 gym day; breakfast eaten as planned; lunch replaced at 14:00 by an off-plan log of 900 kcal / 25 g; remaining post-workout `chicken-rice-bowl`, dinner `dal-rice-meal`, snack `curd-banana-pb-snack`: `rebalanceDay` → multipliers within [0.5, 1.5]; at least one protein add-on; post-workout ≥ 30 g; `tomorrowDeltaKcal` ∈ [−200, 0] and never positive. Reference: post-workout ×0.75 + 2 boiled eggs, dinner ×0.5 + 1 boiled egg, snack ×0.5, `tomorrowDeltaKcal = −200`.
- **M3** Home Food: dal tadka + roti + aloo gobi, slot target 600 kcal, 75 kg: labels in household units; kcal within ±10% of 600 or at minimum portions; a protein add-on when protein < 30 g; nutrition from the component recipes.
- **M4** end-to-end T1 week via `deterministicCandidates` + `planDays`: all 7 days `ok`; no recipe twice in a day; ≤ 3 distinct breakfasts; no `component` or `requires`-missing recipe (no whey shake: T1 has no whey).
- `validateCandidates`: a non-veg recipe for a veg user → `diet`; 4 distinct first-choice breakfasts → `too_many_breakfasts`; a disliked ingredient → `dislike`; rajma (40 min) on a weekday dinner for T1 → `cook_time`; a `component` recipe → error.
- `deterministicCandidates`: same seed → identical output; different seed → different but valid.
- `groceryList`: staples excluded; eggs as counts; grams rounded up to 50. `prepTasks`: rajma on Sunday dinner → "Soak the rajma tonight" on Saturday's night-before ping.

**Pings** (`buildPingSchedule` with a fake clock; tz `Asia/Kolkata`; wake 07:00; sleep 23:00; night-before 21:30; learned shifts 0; `now = 08:00` local):
- **P1** gym day, session 18:30 for 60 min, dinner 21:15, cook 20 → exactly 4 sounding pings that day: pre_gym **18:15** (`timeSensitive`, channel `pings_high`), post_gym **20:15** (fallback), pre_dinner **20:45**, night_before **21:30**.
- **P2** rest day, dinner 21:15, cook 20 → exactly 2: pre_dinner 20:45, night_before 21:30.
- **P3** `learnTiming` (currentShiftMin 0) with three acted pre_gym events 25 / 30 / 22 min late → `shiftMin = 25`; then three on-time starts → 0; mixed lateness → keeps the current value.
- **P4** dinner 23:40, cook 20 → pre_dinner would be 23:10 (inside quiet hours; dinner passes before wake) → dropped. Over the 3-day window, pending pings ≤ 20.
- **P5** session 19:00 for 45 min (post_gym fallback 20:30), dinner 21:00, cook 10 (pre_dinner 20:40, 10 min after post_gym) → pre_dinner dropped, its `short` line appended to post_gym's body; 3 sounding pings that day (18:45, 20:30, 21:30). Exactly 20 minutes apart would NOT merge.
- `diffSchedule`: unchanged pings are not rescheduled; removed ones are cancelled by id; only `ping:` ids are touched (a `trial:` id survives).
- Ids: `ping:<fireDate>:<type>`; the night-before ping about Tuesday fires Monday → `ping:<Monday>:night_before`.

**State** — **S1** planned → (`pre_gym_time_passed`, derived from the schedule) reminded → (`start`) in_progress → (`geofence_exit_confirmed`, 3 of 15 sets done) **partial**. Plus: exit then re-enter within 5 min → still in_progress; `timeout_3h` with 0 sets → abandoned; `skip` → skipped and `reshuffle` called. `nextStep` returns exactly one card for every hour of T1's gym day and rest day (never "Rest day" on a gym day).

**Commands** — `applyCommand`: stale `basePlanVersion` on a replaced row → `stale`; `SetSessionFeedback` on a planned session → `invalid_status`; `SetMealStatus` on an `unknown` meal → applied; `SwapMeal` to a recipe that breaks diet → `invalid_value`.

**Validators** — `assertNoForeignNumbers`: "Bench 3×8 at 30 kg" with {3, 8, 30} → ok; "eat 1,800 kcal" with {1850} → foreign [1800]; "Gym's at 6:30" with context time 18:30 → ok (12-hour form allowed); "1½ katori" → 1.5; `habit_only` (allowed []) rejects any digit. `containsBannedWords`: "cheat day" and "Don’t break your streak" flagged; "cheater", "fat loss" and "low-fat curd" not flagged.

## 2. AI contract tests (`packages/ai/test/`)
- **Phase 1**: every fixture in `fixtures/ai/**` runs through the validation order (`ai-orchestration.md` §4.0) and produces exactly its `expect`; `plan_week` fixtures use T1's menus rebuilt from the seed. Schema walk: no `z.number()` value fields in any AI output or coach-tool schema except `*Order` / `*Index`. `MockProvider` selection (by scenario; default = first valid fixture).
- **Phase 5**: `AnthropicProvider` request-builder snapshot tests (no network): no `temperature`/`top_p`/`top_k`; `tool_choice` absent or `auto`; `output_config.effort` always set; Haiku requests never contain `fallbacks`; Batch params never contain `fallbacks`; coach requests contain both betas and `block_binding`. **Coach append-only test**: simulate 6 turns with tools using recorded mock responses; assert each request's `system`, `tools` and `messages[0..n-1]` are byte-identical to the previous request's (only appends). Optional live smoke test (manual, with a key) with `prefix_mismatch_behavior: 'error'`.

## 3. Edge Function tests (`deno test supabase/functions`, local DB, `AI_PROVIDER=mock`)
- **Phase 3**: `onboard-complete` returns T1 targets and a full valid week for the T1 profile; `plan-command` is idempotent by id, rejects stale commands after a replan, never overwrites actuals; `sync-push` with the same events twice → no duplicates; `sync-pull` cursor monotonic; **RLS**: with the anon key and user A's JWT, selecting user B's rows from every per-user table returns 0 rows, and REST writes are denied.
- **Phase 5**: rate limits (11th coach message for a trial user → 429 — until Phase 7 every user counts as "trial"); `log-offplan` pending → parsed flow; batch apply only touches `planned` rows dated ≥ tomorrow.
- **Phase 7**: `revenuecat-webhook` — wrong secret → 401; sandbox payload → `subscriptions` updated; AI endpoints return 403 after the trial without entitlement (3-day grace).

## 4. App checks (Phase 2+)
- `npx tsc --noEmit -p apps/mobile` clean.
- Unit/snapshot tests with `jest-expo` where useful: Today renders exactly one `NextUpCard`; banned-words test over `packages/engine/src/pings/copy-bank.ts` and `apps/mobile/src/copy/**`; tap-target test for gym components (`onLayout` ≥ 56/72); habit-only screens show no food/body numbers.
- The 10 design acceptance checks (`docs/code_review.md` §3) — scripted where possible.
- A dev menu (dev builds only) with a **fake clock** to walk a full gym day in minutes, a "fire ping now" list, and a "simulate geofence enter/exit" button.

## 5. Manual device QA (Phase 6+; one iPhone on iOS 17+, one mid-range Android, ideally a Xiaomi/OnePlus)
1. Location "Always" granted, app killed, walk/drive into the 150 m gym zone → silent "Ready?" notification within ~5 min.
2. Leave the zone mid-session → after 5 min: partial + post-gym ping.
3. Location denied → Start on the pre-gym ping opens gym mode.
4. Start → Live Activity appears; "Done set" on the lock screen with the app killed advances set + rest timer; reopening the app reconciles the sets.
5. Android: ongoing notification with countdown; "Done set" works headless; with battery saver on, note what breaks and whether the guidance screen fixes it.
6. Pre-gym ping breaks through a Focus mode (time-sensitive on).
7. Airplane mode: Today, gym mode, kitchen mode, one-tap and "pick from list" logging work; events sync after reconnect.
8. Change time zone → pings reschedule correctly.
9. Gym mode auto-ends after 3 h.
10. Full real gym day (founder): night-before → pre-gym → gym → post-gym → dinner, all pings on time.
