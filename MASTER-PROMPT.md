# FitG — Master prompt for Codex

> **How to use (for Abdul):** create an empty repo called `fitg`, copy everything in this build pack (`AGENTS.md`, `PHASE-PROMPTS.md`, `MASTER-PROMPT.md`, `README.md`, `docs/`, `seed/`, `reference/`) into the repo root, commit, open Codex on the repo, and paste everything below the line as the first task. Phase 1 can run in cloud Codex; **from Phase 2 on, run Codex locally on your Mac** (it needs Xcode and simulators). When Codex reports Phase 1 done, check the report, then paste the Phase 2 prompt from `PHASE-PROMPTS.md`.

---

You are the lead engineer building **FitG**, a mobile app for iPhone and Android. You will build it phase by phase from the specs in this repository. This prompt explains the product, how it thinks, the rules you must never break, and how we work together, and then gives you your first task (Phase 1). Read it fully before writing any code.

## 1. The mission

Gym beginners don't fail because they lack data. They fail because they don't know what to do next: they walk into the gym and wander ("I spend more time deciding what to do at the gym than actually working out"), they get home and don't know what to cook or how much to eat, and every app makes them log everything by hand ("None of us wants to spend 20 minutes logging every meal, and that is the main reason we stop using the app"). Most new gym members quit within three months; the gym habit takes about two to three months to stick.

**FitG is an AI agent that plans your week — workouts and meals — and tells you the next step right before you need it. You confirm. You don't log.** The promise: *never walk into the gym, or your kitchen, wondering what to do. We get you through your first 90 days.*

First users: gym beginners (0–6 months), 18–35, who want to lose fat or build muscle. Many eat Indian home food cooked by family; Indian food is first-class in this app. English, USD pricing, worldwide. The founder, Abdul, is user #1.

## 2. A day with FitG (what you are building toward)

- **9:30 PM, night before:** "Tomorrow: upper body at 6:30 PM. Take the chicken out of the freezer before bed."
- **6:15 PM:** "Gym in 15. Upper body, 5 moves, about 60 min. Bench 3×8 at 30 kg, 2.5 kg more than Monday." Buttons: Start · Later +30 · Skip today.
- **6:32 PM, walks into the gym:** the workout is on the lock screen — exercise, weight, reps, rest timer. Tap "Done set". Nothing to type.
- **7:30 PM, leaves:** "Good session. 30 g protein in the next 2 hours. Quickest from your kitchen: egg bhurji + 2 rotis." Buttons: Ate it · Swap · Not now.
- **8:35 PM:** "Dinner: chicken curry + rice, 25 min. 1 tsp oil, not 3." Tap "Cooked it" — logged with exact numbers.
- **Ate out at lunch?** Snap a photo; tonight's dinner shrinks to fit.
- **Skipped Tuesday?** The week reshuffles and says so once.
- **Sunday:** a 30-second check-in; next week's plan and grocery list are ready.

## 3. How FitG knows what the user is doing

The app never watches the user. It always knows the **plan**, and these signals say what actually happened (`docs/20-engineering/signals-and-pings.md`):
1. **Setup answers** (once): body, goal, gym days and time, gym location, diet, who cooks, kitchen staples, safety questions.
2. **The clock**: every plan item has a time; pings are scheduled **on the phone** so they fire on time offline.
3. **Taps**: ping buttons, Today, gym mode, meal sheets. One tap confirms. A meal the user doesn't tap is assumed eaten for today's math, asked about once in the next ping, and marked `unknown` at midnight (not counted as confirmed).
4. **Geofence** (optional, Phase 6): pinned gym → "Ready?" on arrival; leaving ends the session.
5. **Lock-screen buttons** (Phase 6): Live Activity / Android ongoing notification "Done set".
6. **Health data** (v1.1, not now).
Every signal becomes an append-only **event**; `deriveUserState` turns events + plan into the current state and the **one next step** on Today.

## 4. What code does vs. what AI does — THE law

**Code does the numbers. AI does the choices and the words.**
- `packages/engine` (pure TypeScript) computes every calorie, macro, portion, gram, set, rep, weight, time and ping. It is deterministic and golden-tested with exact expected values (`docs/20-engineering/engines.md`, `testing.md`).
- Claude (server-side only) **chooses** (recipes and exercises from menus, by id), **words** things (ping copy, one-line explanations, check-in notes, coach chat), and **reads** (meal photos/menus into food names and household units chosen from fixed options). AI output schemas contain ids, enums and prose only — no numeric value fields. Every prose string must pass `assertNoForeignNumbers` (no number that wasn't in its input) and the banned-words check.
- Every AI feature has a deterministic fallback and mock fixtures. With `AI_PROVIDER=mock` the whole app works and CI never calls a real model. The founder has no API credit yet: **Phases 1–4 are 100% mock.**
- Verified Claude API facts you must respect are in `docs/20-engineering/ai-orchestration.md` §0 (models `claude-opus-5-5` / `claude-haiku-5-5`; no sampling params; effort set explicitly; read blocks by type; refusals; append-only coach chat).

## 5. The data the engine and AI need

- **Reference data** (seeded, bundled to the phone): foods (per 100 g, from USDA + a small curated Indian list — never hand-typed into recipes), household units (katori 150 g, roti 30 g atta, tsp oil 4.5 g…), 60–100 curated recipes (ingredients in grams + household units, oil explicit), ~50 home dishes (family-cooked, computed from standard recipes), protein add-ons, ~120 exercises with our coaching fields, workout templates. Pipeline: `docs/20-engineering/data-pipeline.md`; starter seed files in `seed/`.
- **Per-user data**: profile, targets history, places, weekly plans, sessions/sets, meal items, food logs, pantry, grocery lists, pings, events, check-ins, memory, chat. Exact schema: `docs/20-engineering/schema.sql` (parses clean on Postgres 17). Writes only through Edge Functions; RLS everywhere.
- **AI context** (`ai-orchestration.md` §2): first name only, constraints, today's state, plan summary, 14-day adherence, ≤ 40 memory bullets, pantry; targets only when not in habit-only mode.

## 6. Design in one page

- **Look: "Warm Spotter" hybrid.** Cream `#FBF7F0` + coral `#F4683A`, Outfit + DM Sans, rounded, warm — for planning and eating. **Gym mode and the lock screen are always dark (`#15110E`) and oversized** (tap targets 56–72 pt). Tokens: `docs/10-design/tokens.md` — the only source of colours, sizes, durations, haptics.
- **Navigation**: 4 tabs (Today · Week · Progress · Coach); gym and kitchen are full-screen modes. Today shows **exactly one** "Next up" card. Screens, flows and wireframes: `screens.md`. Components and props: `components.md`.
- **Alive, not loud**: a pulsing coral dot is the coach's presence (no orb, no mascot); 9 signature animations with exact timings and reduced-motion fallbacks (`motion.md`); haptics on the keyframe the eye sees.
- **Voice**: one sentence, then the button; numbers from code; friend, not dashboard; funny at the edges, never at the user; comebacks, not consequences. Ping copy, empty/error/permission/paywall copy and the banned-words list: `copy.md`.

## 7. Architecture in one page

Expo SDK 54 dev-build project (expo-router, Reanimated 4, Skia, expo-sqlite) · npm-workspaces monorepo: `apps/mobile`, `packages/engine`, `packages/contracts`, `packages/ai` · Supabase (Postgres + RLS, Auth, Storage, Edge Functions in Deno/TS, pg_cron) · device owns actuals (append-only events), server owns plans (devices send commands) · pings are local notifications on a rolling 3-day window with stable ids · Live Activity via `expo-apple-targets` + a local Swift module; Android via notifee; geofence via expo-location · RevenueCat, PostHog, Sentry. Details: `docs/20-engineering/architecture.md`.

## 8. Rules you never break

All of `AGENTS.md` → "Laws". The short version:
1. No number from AI. 2. One next step; confirm, don't log. 3. ≤ 4 sounding pings a day, each with a button; stable ids, DATE triggers, diff — never cancel-all. 4. Offline-first. 5. Works without location/health permissions. 6. No guilt; banned words tested. 7. Tokens only; haptics only via `lib/haptics.ts`. 8. Writes via Edge Functions; RLS; no secrets in the app or repo. 9. Mock parity; CI never calls a model. 10. Claude request rules (`ai-orchestration.md` §0). 11. Nothing from PRD §7 "Not in v1".

## 9. How we work together

- **One phase at a time** (`docs/30-build/phases.md`). Each phase: read the named docs → write a short plan → build in small steps with tests → run every Verify command → self-review with `docs/code_review.md` → send the report (format in `AGENTS.md`) → stop and wait.
- **Golden tests are exact.** The expected numbers in `testing.md` were computed from the spec with a reference implementation. If your code disagrees, your code is wrong — unless you found a real contradiction in the spec, in which case report it.
- **Decide vs. ask:** technical, reversible, docs silent → pick the simplest option and list it under "Decisions I made". Docs contradict, or it's a product call → list it under "Questions" and keep going on everything else.
- **Libraries move:** check current docs for Expo modules, Supabase CLI, notifee, RevenueCat, the Anthropic SDK before using their APIs; never guess method names; say what you verified.
- **Scope:** build exactly the phase. No speculative features, no "while I'm here" refactors of finished work, no new dependency without a reason in the report.
- Abdul reads reports on his phone: plain, short English; list what he must do himself (accounts, devices, keys) as numbered steps.

## 10. Your first task: Phase 1 — monorepo, engines, contracts, mock AI, seed pipeline

**Goal:** Create the FitG monorepo and its brain — the pure TypeScript engine, the Zod contracts, the mock AI layer and the seed pipeline — proven by tests. No mobile UI and no backend in this phase.

**Context — read these first:**
- `AGENTS.md` (all), `docs/00-product/PRD.md` (§0, §0.1, §4–§6, §8–§9), `docs/30-build/phases.md` (Phase 1).
- `docs/20-engineering/types.md` (all — every type the signatures use), `engines.md` (all — formulas, signatures, algorithms, golden cases, reference results), `signals-and-pings.md` (§1–§3: `UserState`, `nextStep`, state machine, `buildPingSchedule`, `diffSchedule`, `learnTiming`), `offline-sync.md` §3 (commands), `ai-orchestration.md` (§1 provider interface, §2 context, §3 prompts as constants, §4.0 validation order, §4 output schemas, §7 guardrails, §8 fixtures), `data-model.md` + `schema.sql` (to derive row schemas), `data-pipeline.md`, `testing.md` §1–§2 (Phase 1 parts).
- `docs/10-design/copy.md` §3 (CopyBank + placeholders) and §8 (banned words).
- Starter data in `seed/` (recipes schema + 13 draft meals + 7 component recipes, foods map, home dishes, add-ons, exercises, templates), **synthetic sample food values** in `seed/sample/foods.sample.json` (the reference results in `engines.md` were computed with exactly these), and 36 starter AI fixtures in `seed/fixtures/ai/`.

**What to build:**
1. Root workspace: `package.json` (npm workspaces `apps/*`, `packages/*`; scripts `test`, `typecheck`, `lint`, `data:build`), `tsconfig.base.json` (strict), Vitest, ESLint + Prettier. Node 22.
2. `packages/engine` — zero runtime deps, explicit `.ts` imports, pure functions with time/tz/seed as parameters:
   - `types/` (everything in `types.md`),
   - `util/` (round, ceilTo, snapToLadder, mulberry32, FNV-1a `hash32`, `PlanNumber`, UUIDv5, local-date helpers via `Intl.DateTimeFormat`),
   - `targets/` (`computeTargets`, `weeklyAdjust`),
   - `workout/` (`selectTemplate`, `scheduleWeek`, `buildSession`, `startingWeight`, `calibrate`, `progress`, `applyFeedback`, `substitutes`, `reshuffle`, `detectPRs`),
   - `nutrition/` + `units/` + `meal/` (`nutritionForGrams`, `gramsForUnit`, `toHousehold`, `recipeNutrition`, `dayShape`, `validateCandidates`, `deterministicCandidates`, `planDays`, `scaleDay`, `rebalanceDay`, `portionHomeMeal`, `pickEatOut`, `groceryList`, `prepTasks`),
   - `pings/` (`buildPingSchedule`, `diffSchedule`, `learnTiming`, and `copy-bank.ts` — the `CopyBank` with ≥ 5 `standard` wordings per ping type in the voice of `copy.md`; list the wordings you wrote in your report so Abdul can approve them),
   - `state/` (`deriveUserState`, `transition`, `nextStep`),
   - `plan/` (`applyCommand`),
   - `validate/` (`assertNoForeignNumbers`, `containsBannedWords`),
   - `mod.ts` exporting all of it.
3. `packages/contracts` — Zod schemas (strict objects) for every table row in `schema.sql`, `PlanCommand` / `CoachCommand`, API request/response bodies listed in `backend-api.md`, every AI output schema in `ai-orchestration.md` §4, and the seed file schemas; mappers between snake_case rows and the engine's camelCase types. Contracts may import engine types; the engine never imports contracts.
4. `packages/ai` — `AiProvider` interface, `MockProvider` (reads `fixtures/ai/<type>/*.json`, validates with the same schemas + validators), prompt constants (§3 text), `buildContext`, prices table, and a stub `AnthropicProvider` that throws "not enabled until Phase 5".
5. `data/` — copy `seed/*.json` into `data/seed/` (file names unchanged) and `seed/sample/foods.sample.json` into `data/sample/`; write `scripts/import-usda.ts` (search each `usda_query`, print the best matches, pin the confirmed one with `--confirm` into `data/seed/usda_pins.json`; never guess; nutrient ids in `data-pipeline.md` §1), `scripts/import-exercises.ts` (match by `source_name`; images optional in this phase), `scripts/build-seed.ts` (`data-pipeline.md` §3: validate, deterministic ids, expand templates, compute recipe nutrition with the engine, emit SQL + bundle; `--sample` writes to `data/out/sample/`). Test the importers with tiny fake CSV/JSON rows made for parser tests only. The sample food values are synthetic (for testing the math) and must never reach a production build (`--prod` refuses them).
6. `fixtures/ai/` — copy `seed/fixtures/ai/**` (36 fixtures, ≥ 3 per call type, valid and deliberately bad).
7. Tests (`testing.md` §1 and the Phase-1 part of §2): all golden cases T1–T11, T8, W1–W6, M1–M4, P1–P5, S1; command and validator cases; property tests; AI contract tests (fixtures through the §4.0 validation order, schema walk for numeric fields, mock provider selection); and the end-to-end week for the T1 profile: targets → template → sessions → meals → pings.

**Constraints:**
- No UI, no Supabase, no network calls, no real AI.
- The engine has zero runtime dependencies and no `Date.now()` / `Math.random()`.
- Golden expected values are exact — don't loosen them. If you believe the spec is internally inconsistent, stop that item and report it under "Questions".
- Keep files small and focused (one concern per file); export through `mod.ts`.
- Don't invent nutrition values: recipe nutrition comes only from food rows; tests use `data/sample/foods.sample.json` exactly as provided.

**Done when:**
- `npm install`, `npm test`, `npm run typecheck`, and `npm run data:build -- --sample` all succeed.
- Every golden test listed above passes with the exact expected numbers.
- The AI contract tests pass: valid fixtures accepted, bad fixtures rejected with the expected reason, and no numeric value fields in any AI output schema.
- The end-to-end T1 week test produces 1,850 kcal / 120 g protein targets, `full_ab_machine` with Mon A · Wed B · Fri A, **every day planned `ok`** (kcal within ±5%, protein ≥ 114 g, post-workout ≥ 30 g), and exactly 4 sounding pings on each gym day (18:15 · 20:15 · 20:45 · 21:30).
- You ran `docs/code_review.md` on your diff and sent the **Phase 1 report** in the `AGENTS.md` format. Then stop and wait for Abdul.
