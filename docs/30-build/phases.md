# FitG build phases

Eight phases in dependency order, about 6–8 weeks of AI-assisted building, then a 20–30 person beta. **One phase at a time.** Each phase ends with every command under "Verify" passing and a report to the founder (format in `AGENTS.md`). Paste-able prompts for each phase: `PHASE-PROMPTS.md`.

**Inserted on 28 Oct 2026: Phase 2b**, the dark redesign and a visible agent, runs between Phase 2 and Phase 3. Spec and prompt: `phase-2b-redesign-and-agent.md`.

**Where Codex runs:** Phase 1 can run anywhere (cloud Codex is fine — no network, simulators or other folders needed). **From Phase 2 on, run Codex locally on Abdul's Mac (Codex CLI in the repo folder)**: the app needs Xcode, the iOS Simulator and an Android emulator, and later real phones.

| # | Phase | Runs where | Rough time |
|---|---|---|---|
| 1 | Monorepo, engines, contracts, mock AI, seed pipeline | CLI only | 4–6 days |
| 2 | App shell, design system, onboarding, plan reveal, Today/Week (on-device planner) | dev build, no backend | 6–8 days |
| 3 | Supabase schema, RLS, auth, Edge Functions (mock AI), sync | local Supabase + dev build | 4–6 days |
| 4 | Pings, gym mode (in-app), kitchen mode, logging, rebalance, swaps | dev build | 6–8 days |
| 5 | Real AI, coach chat, photo logging, check-in, grocery, cron | + Anthropic key | 5–7 days |
| 6 | Native: Live Activity, Android ongoing notification, geofence, exact/time-sensitive pings | physical devices | 5–7 days |
| 7 | Progress/journey, share card, paywall + RevenueCat, Sentry, settings, motion polish | dev build | 5–7 days |
| 8 | Beta hardening, privacy, release builds | TestFlight / Play internal | 3–5 days |

---

## Phase 1 — Monorepo, engines, contracts, mock AI, seed pipeline
**Goal:** the brain of FitG exists and is proven by tests, with no UI and no backend.
**Create:** root workspace (`package.json`, `tsconfig.base.json`, Vitest, ESLint/Prettier, `tsx` for scripts), `packages/engine` (the types in `types.md`, everything in `engines.md`, the pure parts of `signals-and-pings.md` §1–3, `applyCommand`), `packages/contracts` (Zod: DB rows from `schema.sql`, `PlanCommand`/`CoachCommand`, API bodies, AI output schemas from `ai-orchestration.md` §4, seed schemas), `packages/ai` (`AiProvider`, `MockProvider`, validators, prompt constants, prices, context builder; Anthropic provider as a stub), `data/scripts` + `data/seed` (the build pack's `seed/*.json`, names unchanged) + `data/sample/foods.sample.json` (from `seed/sample/`), `fixtures/ai/**` (from `seed/fixtures/ai/`).
**Accept:** all golden tests in `testing.md` §1 pass (T1–T11, T8, W1–W6, M1–M4, P1–P5, S1, commands, validators); the Phase-1 AI contract tests in §2 pass; `npm run data:build -- --sample` succeeds (output to `data/out/sample/`) and fails loudly on unknown keys, and `--prod` refuses synthetic/draft/null data; the end-to-end T1 week (targets → template → sessions → meals → pings) gives 1,850 kcal / 120 g, `full_ab_machine` Mon A · Wed B · Fri A, **every day `ok`**, and 4 sounding pings per gym day.
**Verify:** `npm test` · `npm run typecheck` · `npm run data:build -- --sample`.
**Founder:** start collecting real recipes in the seed format; download the USDA CSVs (FoundationFoods + SR Legacy) into `data/raw/usda/`.

## Phase 2 — App shell, design system, onboarding, reveal, Today/Week
**Goal:** a fresh install walks through onboarding, sees the plan reveal, and lands on a working Today screen — fully offline, no backend.
**Create:** `apps/mobile` (Expo SDK 58 project that runs in Expo Go until Phase 6 — updated 2026-10-28, expo-router, Reanimated 4, Skia, Outfit + DM Sans fonts, expo-sqlite, PostHog, Sentry), `constants/{theme,motion,brand}.ts`, `lib/haptics.ts`, core components (Screen, Card, PrimaryButton, NextUpCard, PulseDot, CoachBubble, RollingNumber, AnimatedNumber, Keypad, PermissionExplainer, ProteinBar, JourneyBar stub), onboarding O0–O13 (`screens.md`), plan reveal (motion #1), Today (one NextUpCard + timeline), Week view, Workout detail (read-only), Settings basics, SQLite migrations + repositories, `EXPO_PUBLIC_BACKEND=local` mode using the engine on device. Paywall is skipped behind a flag until Phase 7.
**Accept:** fresh install → onboarding → reveal → Today works in airplane mode; T1 answers produce 1,850 kcal / 120 g on the reveal; Today shows exactly one NextUpCard at every hour of a simulated day; habit-only mode hides food/body numbers; design acceptance checks #1, #3, #4, #7, #10 pass; no hex outside `theme.ts`; 60 fps reveal on a mid-range Android. Components ported from `reference/sumi/` are re-tokened.
**Verify:** `npx tsc --noEmit -p apps/mobile` · `npm test` · `npx expo run:ios` and `npx expo run:android` (simulator/emulator).
**Founder:** Expo account; PostHog + Sentry projects (free tiers); try onboarding on your phone.

## Phase 3 — Supabase schema, RLS, auth, Edge Functions (mock AI), sync
**Goal:** the same app works against a real backend, securely, with sync.
**Create:** `supabase/` (config, `migrations/0001_schema.sql` = `schema.sql`, seed SQL from `data:build`), `_shared/*`, functions `onboard-complete`, `profile-update`, `plan-week` (deterministic), `plan-command`, `sync-push`, `sync-pull`, `devices-register`, `food-search`, `export-data`, `delete-account`; app `src/sync`, Supabase auth (email + Google, session in SecureStore), `EXPO_PUBLIC_BACKEND=supabase`.
**Accept:** RLS test; sync idempotency; stale-command rejection after a replan (`basePlanVersion`); the app behaves identically in `local` and `supabase` modes; `deno test` green. Until Phase 7 every user is treated as "trial" (no entitlement gate yet).
**Verify:** `supabase start && supabase db reset` · `deno test supabase/functions` · `npm test` · manual sign-up on a simulator.
**Founder:** Supabase project (free) — pick the region; `supabase link`, `db push`, `functions deploy`, set secrets.

## Phase 4 — Pings, gym mode, kitchen mode, logging, rebalance, swaps
**Goal:** a full day runs: pings fire on time, the gym session runs in-app, meals are confirmed with one tap, and the day rebalances itself.
**Create:** `src/notifications` (channels, categories with actions, `diffSchedule` runner, response handler, reschedule triggers), gym mode G1 + summary G3 (SetRow, WeightRepStepper, RestTimer, SwapSheet, calibration prompt, PR detection), kitchen mode M1 (RecipeStep, timers, keep-awake), Home Food picker M2 (PortionPicker), off-plan log M3 (**Pick** tab on-device + **Type** path via mock `offplan_parse`, queued when offline), meal swap via `swap-options` (mock), `rebalance-day`, eat-out flow (`menu-pick`, mock), dev menu with fake clock / fire ping / simulate geofence.
**Accept:** P1–P5 behave on device with the fake clock; every ping action writes events and reschedules; after a skipped meal, a half portion, a Home Food pick or an off-plan meal **picked from the on-device list**, rebalance updates Today offline in < 1 s (typed/photo logs queue until online); Today always shows exactly one next step; design checks #2, #5, #6 pass.
**Verify:** `npm test` · `deno test supabase/functions` · dev build on iOS + Android with the fake clock.
**Founder:** run one real gym day with real pings and note what felt wrong.

## Phase 5 — Real AI, coach chat, photo logging, check-in, grocery, cron
**Goal:** the AI layer goes live behind the same interfaces, with costs measured.
**Create:** `AnthropicProvider` (`ai-orchestration.md` §0–§1), prompts (§3), `plan_week` sync + batch flow (§4.1), `coach-chat` / `coach-confirm` with the append-only harness (§5), photo path for `log-offplan` (expo-image-picker/camera → private bucket), `menu-pick` with vision, `checkin-submit` + weekly check-in screen W1, grocery list K1 + `grocery-generate`, migration `0002_cron.sql` + all cron functions (including `cron-cleanup`), `ai_calls` cost accounting, `data/scripts/bench-vision.ts` (50 weighed meals).
**Accept:** CI unchanged on mock; with a key, `plan_week` (sync and batch) returns a validated plan; a bad fixture is rejected; the coach append-only test passes and a live smoke test with `prefix_mismatch_behavior: 'error'` succeeds over 6 turns; refusals fall back cleanly; cost per call logged; banned words/foreign numbers never reach the UI.
**Verify:** `npm test` · `deno test supabase/functions` · `supabase functions serve` + scripted curl runs · `node data/scripts/bench-vision.ts`.
**Founder:** Anthropic API credit (~$20 covers the beta); run the vision benchmark with 50 weighed meals (include Indian dishes) and pick `MODEL_VISION`.

## Phase 6 — Native: Live Activity, Android ongoing notification, geofence, time-sensitive
**Goal:** the lock screen becomes the gym screen; the gym pin starts the "Ready?" flow.
**Create:** `modules/live-activity` (Swift Expo module), `targets/workout-activity` (WidgetKit + App Intents, App Group), notifee integration, `src/location` (geofence task), entitlements and plugins in `app.config.ts` (Time Sensitive, App Group, background location, exact alarms), `eas.json` profiles (development / preview / production).
**Accept:** device QA checklist `testing.md` §5 items 1–9 pass on one iPhone (iOS 17+) and one Android; everything still works with location denied.
**Verify:** `eas build --profile development --platform ios|android` · install on devices · run the checklist.
**Founder:** Apple Developer account ($99/yr) + Google Play Console ($25); physical devices; approve the Time Sensitive and App Group capabilities.

## Phase 7 — Progress, paywall, Sentry, settings, polish
**Goal:** the app is sellable and feels alive.
**Create:** Progress tab P1 (JourneyBar, StreakWeeks with monthly life pass, wins, strength sparklines), ComebackCard, ShareCard + share flow, paywall O14 + RevenueCat + `revenuecat-webhook` + trial reminder, Settings (pings, permissions, units, appearance, subscription with Cancel, privacy export/delete), Sentry wiring, all 9 signature animations (`motion.md`), accessibility pass.
**Accept:** sandbox purchase → entitlement → trial reminder scheduled; webhook mirrors status; delete-account removes every row (test); all 10 design acceptance checks pass; reduced-motion fallbacks verified.
**Verify:** `npm test` · dev build · RevenueCat sandbox purchase on both platforms.
**Founder:** App Store Connect + Play products and the 7-day trial; RevenueCat project; privacy policy + terms pages on `fitg.app`; sandbox testers.

## Phase 8 — Beta hardening and release
**Goal:** a stable beta in testers' hands, measured.
**Create:** verify `cron-cleanup` runs in production, final consent copy review, OEM battery-guidance screen (Android), security checklist (`security-privacy.md` §6), PostHog dashboards, `docs/runbook.md` (deploy, rollback, rotating keys, reading costs), optional Maestro smoke flow.
**Accept:** founder's 14-day self-test runs crash-free; PRD §11 metrics visible in PostHog; AI cost per active user visible; TestFlight + Play internal builds uploaded.
**Verify:** `eas build --profile production` · `eas submit` (TestFlight / internal track) · Sentry clean for 3 days.
**Founder:** recruit 20–30 beta users (gym friends + waitlist); send invites; read Sentry and PostHog daily; collect the "very disappointed" survey at day 14.
