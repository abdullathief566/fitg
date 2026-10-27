# FitG — phase prompts for Codex

How to use: start with `MASTER-PROMPT.md` (it contains Phase 1). After Codex reports Phase 1 done and you've checked it, paste the Phase 2 prompt below, and so on. One phase per Codex task. Each prompt follows OpenAI's recommended shape: **Goal · Context · Constraints · Done when**.

---

## Phase 2 — App shell, design system, onboarding, reveal, Today/Week

**Goal:** Build the FitG mobile app shell so a fresh install walks through onboarding, sees the plan reveal, and lands on a working Today screen — fully offline, with no backend.

**Context:** Run this phase with Codex **locally on the Mac** (Xcode + Android emulator needed). Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 2), `docs/00-product/PRD.md` §3 §5 §6.1, `docs/10-design/tokens.md`, `screens.md` (incl. §5 habit-only mode), `components.md`, `motion.md` (§0, §1 #1 and #7, §2, §3), `copy.md`, `accessibility.md`, `docs/20-engineering/architecture.md`, `types.md`, `data-model.md` §4, `offline-sync.md` §2 and §7, `signals-and-pings.md` §1 (`nextStep`). Phase 1 packages (`engine`, `contracts`, `ai`) are done and tested — use them, don't re-implement them. Reference implementations from the founder's previous app are in `reference/sumi/` (`RollingNumber`, `AnimatedNumber`, `Keypad`, `PrimaryButton`, `Card`, `Screen`, `ScreenEdgeGlow`, `haptics.ts`, `sentry.ts`) — port the patterns and re-token them; don't copy Sumi's colours or its orb (see `reference/sumi/README.md`).

**Constraints:**
- Expo SDK 58 project that runs in **Expo Go** until Phase 6 (updated 2026-10-28: the App Store's Expo Go opens only SDK 58, and there is no Xcode yet); fonts Outfit + DM Sans load with `useFonts`, and the expo-font config plugin embeds them in dev builds.
- `constants/theme.ts` and `constants/brand.ts` exactly as in `tokens.md`; `constants/motion.ts` = the tokens in `tokens.md` §4 **plus** the named signature timings from `motion.md` §1 (`motion.signature.*`); no hex anywhere else; `lib/haptics.ts` is the only expo-haptics importer.
- `EXPO_PUBLIC_BACKEND=local`: onboarding answers → engine on device → week plan → SQLite. No network needed.
- Exactly one NextUpCard on Today. Gym mode and the lock screen are not part of this phase (Workout detail is read-only).
- Paywall behind a flag (off) until Phase 7.
- Reanimated worklets only; cancel loops on blur/background; reduced-motion fallbacks.

**Done when:**
- A fresh install completes onboarding O0–O13 and reaches Today in airplane mode.
- Entering the T1 profile (male, 28, 175 cm, 75 kg, desk job, lose fat, 3 gym days) shows **1,850 kcal and 120 g protein** on the reveal.
- Today shows exactly one next step at every hour of a simulated gym day and rest day; habit-only mode shows no food/body numbers.
- Design acceptance checks #1, #3, #4, #7, #10 (`docs/code_review.md` §3) pass.
- `npm test`, `npm run typecheck`, `npx tsc --noEmit -p apps/mobile` are green; the app builds and runs on an iOS simulator and an Android emulator.
- You self-reviewed with `docs/code_review.md` and sent the Phase 2 report.

---

## Phase 3 — Supabase schema, RLS, auth, Edge Functions (mock AI), sync

**Goal:** Put a secure Supabase backend behind the app, with sign-in and two-way sync, while every AI path stays on mock.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 3), `docs/20-engineering/schema.sql`, `data-model.md`, `types.md` (§9 commands), `backend-api.md` §1–§2, `offline-sync.md`, `rag.md` (`resolveFood` for `food-search`), `security-privacy.md` §1, `testing.md` §3 (Phase 3 tests), `data-pipeline.md` §3 (seed SQL, deterministic ids). The app works in `EXPO_PUBLIC_BACKEND=local` today; it must keep working there.

**Constraints:**
- `supabase/migrations/0001_schema.sql` is `docs/20-engineering/schema.sql` verbatim (if you must change it, change the doc too and say why in the report).
- Writes only through Edge Functions (service role, scoped by the verified JWT user). Authenticated users only `SELECT` their own rows.
- Commands are idempotent by client id and carry `basePlanVersion`; stale ones are rejected; server replans never overwrite rows with actuals.
- No entitlement gate yet: every user counts as "trial" until Phase 7.
- Shared packages are imported via `supabase/functions/deno.json`; if the CLI can't bundle files outside `supabase/functions/`, add the `build:shared` copy step described in `architecture.md` §1.
- `AI_PROVIDER=mock` everywhere. Auth: email + Google; session in SecureStore; no hard-coded keys.

**Done when:**
- `supabase start && supabase db reset` succeeds and loads the seed.
- RLS test (user A can't read user B, REST writes denied), sync idempotency, and command-rejection-after-replan tests pass in `deno test supabase/functions`.
- With `EXPO_PUBLIC_BACKEND=supabase`, sign-up → onboarding → Today behaves exactly like local mode, and events/commands sync both ways.
- `npm test` and `npm run typecheck` green; self-review done; Phase 3 report sent (include the exact steps Abdul must run to link and deploy his Supabase project).

---

## Phase 4 — Pings, gym mode, kitchen mode, logging, rebalance, swaps

**Goal:** Make a full day run itself: pings fire on time with working buttons, the gym session runs in-app, meals are confirmed with one tap, off-plan meals rebalance the day, and swaps work.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 4), `docs/00-product/PRD.md` §6.2–§6.7, `docs/20-engineering/signals-and-pings.md` (§1–§4), `engines.md` §2–§3, `types.md`, `offline-sync.md` §4–§6, `backend-api.md` §2 (`rebalance-day`, `swap-options`, `log-offplan`, `menu-pick`), `rag.md`, `ai-orchestration.md` §4 (mock call shapes), `docs/10-design/screens.md` (G1, G3, M1, M2, M3, S1), `components.md`, `motion.md` #2 #3 #7 #9, `copy.md` §3–§5, `testing.md` §1 (P1–P5, S1) and §4.

**Constraints:**
- Notifications: stable ids, DATE triggers, `diffSchedule`; never cancel-all; ≤ 4 sounding pings/day; every category has actions; Android channels as specified; check the current expo-notifications API (interruption level, Android exact alarms) before coding.
- Every ping action writes an event and reschedules. Unknown meals are asked about inside the next ping, never as an extra ping.
- Gym mode is forced dark, `gymType` sizes, Done-set ≥ 72 pt; first-session calibration after set 1; PRs detected by the engine.
- Off-plan logging in this phase: the **Pick** tab (on-device list of recipes, home dishes and recent foods — works offline) and the **Type** path with the mock `offplan_parse` (queued when offline); numbers come only from the food DB. Photo comes in Phase 5.
- Notification categories have at most 3 buttons; `diffSchedule` only touches `ping:` ids.
- Add a dev-only menu: fake clock, fire any ping now, simulate geofence enter/exit.

**Done when:**
- P1–P5 behave on a device using the fake clock (pings at the exact expected times; P5 merges correctly).
- A full simulated day (night-before → pre-gym → gym → post-gym → dinner) works on iOS and Android dev builds, offline.
- After a skipped meal, a half portion, a Home Food pick or an off-plan meal picked from the on-device list, rebalance updates Today in under 1 s offline; Today always shows exactly one next step.
- Design checks #2, #5, #6 pass; all tests and typecheck green; self-review done; Phase 4 report sent with a list of what Abdul should test at his real gym.

---

## Phase 5 — Real AI, coach chat, photo logging, check-in, grocery, cron

**Goal:** Switch the AI layer to Claude behind the existing interfaces — weekly plans, coach chat, photo logging, check-in narrative — with every guardrail and cost measured.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 5), `docs/20-engineering/ai-orchestration.md` (all of it — §0 lists verified API facts), `rag.md`, `backend-api.md` §2–§3, `docs/10-design/screens.md` (M3, W1, K1, C1), `copy.md`, `docs/20-engineering/types.md` §9 (`CoachCommand`, `applyCommand`), `testing.md` §2 and the Phase 5 items in §3. Check the installed `@anthropic-ai/sdk` for `messages.parse`, `zodOutputFormat`, `beta.messages.create` (`betas`, `fallbacks`, `thinking.block_binding`) and `messages.batches` before writing the provider; if a helper is missing, use the raw `output_config.format` form and validate with Zod.

**Constraints:**
- Models from env: `MODEL_STRONG=claude-opus-5-5`, `MODEL_FAST=claude-haiku-5-5`, `MODEL_VISION` (decided by the benchmark). Never send `temperature`/`top_p`/`top_k`; `tool_choice` only `auto`; set `effort` explicitly; read blocks by `type`; check `stop_reason` first.
- `fallbacks: 'default'` + beta `server-side-fallback-2026-07-01` only on Opus calls outside Batches; never on Haiku.
- Coach chat is append-only: frozen system + tools per thread, verbatim stored content, context via appended system messages, rollover by summary (never a sliding window); `block_binding.prefix_mismatch_behavior: 'drop_block'` in production, `'error'` in tests.
- CI stays on mock. Real-model runs only in the manual smoke script and the vision benchmark.
- Every call logs tokens + cost to `ai_calls`; caps and rate limits enforced.

**Done when:**
- Mock CI unchanged and green; contract tests (valid + bad fixtures, schema walk, request-builder snapshots, coach append-only) pass.
- With a key: `plan_week` (sync and a 2-user batch) returns validated plans that the engine accepts; a live 6-turn coach smoke test with `prefix_mismatch_behavior: 'error'` succeeds, including one confirmed plan change; a refusal path falls back cleanly.
- Photo logging works end to end (camera → private bucket → base64 → parse → resolve → DB numbers → oil question → rebalance).
- Weekly check-in, grocery list and cron jobs work; `bench-vision.ts` runs and prints accuracy and cost per model.
- Self-review done; Phase 5 report sent with measured cost per call type.

---

## Phase 6 — Native: Live Activity, Android ongoing notification, geofence, time-sensitive

**Goal:** Make the lock screen the gym screen, and let a pinned gym trigger the "Ready?" flow.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 6), `docs/20-engineering/signals-and-pings.md` §4–§6, `docs/10-design/screens.md` (lock screen wireframes), `accessibility.md`, `security-privacy.md` §5, `testing.md` §5. Check current docs for `expo-apple-targets`, ActivityKit/App Intents, App Groups on EAS, `@notifee/react-native`, `expo-location` geofencing and `expo-task-manager` before coding.

**Constraints:**
- Live Activity "Done set" must work with the app killed (App Intent writes to the App Group and advances the activity; the app drains `pendingSetEvents`). Rest timer via `Text(timerInterval:)`. Always dark.
- Android: notifee foreground service, chronometer countdown, headless Done set.
- Geofence enter is a hint (shows "Ready?" with Start), never an auto-start; exit is debounced 5 min.
- Everything still works with location denied; background-location disclosure screen before the system prompt.

**Done when:**
- `testing.md` §5 items 1–9 pass on one iPhone (iOS 17+) and one Android device (report which models).
- `eas build --profile development` works for both platforms; all tests and typecheck green; self-review done; Phase 6 report sent.

---

## Phase 7 — Progress, paywall, Sentry, settings, polish

**Goal:** Make FitG sellable and alive: progress and the 90-day journey, sharing, an honest paywall, full settings, and every signature animation.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 7), `docs/00-product/PRD.md` §6.8 §6.10, `docs/10-design/screens.md` (P1, P2, O14, X1), `components.md`, `motion.md` (all), `copy.md` §6–§7, `accessibility.md`, `docs/20-engineering/analytics-paywall.md`, `backend-api.md` §2 (`revenuecat-webhook`, `export-data`, `delete-account`), `security-privacy.md` §3, `testing.md` §3 (Phase 7 items). Check the current `react-native-purchases` docs.

**Constraints:**
- Honest billing: trial end date in words; silent reminder 2 days before the trial ends; visible "Cancel subscription" in Settings; restore purchase.
- StreakWeeks counts weeks with ≥ 2 workouts, one monthly life pass; no red, no shaming.
- All 9 signature animations with reduced-motion fallbacks; 60 fps on a mid-range Android.

**Done when:**
- Sandbox purchase on both platforms → entitlement → trial reminder scheduled; webhook mirrors status into `subscriptions`.
- Export and delete-account work end to end (delete removes every row — tested).
- All 10 design acceptance checks pass; tests and typecheck green; self-review done; Phase 7 report sent.

---

## Phase 8 — Beta hardening and release

**Goal:** Ship a stable beta to 20–30 testers with metrics and costs visible.

**Context:** Read `AGENTS.md`, `docs/30-build/phases.md` (Phase 8), `docs/20-engineering/security-privacy.md` §6, `analytics-paywall.md` §1, `backend-api.md` §3.

**Constraints:**
- No new features. Fix, harden, measure.
- Security checklist must be fully green before any build goes to testers.

**Done when:**
- `cron-cleanup` (built in Phase 5) is verified running in production: old meal photos, expired memory and old `ping_schedule` rows disappear on schedule.
- Consent copy, the Android battery-guidance screen and `docs/runbook.md` exist.
- PostHog dashboards show the PRD §11 metrics; an AI-cost-per-active-user view exists.
- Production builds are on TestFlight and the Play internal track; Sentry is clean for 3 days of internal use.
- Phase 8 report sent with the beta invite steps for Abdul.
