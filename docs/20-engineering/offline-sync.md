# FitG offline-first and sync

## 1. Principles
- The **device owns actuals**: `events` (append-only), set results, meal statuses, weigh-ins, ping events, off-plan logs. They are true the moment they happen on the phone.
- The **server owns plans**: weekly plans, sessions, meal items, targets. The device changes a plan by sending **commands** (`types.md` §9), never by writing plan rows.
- Today, gym mode, kitchen mode, pings, one-tap logging and rebalance all run **offline** from SQLite with the shared engine.

## 2. Device storage (`apps/mobile/src/db/`)
expo-sqlite with versioned migrations (`PRAGMA user_version`); mirrors every **D** table (`data-model.md`) plus the reference bundles and local tables `outbox_commands`, `outbox_logs`, `sync_state` (cursor per table), `kv`. Repositories expose typed reads (JSON columns validated with Zod).

## 3. Commands
`PlanCommand` and `applyCommand` are defined in `types.md` §9 and implemented in `packages/engine/src/plan/`. Every command carries a client uuid `id` and the `basePlanVersion` the device saw. `applyCommand` runs **on the device first** (optimistic) and again on the server (authoritative). Commands that change meals or sessions also trigger `rebalanceDay` and a ping reschedule.

Coach proposals use `CoachCommand` (no command id or plan version; the only number is `SwapExercise.exerciseOrder`); `coach-confirm` converts them into `PlanCommand`s.

## 4. Protocol
- **`sync-push`** (Edge Function) body: `{ deviceId, events[], pingEvents[], pingSchedule[], commands[], weighIns[], foodLogs[], pendingLogs[] }`.
  - `foodLogs[]` are off-plan logs the device already computed (Pick tab: `source 'pick'`, `status 'confirmed'`, items + nutrition from the bundle) — they are upserted **before** the commands, so a `SetMealStatus { replaced, logId }` always points at a row the server has.
  - The server upserts by client id (idempotent), stores each `pingSchedule` row with server id `<user_id>:ping:<fireDate>:<type>` (the device id `ping:<fireDate>:<type>` prefixed with the user id), applies commands **in order against the current plan**, and returns `{ acceptedIds[], rejected: [{ id, reason: RejectReason }], changedRows, parsedLogs[] }`.
  - `pendingLogs[]` are off-plan logs made offline with a photo or typed text (`food_logs` rows with `status: 'pending'`): the server parses them when it receives them (AI `offplan_parse` from Phase 5; mock before) and returns the numbers in `parsedLogs`, after which the device rebalances.
- **`sync-pull?since=<cursor>`** returns rows with `updated_at > cursor` for the user's D tables + reference `bundle_version` deltas; the device upserts by id; new cursor = max `updated_at` seen.
- **Triggers**: app foreground; after any command or ping action; background task tick; silent push from cron. Exponential backoff on failure (1 s → 5 min, with jitter).

## 5. Conflict rules
1. Actuals never conflict (append-only, unique ids).
2. **Stale commands**: if a command's `basePlanVersion` is older than the active plan's version **and** its target row was replaced by the newer version (the replan touched it), the server rejects it with `stale`. The device rolls back its optimistic change and Today shows one line: "Your Tuesday swap didn't apply — the week was replanned."
3. Other rejections follow `types.md` §9 (`not_found`, `not_planned`, `invalid_status`, `invalid_value`).
4. A server replan (AI plan, reshuffle) replaces only rows still `planned` and dated ≥ tomorrow; rows with actuals are never overwritten. It bumps `weekly_plans.version`.
5. Plan rows: last writer wins by `updated_at` (the server is the only writer, so this only matters for stale pulls).
6. Time-zone change: the device recomputes local dates for display and reschedules pings; stored instants don't change.

## 6. What works offline, exactly
- One-tap meal statuses (ate / half / skipped), Home Food picks, and **"ate something else" picked from the on-device list** (recipes, home dishes, recent foods — all with bundled nutrition) → rebalance happens instantly on the phone.
- Photo or typed off-plan logs → saved as `pending`, Today says "Logged. I'll do the numbers when you're online.", rebalance runs when the parsed numbers come back.
- Gym mode, set logging, swaps (exercise substitutes are pure code), reshuffle after a skip.

## 7. Phase 2 (no backend)
With `EXPO_PUBLIC_BACKEND=local`, the outboxes simply accumulate; onboarding, planning, pings and logging all run on the device. Phase 3 turns on sync without changing any screen.
