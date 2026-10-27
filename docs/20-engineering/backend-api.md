# FitG backend surface (Supabase Edge Functions)

One folder per function under `supabase/functions/<name>/index.ts`. Request/response bodies are Zod schemas in `packages/contracts/src/api.ts`; every function validates its input and returns `{ error: { code, message } }` with a proper status on failure.

## 1. Shared plumbing (`supabase/functions/_shared/`)
- `auth.ts` — verifies the caller's Supabase JWT (`createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization } } }).auth.getUser()`), returns `userId`; then a **service-role** client is used for writes, always scoped by that `userId`.
- `ratelimit.ts` — per-user, per-call-type, per-local-day counts from `ai_calls` (and `plan_commands` for sync) → `429 { retry_after_s }`.
- `ai.ts` — constructs the provider from `AI_PROVIDER`; wraps calls with logging to `ai_calls`.
- `cron.ts` — cron functions require header `x-cron-secret: $CRON_SECRET`.
- `cors.ts` — not needed for the native app; enabled only for local tooling.

## 2. Functions

| Function | Request → Response | Notes |
|---|---|---|
| `onboard-complete` | `{ profile, pantryFoodKeys[], places[] }` → `{ profile, targets, plan: WeekPayload, pings: ScheduledPing[] }` | Computes targets + deterministic week with the engine; queues the background AI plan (sync `plan_week`); silent push when the AI version lands. |
| `profile-update` | `{ patch?: ProfilePrefsPatch; body?: BodyGoalPatch }` → `{ profile, targets?, changedRows }` | Settings only (never AI). Recomputes targets/plan rows when relevant fields change (goal, schedule, weight). Types in `types.md` §9. |
| `plan-week` | `{ weekStart, mode: 'ai'\|'deterministic', reason }` → `{ planId, status: 'ready'\|'queued' }` | "Regenerate week"; max 3/day. |
| `plan-command` | `{ commands: PlanCommand[] }` → `{ applied: id[], rejected: {id, reason: RejectReason}[], changedRows, rebalance?: RebalanceDiff[] }` | `PlanCommand` and rejection rules in `types.md` §9 (each carries `basePlanVersion`). Also accepted inside `sync-push`; idempotent by command id. |
| `sync-push` | `offline-sync.md` §4 | 600/day cap. |
| `sync-pull` | `?since=<cursor>` → `{ rows: Record<table, Row[]>, cursor, bundleVersion }` | |
| `rebalance-day` | `{ date }` → `{ changedRows, diff, line }` | Engine `rebalanceDay` + optional `rebalance_line` wording. |
| `swap-options` | `{ kind: 'meal'\|'exercise', itemId }` → `{ options: [{ id, name, nutrition?, reason }] }` | Meals: SQL prefilter + `meal_swap`; exercises: engine `substitutes()` only. |
| `log-offplan` | `{ source: 'photo'\|'text', text?, photoPath?, date, slot, logId? }` → `{ logId, items, nutrition, question? }` | Photo read from storage → base64 → `offplan_parse`; names → `resolveFood`; numbers from DB. Also parses `pending` logs that arrive via `sync-push`. 20 photos/day. ("Pick from list" logs never need this function — the device computes them.) |
| `log-offplan-confirm` | `{ logId, answers }` → `{ nutrition, rebalance }` | Applies the oil answer etc., marks the planned item `replaced`, runs rebalance. |
| `menu-pick` | `{ text?, photoPath?, date, slot }` → `{ logId, pick, runnerUp?, portion, nutrition }` | `menu_parse` → resolve → engine `pickEatOut`; writes a `food_logs` row (source `menu`) and returns its `logId` for `SetEatOutPick`. |
| `coach-chat` | `{ threadId?, message }` → `{ threadId, reply, proposal?: { proposalId, commands, why } }` | Harness in `ai-orchestration.md` §5. Trial 10/day, paid 20/day + 200/month. |
| `coach-confirm` | `{ proposalId, accept: boolean }` → `{ applied, rejected, changedRows }` | Only path by which a coach proposal changes the plan. |
| `checkin-submit` | `{ weightKg?, energy, hunger, soreness }` → `{ adjust, targets, narrative, nextWeek: 'ready' }` | `weeklyAdjust` → deterministic next week now; AI version via the Sunday batch. |
| `grocery-generate` | `{ weekStart }` → `{ items }` | Engine `groceryList`. |
| `food-search` | `?q=&lang=` → `{ foods: [{ id, key, name, units }] }` | `resolveFood` steps 1–3; logs misses. |
| `devices-register` | `{ deviceId, platform, pushToken, appVersion, tz, notifPermission, locationPermission }` → `{ ok }` | |
| `export-data` | `{}` → `{ url }` (signed, 24 h) | JSON of every user row. |
| `delete-account` | `{ confirm: 'DELETE' }` → `{ ok }` | Deletes auth user (cascade), storage prefix, PostHog person; keeps anonymized cost aggregates. |
| `revenuecat-webhook` | RevenueCat event (Authorization header = `RC_WEBHOOK_SECRET`) → `200` | Upserts `subscriptions`; schedules nothing on device (the app does its own trial reminder). |

## 3. Scheduled jobs (pg_cron → pg_net → function with `x-cron-secret`)
Migration `0002_cron.sql` (Phase 5):

| Job | Schedule (UTC) | Function | Does |
|---|---|---|---|
| nightly | hourly at :05 | `cron-nightly` | For users whose local time is 20:00–20:59: ensure tomorrow's rows exist, run `ping_copy`, silent push. |
| weekly-checkin | hourly at :10 | `cron-weekly` | Sunday 17:00 local: mark check-in ready (silent notification scheduled on device). |
| batch-submit | hourly at :15 | `cron-batch-submit` | Sunday 18:00 local bucket, users active in last 7 days → `plan_week` batch. |
| batch-poll | every 10 min | `cron-batch-poll` | Apply finished batches (`ai-orchestration.md` §4.1). |
| learn-timing | daily 03:00 | `cron-learn-timing` | `learnTiming` per user → `profiles.learned_timing`. |
| cleanup | daily 04:00 | `cron-cleanup` | Delete meal photos older than `PHOTO_RETENTION_DAYS`, expired memory, `ping_schedule` older than 14 days. |
| trial-reminders | daily 05:00 | `cron-trial-reminders` | Backup check against `subscriptions.trial_ends_at` (the device also schedules its own reminder). |

## 4. Errors and limits
- 400 invalid input (Zod issues summarized), 401 no/invalid JWT, 403 entitlement required (AI endpoints after the trial without a subscription; 3-day grace — **enforced from Phase 7**; before that every user counts as "trial"), 429 rate limit, 500 with a Sentry event id. Stale commands are not an HTTP error: they come back in `rejected` with reason `stale`.
- Which tests run in which phase: `testing.md` §3.
- AI endpoints degrade, never fail hard: on provider error they return the deterministic result with `degraded: true`.
