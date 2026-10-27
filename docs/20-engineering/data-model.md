# FitG data model

The exact DDL is `schema.sql` (migration `0001_schema.sql`; parsed clean with the Postgres 17 parser on 2026-10-27). This doc explains the shape and the rules around it.

## 1. Conventions
- `id uuid primary key default gen_random_uuid()`; `user_id uuid references auth.users on delete cascade`; `timestamptz` everywhere; Postgres enums for closed sets; `CHECK` constraints for ranges.
- `updated_at` maintained by trigger on every table the device pulls (sync cursor).
- **Writes only through Edge Functions** (service role). Authenticated users have `SELECT` on their own rows (RLS `read_own`) and on reference tables (`read_all`). Internal tables (`ai_calls`, `ai_batches`, `food_resolution_misses`) have RLS on and no policies.
- Client-generated uuids for `events`, `ping_events`, `plan_commands` → idempotent upserts.
- Weekday numbering `0 = Monday … 6 = Sunday` in every JSON field (`gym_schedule`, `available_days`).

## 2. Entities

**Reference (R — seeded by `npm run data:build`; bundled to the device on first run)**
| Table | Purpose | On device |
|---|---|---|
| `exercises` | ~120 beginner-safe exercises with our fields (pattern, injury tags, start-load ratio, increment, rep range, 3 form cues, images) | yes |
| `foods` | per-100 g nutrition; `key` is the stable seed id; `yield_factor` for raw↔cooked | subset used by recipes/home dishes/add-ons + recent lookups |
| `food_aliases` | Hinglish/Hindi/English names for name resolution | no (server lookup) |
| `food_units` | grams per household unit per food (katori, roti, tsp…) | yes |
| `recipes` + `recipe_ingredients` | the 60–100 curated recipes; `nutrition_per_serving` computed at build; `tags` (`component` = Home Food base only), `requires` (pantry foods needed, e.g. whey), `prep` (soak/defrost with lead time) | yes |
| `home_dishes` | ~50 family-cooked dishes, each computed from a standard home-style recipe (`recipe_id`, `cooked_yield_g`) | yes |
| `protein_addons` | boiled egg, curd cup, whey scoop, paneer 50 g, roasted chana 30 g… | yes |
| `workout_templates` | full_ab / upper_lower × gym / machine / home_db | yes |

**Per user (D = mirrored to device SQLite)**
| Table | D | Notes |
|---|---|---|
| `profiles` | D | onboarding answers, prefs, `learned_timing`, `safety_flags`, time zone |
| `targets` | D (latest) | history of targets with `basis` (BMR, AF, notes) and `reason` |
| `places` | D | gym/home pins for geofencing |
| `weekly_plans` | D (active) | one `active` version per week (partial unique index); AI or deterministic |
| `plan_days` | D | per-date targets, prep tasks, `tomorrow_delta_kcal` (−200…+200) |
| `workout_sessions` / `workout_sets` | D | planned vs actual; status machine in `signals-and-pings.md` §2 |
| `exercise_progress` | D | current weight, miss streak, PRs |
| `meal_items` | D | planned meals (`kind`: recipe / home_food / eat_out) with portions/add-ons/nutrition (code-computed) and status |
| `food_logs` | D | off-plan logs (`source`: pick / photo / text / menu); `status` pending → parsed → confirmed; AI output kept in `parsed`, numbers in `items`/`nutrition` |
| `pantry_items` / `grocery_lists` | D | staples + ticked grocery items; weekly list |
| `ping_schedule` | D | what the device scheduled (stable ids `user:date:type`) |
| `ping_events` | — | delivered/acted/latency → learning + metrics |
| `events` | D (outbox) | append-only signal log; device → server |
| `plan_commands` | — | idempotency + audit of applied/rejected commands |
| `checkins` / `weigh_ins` | D | weekly check-in, weight trend (both have `updated_at` for sync) |
| `agent_memory` | — | ≤ 40 bullets per user for AI context |
| `chat_threads` / `chat_messages` | — | coach chat; `content` is verbatim API blocks, append-only (preserved thinking) |
| `subscriptions` | D | mirrored from RevenueCat webhook |
| `ai_calls` / `ai_batches` | — | cost, tokens, refusals, batch tracking |
| `devices` | — | push token, permissions, OS |

## 3. Rules that live outside the DDL
- A server replan (`plan_week` result, reshuffle) may only replace rows whose status is still `planned` and whose date is ≥ tomorrow. Rows with actuals are never overwritten.
- `meal_items.nutrition`, `portions`, `addons` and every `workout_sets` number are produced by `packages/engine`; nothing else writes them.
- `chat_messages.content` is never edited; deletion only via account deletion (cascade).
- `food_logs.photo_path` objects are deleted by `cron-cleanup` after `PHOTO_RETENTION_DAYS` (7); `photo_deleted_at` is set; parsed items stay.
- v1.1 adds `health_samples` in a new migration (not in 0001).

## 4. Device schema (expo-sqlite)
Mirror of every **D** table plus the reference tables, created by versioned migrations in `apps/mobile/src/db/migrations.ts` (array of SQL strings, `PRAGMA user_version`). JSON columns are `TEXT` holding JSON; enums are `TEXT` with app-side Zod validation; timestamps are ISO strings. Extra local-only tables: `outbox_commands` (pending `PlanCommand`s), `outbox_logs` (photo/typed off-plan logs waiting to be parsed), `sync_state` (cursor per table), `kv` (small settings). Shared types and id conventions: `types.md`.
