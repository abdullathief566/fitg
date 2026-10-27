# FitG architecture

## 0. Decisions (read first)

| Decision | Choice | Why |
|---|---|---|
| App | **Expo SDK 58** (React Native 0.88, React 19.3, TypeScript strict — the app compiles with TypeScript 6.0, the packages with 5.9), expo-router 58, Reanimated 4.7. **Runs in Expo Go through Phase 5; dev build from Phase 6** (updated 2026-10-28, was SDK 54 / dev build from Phase 2). | The App Store's Expo Go opens only the newest SDK (58), and the founder has no Xcode or Apple Developer account yet, so Expo Go is how he runs the app on his phone. Phases 2–5 use only modules Expo Go ships (fonts load with `useFonts`); `app.json` already carries the config plugins a dev build needs. Live Activity, notifee and geofencing (Phase 6) need the dev build. |
| Backend | **Supabase**: Postgres + RLS, Auth, Storage, **Edge Functions (Deno/TS)**, `pg_cron` + `pg_net`. No FastAPI, no Vercel. | One language end to end; one shared engine package runs on device and server; free cron; service-role key never leaves Supabase. Fallback if Deno can't bundle the shared package: the `build:shared` copy step in §1, or as a last resort a Hono server in the same monorepo. |
| Shared logic | `packages/engine` — **pure TypeScript, zero runtime dependencies**, explicit `.ts` import specifiers, no `Date.now()` inside (time is a parameter). | Same code computes targets/sets/portions/pings offline on the phone and validates AI output on the server. |
| Contracts | `packages/contracts` — Zod schemas for DB rows, API requests/responses, AI outputs, `PlanCommand`. | One source of truth for shapes on both sides. |
| AI | `packages/ai` — provider interface with `AI_PROVIDER=mock|anthropic`. Claude `claude-opus-5-5` (strong), `claude-haiku-5-5` (fast), vision = benchmark Haiku 5.5 vs Sonnet 5.5. Server-side only. | Founder has no API credit yet: Phases 1–4 run fully on mock + the deterministic planner. Detail: `ai-orchestration.md`. |
| Device storage | **expo-sqlite** (relational, offline-first) + `expo-secure-store` (Supabase session). | Today screen and gym mode read only local data. |
| Sync | Device owns **actuals** (append-only `events`); server owns **plans**. Device edits are **commands**, not row writes. | Removes nearly all conflict resolution. Detail: `offline-sync.md`. |
| Pings | Local notifications scheduled on the phone (rolling 3 days); server never "sends" a ping, it only changes the plan. | Pings fire on time offline. Detail: `signals-and-pings.md`. |
| Lock screen | iOS WidgetKit Live Activity via `expo-apple-targets` + local Expo module; Android ongoing notification via `@notifee/react-native`. | Phase 6. |
| Geofence | `expo-location` geofencing + `expo-task-manager`, 150 m, optional. | Phase 6. |
| Payments / analytics / crashes | RevenueCat (`react-native-purchases`) · PostHog (`posthog-react-native`) · Sentry (`@sentry/react-native`). | |

**Verify-at-build-time list** (APIs that move; check the current docs before coding, never guess): expo-notifications (interruption level prop, Android exact alarms), expo-location geofencing on SDK 58, `expo-apple-targets`, `@notifee/react-native`, `expo-background-task`, Supabase CLI bundling of files outside `supabase/functions/`, `react-native-purchases`, the Anthropic TypeScript SDK (`@anthropic-ai/sdk`) helpers named in `ai-orchestration.md`.

## 1. Repo layout

```
fitg/                                    # npm workspaces monorepo, Node 22, TypeScript 5.9 strict
  AGENTS.md                              # standing rules for Codex (from the build pack)
  package.json                           # workspaces ["apps/*","packages/*"]; scripts: test, typecheck, lint, data:build
  docs/                                  # this build pack's docs/ — the source of truth
  apps/mobile/                           # Expo SDK 58
    app/                                 # expo-router routes (list in docs/10-design/screens.md)
    src/
      db/            # expo-sqlite migrations + repositories
      sync/          # outbox push, delta pull
      notifications/ # categories, channels, scheduler runner, response handler
      gym/           # gym-mode state, Live Activity / notifee bridge
      location/      # geofence task (Phase 6)
      ai-client/     # calls edge functions; mock mode uses packages/ai MockProvider locally
      analytics/     # PostHog wrapper
      copy/          # pings.ts templates, ui strings
      ui/            # components (docs/10-design/components.md)
      hooks/
    constants/       # theme.ts, motion.ts, brand.ts  (the ONLY place hex/sizes/durations live)
    lib/haptics.ts   # the ONLY module that imports expo-haptics
    modules/live-activity/               # local Expo module (Swift) — Phase 6
    targets/workout-activity/            # WidgetKit extension via expo-apple-targets — Phase 6
    app.config.ts  eas.json  .env.example
  packages/
    engine/          # src/{targets,workout,meal,nutrition,units,pings,state,plan,validate}/*.ts + mod.ts; test/ (vitest)
    contracts/       # src/{db,api,ai,commands}.ts (Zod)
    ai/              # src/{provider.ts,mock.ts,anthropic.ts,prompts/*,validators.ts,context.ts}; test/
  supabase/
    config.toml
    migrations/0001_schema.sql …         # 0001 = docs/20-engineering/schema.sql
    seed/*.sql                           # generated by data:build
    functions/
      _shared/{auth.ts,db.ts,ratelimit.ts,ai.ts,cors.ts}
      <function-name>/index.ts           # list in backend-api.md
      deno.json                          # import map → packages
  data/
    raw/                                 # gitignored downloads (USDA CSV, free-exercise-db)
    scripts/{import-usda.ts,import-exercises.ts,build-seed.ts,bench-vision.ts}   # run with tsx
    seed/{foods.map.json,usda_pins.json,recipes.seed.json,recipes.schema.json,home_dishes.seed.json,
          protein_addons.seed.json,exercises.seed.json,workout_templates.seed.json}   # names as in the build pack
    sample/foods.sample.json      # synthetic test values (from the build pack's seed/sample/)
    out/sample/                   # --sample build output (gitignored)
  fixtures/ai/<call_type>/*.json         # mock AI responses (≥3 per call type, incl. bad ones)
```

`supabase/functions/deno.json` import map: `"@fitg/engine": "../../packages/engine/src/mod.ts"` (same for `@fitg/contracts`, `@fitg/ai`). Engine `tsconfig`: `"moduleResolution": "bundler"`, `"allowImportingTsExtensions": true`, `"noEmit": true`, `"strict": true`. If the Supabase CLI won't bundle imports from outside `supabase/functions/` on deploy, add `npm run build:shared` that copies the three packages into `supabase/functions/_shared/pkg/` (committed; CI fails if out of sync).

## 2. Environment variables

| Where | Variable | Notes |
|---|---|---|
| mobile (`.env`, `EXPO_PUBLIC_*` only) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_RC_IOS_KEY`, `EXPO_PUBLIC_RC_ANDROID_KEY`, `EXPO_PUBLIC_AI_PROVIDER=mock\|server`, `EXPO_PUBLIC_BACKEND=local\|supabase` | `AI_PROVIDER=mock` → the app never calls AI edge functions; it uses the on-device deterministic planner + fixtures. `BACKEND=local` → no Supabase at all (Phase 2). Never hard-code fallback keys in source. |
| edge functions (Supabase secrets) | `AI_PROVIDER=mock\|anthropic`, `ANTHROPIC_API_KEY`, `MODEL_STRONG=claude-opus-5-5`, `MODEL_FAST=claude-haiku-5-5`, `MODEL_VISION=claude-haiku-5-5`, `RC_WEBHOOK_SECRET`, `CRON_SECRET`, `EXPO_ACCESS_TOKEN`, `PHOTO_RETENTION_DAYS=7` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Never in the app. |
| CI | `AI_PROVIDER=mock` always | No real AI calls in CI, ever. |

## 3. Local development

```
npm install
npm test                      # vitest: engine + contracts + ai validators (Phase 1+)
npm run typecheck             # tsc --noEmit in every workspace
npm run data:build            # seed JSON → supabase/seed/*.sql + apps/mobile/assets/bundle/*.json
supabase start                # Docker (Phase 3+)
supabase db reset             # migrations + seed
supabase functions serve --env-file supabase/.env.local
cd apps/mobile && npx expo run:ios   # or run:android — dev build (Phase 2+)
deno test supabase/functions  # Phase 3+
```

## 4. How the pieces talk (one gym day)

```
 onboarding answers ──► engine.computeTargets + selectTemplate + planDays (device, offline)
                          │                      │
                          ▼                      ▼
                    SQLite plan rows      engine.buildPingSchedule ──► expo-notifications (local, rolling 3 days)
                          │
  sync-push (events, commands) ───► Supabase (Postgres, RLS) ◄── cron: nightly ping copy, Sunday plan_week (AI → validated by engine)
                          ▲                      │
                    sync-pull (changed plan rows)┘
 ping action / geofence / tap ──► events (append-only) ──► engine.deriveUserState ──► next step on Today + reschedule
```

## 5. Product laws as engineering rules
1. **No number is ever produced by AI.** AI output schemas contain IDs, enums and prose only; prose passes `assertNoForeignNumbers`. Numbers shown in UI are typed `PlanNumber` values from the engine.
2. **Offline first.** Today, gym mode, kitchen mode and pings work in airplane mode.
3. **Permissions optional.** No feature may require location or health access; each has a tap fallback.
4. **4 sounding pings a day max**, enforced in `buildPingSchedule` and tested.
5. **Mock parity.** Every AI-backed feature has a deterministic fallback and a mock fixture; CI never hits a real model.
6. **Server-side keys only.** The app holds the Supabase anon key and nothing else secret.
