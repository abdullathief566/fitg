# AGENTS.md — FitG

FitG is a mobile app (iOS + Android) with an AI agent that plans a gym beginner's week — workouts and meals — and tells them the next step right before they need it. The user confirms; they don't log. Founder: Abdul (solo, Hyderabad). You (Codex) write the code, phase by phase.

## Source of truth (read before you code)
- `docs/00-product/PRD.md` — what and why. Wins over every other doc.
- `docs/30-build/phases.md` — build order; work on **one phase at a time**.
- `docs/10-design/` — `tokens.md`, `screens.md`, `components.md`, `motion.md`, `copy.md`, `accessibility.md`, `store-assets.md`.
- `docs/20-engineering/` — `architecture.md`, `types.md` (every shared type), `schema.sql` + `data-model.md`, `engines.md`, `signals-and-pings.md`, `ai-orchestration.md`, `rag.md`, `data-pipeline.md`, `offline-sync.md`, `backend-api.md`, `analytics-paywall.md`, `security-privacy.md`, `testing.md`.
- `docs/code_review.md` — run it on your own diff before reporting.
- `seed/` — starter data, synthetic sample food values, mock AI fixtures. `reference/sumi/` — components from the founder's last app to port (not drop in).
Read only the docs the current phase names, plus this file. Phase 1 can run in cloud Codex; from Phase 2 on you run locally on Abdul's Mac (Xcode, simulators).

## Stack
Expo SDK 58 (React Native 0.88, TypeScript strict, expo-router, Reanimated 4), **runs in Expo Go through Phase 5, dev build from Phase 6** (updated 2026-10-28) · expo-sqlite (offline-first) · Supabase (Postgres + RLS, Auth, Storage, Edge Functions in Deno/TS, pg_cron) · Anthropic Claude via `packages/ai` (`AI_PROVIDER=mock|anthropic`) · RevenueCat · PostHog · Sentry · Vitest · npm workspaces, Node 22.

## Layout
```
apps/mobile/            Expo app (app/ routes, src/, constants/, lib/haptics.ts, modules/, targets/)
packages/engine/        pure TS: targets, workouts, meals, pings, state, validators  ← every number comes from here
packages/contracts/     Zod schemas: DB rows, API, AI outputs, PlanCommand, seeds
packages/ai/            provider (mock|anthropic), prompts, context builder, validators
supabase/               migrations, seed, functions/
data/                   seed JSON, import/build scripts (raw downloads gitignored)
fixtures/ai/            mock AI outputs (valid + deliberately bad)
docs/                   the specs
seed/, reference/       build-pack inputs (starter data, Sumi components to port)
```

## Commands
```
npm install
npm test                        # vitest across workspaces
npm run typecheck               # tsc --noEmit everywhere
npm run data:build [-- --sample]
supabase start && supabase db reset          # Phase 3+
deno test supabase/functions                 # Phase 3+
cd apps/mobile && npx expo run:ios | run:android   # dev build, Phase 2+
```

## Laws (never break these)
1. **Code does the numbers; AI does the choices and the words.** No calorie, gram, kg, rep, set, time or price ever comes from model output. AI schemas contain ids, enums and prose; prose passes `assertNoForeignNumbers` and the banned-words check.
2. One next step at a time (exactly one NextUpCard on Today). Confirm, don't log.
3. ≤ 4 sounding pings per local day; every ping has an action button; notifications use stable ids + DATE triggers + `diffSchedule` — never cancel-all, never repeating triggers.
4. Offline-first: Today, gym mode, kitchen mode, logging, pings work in airplane mode.
5. Everything works without location or health permissions.
6. No guilt in copy; follow `docs/10-design/copy.md`; banned words are tested.
7. Colours, sizes, durations only from `constants/theme.ts` / `constants/motion.ts`; `expo-haptics` only via `lib/haptics.ts`.
8. Writes only through Edge Functions; RLS on every table; secrets only in Supabase secrets; never commit `.env*`.
9. Every AI feature has a deterministic fallback and mock fixtures. **CI never calls a real model.**
10. Claude requests: never send `temperature`/`top_p`/`top_k`; `tool_choice` only `auto`; set `effort`; read content blocks by `type`; check `stop_reason` before content; no `fallbacks` on Haiku or Batches; coach chat history is append-only (see `ai-orchestration.md` §5).
11. Don't build anything in PRD §7 "Not in v1".

## How to work
1. Read this file, the phase in `docs/30-build/phases.md`, and the docs it names.
2. Write a short plan (files, order, tests) at the top of your first message for the phase.
3. Build in small steps; write tests with the code (golden tests from `testing.md` are exact — if the code disagrees, fix the code).
4. Run every command under the phase's **Verify**. Don't report a phase done with anything red.
5. Self-review with `docs/code_review.md`; fix what fails.
6. Report (format below) and stop. Don't start the next phase until Abdul says go.

**Decide vs. ask:** when the docs are silent and the choice is technical and reversible, pick the simplest option and list it under "Decisions I made". Ask only when docs contradict each other or a product decision is needed — list it under "Questions", and keep working on everything that isn't blocked.

**Library APIs move.** For expo-notifications, expo-location, expo-apple-targets, notifee, RevenueCat, Supabase CLI and the Anthropic SDK, check the current docs before writing code; don't guess method names. Note what you verified.

## Testing rules
- Engine: pure, deterministic, golden-tested; time, time zone and seeds are parameters.
- AI: contract tests on fixtures (valid and bad) from Phase 1; request-builder snapshot tests and the coach append-only test from Phase 5.
- Backend: RLS test, idempotency tests, rate-limit tests, all with `AI_PROVIDER=mock`.
- App: typecheck clean; snapshot/unit tests for the design acceptance checks where scriptable.

## Report format (end of every phase)
```
## Phase N report
Done: <what now works, in plain words>
Verified: <each command → result>
Needs Abdul: <device tests, accounts, keys, decisions — numbered>
Decisions I made: <choices where docs were silent>
Questions: <only real blockers or contradictions>
Next: <the next phase's goal in one line>
```
Write the report in plain, short English — Abdul reads it on his phone.
