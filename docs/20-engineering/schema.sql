-- FitG — migration 0001_schema.sql
-- Source of truth for the v1 database. Copy to supabase/migrations/0001_schema.sql.
-- Conventions: uuid ids, timestamptz, Postgres enums, RLS on every table from the first migration.
-- Writes happen ONLY through Edge Functions (service role). Authenticated users get SELECT on their own rows.
-- Validate with `supabase db reset` (Phase 3). pg_cron/pg_net jobs live in a later migration (Phase 5).

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ───────────────────────── enums ─────────────────────────
create type sex_t              as enum ('male','female');
create type goal_t             as enum ('fat_loss','muscle','both','get_fit');
create type activity_t         as enum ('desk','on_feet','very_active');
create type experience_t       as enum ('new','lt6m','gt6m');
create type equipment_t        as enum ('full','basic','home_db');
create type diet_t             as enum ('veg','eggetarian','non_veg','vegan');
create type cuisine_t          as enum ('indian','western','mixed');
create type eating_mode_t      as enum ('cook','family','out','mix');
create type slot_t             as enum ('breakfast','lunch','post_workout','dinner','snack');
create type unit_t             as enum ('g','ml','piece','katori','roti','tsp','tbsp','cup','slice','scoop','egg','plate');
create type food_source_t      as enum ('usda','off','ifct','curated');
create type ingredient_role_t  as enum ('base','protein','carb','fat','veg','spice');
create type movement_pattern_t as enum ('squat','hinge','h_push','v_push','h_pull','v_pull','lunge','core','isolation');
create type load_type_t        as enum ('barbell','dumbbell','machine','cable','bodyweight');
create type split_t            as enum ('full_ab','upper_lower');
create type template_variant_t as enum ('gym','machine','home_db');
create type template_key_t     as enum ('A','B','upper','lower');
create type session_status_t   as enum ('planned','reminded','ready','in_progress','finished','partial','abandoned','skipped','moved');
create type start_source_t     as enum ('manual','geofence','ping_action');
create type feedback_t         as enum ('too_easy','ok','too_hard');
create type set_status_t       as enum ('planned','done','skipped');
create type meal_status_t      as enum ('planned','eaten','half','replaced','skipped','unknown');
create type food_log_source_t  as enum ('pick','photo','text','menu','voice');   -- 'voice' reserved for v2
create type place_kind_t       as enum ('gym','home');
create type plan_status_t      as enum ('draft','active','superseded');
create type plan_source_t      as enum ('ai','deterministic');
create type target_reason_t    as enum ('onboarding','weekly_adjust','recompute','manual');
create type display_mode_t     as enum ('full','habit_only');
create type pantry_kind_t      as enum ('staple','ticked_grocery');
create type ping_type_t        as enum ('night_before','pre_gym','post_gym','pre_dinner','trial_reminder','checkin');
create type ping_status_t      as enum ('scheduled','delivered','acted','expired','cancelled');
create type event_type_t       as enum ('app_open','session_started','set_done','set_edited','set_skipped','session_ended',
                                        'exercise_swapped','meal_status','ping_action','geofence_enter','geofence_exit',
                                        'weigh_in','feedback','permission_changed');
create type command_status_t   as enum ('applied','rejected');
create type weigh_source_t     as enum ('manual','healthkit','health_connect');
create type memory_kind_t      as enum ('preference','constraint','observation','feedback');
create type memory_source_t    as enum ('onboarding','chat','inferred','feedback');
create type chat_role_t        as enum ('user','assistant','system');   -- 'system' = appended "App context" messages (stored verbatim)
create type ai_call_status_t   as enum ('ok','refused','invalid','error','fallback_used');

-- updated_at maintenance (sync-pull relies on updated_at)
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── reference data (read-only to users) ─────────────────────────
create table exercises (
  id                text primary key,                 -- our slug, e.g. 'bench_press_barbell'
  source_name       text,                             -- name in free-exercise-db (import matching)
  name              text not null,
  primary_muscle    text not null,
  secondary_muscles text[] not null default '{}',
  movement_pattern  movement_pattern_t not null,
  equipment         text[] not null default '{}',     -- e.g. {'barbell','bench'}
  load_type         load_type_t not null,
  is_machine        boolean not null default false,
  level             text not null default 'beginner',
  injury_tags       text[] not null default '{}',     -- subset of {'knee','back','shoulder'}
  form_cues         text[] not null default '{}',     -- exactly 3 short cues
  image_paths       text[] not null default '{}',
  start_load_ratio  numeric(4,3) not null default 0,  -- × bodyweight, then snapped; 0 = start at minimum load
  increment_kg      numeric(4,2) not null,
  rep_min           int not null check (rep_min > 0),
  rep_max           int not null check (rep_max >= rep_min),
  importance        int not null default 2 check (importance between 1 and 3),
  search            tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(name,''))) stored
);
create index exercises_search_idx on exercises using gin (search);

create table foods (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,               -- stable seed key, e.g. 'egg_whole'
  source          food_source_t not null,
  source_id       text,                               -- e.g. USDA fdc_id
  name            text not null,
  name_hi         text,
  category        text not null,
  kcal            numeric(7,2) not null check (kcal >= 0),       -- per 100 g
  protein_g       numeric(6,2) not null check (protein_g >= 0),
  carbs_g         numeric(6,2) not null check (carbs_g >= 0),
  fat_g           numeric(6,2) not null check (fat_g >= 0),
  fiber_g         numeric(6,2) not null default 0,
  is_raw          boolean not null default true,
  yield_factor    numeric(5,2) not null default 1,  -- cooked g / raw g (rice ≈ 3.0, dal ≈ 2.5, atta→roti ≈ 1.3)
  is_generic      boolean not null default false,   -- restaurant/mess fallbacks ("biryani, 1 plate")
  cooked_with_oil boolean not null default false,
  search          tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(name,''))) stored,
  unique (source, source_id)
);
create index foods_search_idx on foods using gin (search);
create index foods_name_trgm_idx on foods using gin (name gin_trgm_ops);

create table food_aliases (
  id      uuid primary key default gen_random_uuid(),
  food_id uuid not null references foods(id) on delete cascade,
  alias   text not null,
  lang    text not null check (lang in ('en','hi','hinglish')),
  unique (food_id, alias)
);
create index food_aliases_trgm_idx on food_aliases using gin (alias gin_trgm_ops);

create table food_units (
  id      uuid primary key default gen_random_uuid(),
  food_id uuid not null references foods(id) on delete cascade,
  unit    unit_t not null,
  grams   numeric(7,2) not null check (grams > 0),
  label   text not null,                               -- "1 katori (150 g)"
  unique (food_id, unit)
);

create table recipes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  cuisine               cuisine_t not null,
  meal_slots            slot_t[] not null,
  diet_tags             diet_t[] not null,
  allergens             text[] not null default '{}',
  cook_time_min         int not null check (cook_time_min >= 0),
  cost_tier             int not null check (cost_tier between 1 and 3),
  servings              int not null default 1 check (servings > 0),
  steps                 jsonb not null default '[]',   -- [{text, timer_sec?}]
  oil_tsp               numeric(4,2) not null default 0,
  cooked_yield_g        numeric(7,1),                  -- total cooked weight (needed for home-dish portioning)
  nutrition_per_serving jsonb not null,                -- computed by data:build: {kcal,protein_g,carbs_g,fat_g}
  scale_rules           jsonb not null default '{"min_mult":0.5,"max_mult":2,"step":0.25}',
  protein_addon_keys    text[] not null default '{}',
  tags                  text[] not null default '{}',      -- 'component' = never offered as a meal on its own
  requires              text[] not null default '{}',      -- food keys that must be in the pantry (e.g. whey)
  prep                  jsonb,                             -- {text, lead_hours} e.g. soak rajma
  is_draft              boolean not null default false, -- placeholders until the founder approves
  search                tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(name,''))) stored
);
create index recipes_search_idx on recipes using gin (search);

create table recipe_ingredients (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references recipes(id) on delete cascade,
  food_id        uuid not null references foods(id),
  grams          numeric(7,2) not null check (grams > 0),  -- raw grams per serving
  household_unit unit_t not null,
  household_qty  numeric(5,2) not null,
  role           ingredient_role_t not null,
  scalable       boolean not null default true,
  sort           int not null default 0
);
create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

create table home_dishes (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,
  name           text not null,
  aliases        text[] not null default '{}',
  recipe_id      uuid not null references recipes(id),   -- the standard home-style recipe it is computed from
  unit           unit_t not null,                         -- 'katori', 'roti', 'piece', 'plate'
  grams_per_unit numeric(7,2) not null check (grams_per_unit > 0),  -- cooked grams per unit
  category       text not null check (category in ('dal','sabzi','curry_nonveg','rice','bread','snack','breakfast','sweet')),
  protein_class  text not null check (protein_class in ('high','med','low'))
);

create table protein_addons (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,                     -- 'boiled_egg', 'curd_cup', 'whey_scoop', 'paneer_50g', 'roasted_chana_30g'
  name           text not null,
  food_id        uuid not null references foods(id),
  unit           unit_t not null,
  grams_per_unit numeric(7,2) not null check (grams_per_unit > 0),
  diet_tags      diet_t[] not null,
  pantry_food_id uuid references foods(id)                 -- must be in pantry to be suggested
);

create table workout_templates (
  id            text primary key,                          -- 'full_ab_gym', 'upper_lower_machine', ...
  name          text not null,
  days_per_week int[] not null,                             -- e.g. {2,3}
  split         split_t not null,
  variant       template_variant_t not null,
  sessions      jsonb not null                              -- TemplateSession[] (engines.md §2)
);

-- ───────────────────────── per-user data ─────────────────────────
create table profiles (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  sex                     sex_t not null,
  birth_year              int not null check (birth_year between 1920 and 2010),
  height_cm               numeric(5,1) not null check (height_cm between 120 and 230),
  weight_kg               numeric(5,1) not null check (weight_kg between 30 and 300),
  goal_weight_kg          numeric(5,1),
  goal                    goal_t not null,
  activity                activity_t not null,
  experience              experience_t not null,
  injuries                text[] not null default '{}',
  equipment               equipment_t not null,
  home_dumbbells_kg       numeric(4,1)[] not null default '{}',
  gym_schedule            jsonb not null default '[]',      -- [{weekday:0-6 (0=Mon), start:"18:30", duration_min:45|60|75}]
  available_days          int[] not null default '{0,1,2,3,4,5,6}',  -- days a missed session may move to (0=Mon)
  diet                    diet_t not null,
  cuisine_pref            cuisine_t not null,
  allergies               text[] not null default '{}',
  dislikes                text[] not null default '{}',
  eating_mode             eating_mode_t not null,
  wake_time               time not null,
  sleep_time              time not null,
  meal_times              jsonb not null,                   -- {breakfast:"08:00", lunch:"13:00", dinner:"20:45", snack?:"17:00"}
  cook_time_pref          int not null default 20,
  budget_tier             int not null default 2 check (budget_tier between 1 and 3),
  safety_flags            jsonb not null default '{}',      -- {pregnant,diabetes,glp1,ed_history}
  timezone                text not null,                    -- IANA, e.g. 'Asia/Kolkata'
  units                   text not null default 'kg' check (units in ('kg','lb')),
  notification_prefs      jsonb not null default '{}',      -- {night_before:"21:30", pre_gym_offset_min:15, time_sensitive:true, haptics:true}
  learned_timing          jsonb not null default '{"pre_gym_shift_min":0,"dinner_shift_min":0}',
  onboarding_completed_at timestamptz,
  journey_started_at      date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  kcal           int not null,
  protein_g      int not null,
  carbs_g        int not null,
  fat_g          int not null,
  kcal_delta     int not null default 0,
  basis          jsonb not null,              -- {bmr, activity_factor, tdee, adjust_pct, weight_used_kg, floors_applied, notes[]}
  reason         target_reason_t not null,
  display_mode   display_mode_t not null default 'full',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index targets_user_idx on targets (user_id, effective_from desc);

create table places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       place_kind_t not null,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   int not null default 150 check (radius_m between 100 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_user_idx on places (user_id);

create table weekly_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  week_start   date not null,                 -- Monday, user's local date
  version      int not null default 1,
  status       plan_status_t not null,
  generated_by plan_source_t not null,
  ai_call_id   uuid,
  summary      text,                          -- AI week note (prose, validated)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, week_start, version)
);
create unique index weekly_plans_one_active on weekly_plans (user_id, week_start) where status = 'active';

create table plan_days (
  id                  uuid primary key default gen_random_uuid(),
  weekly_plan_id      uuid not null references weekly_plans(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  date                date not null,
  is_gym_day          boolean not null,
  kcal_target         int not null,
  protein_target      int not null,
  prep_tasks          jsonb not null default '[]',     -- [{for_date, text, at, recipe_slug}]
  tomorrow_delta_kcal int not null default 0 check (tomorrow_delta_kcal between -200 and 200),
  ok                  boolean not null default true,   -- the planner hit the day's targets (engines.md §3.4)
  problems            jsonb not null default '[]',     -- Problem[] when it didn't
  updated_at          timestamptz not null default now(),
  unique (weekly_plan_id, date)
);
create index plan_days_user_date_idx on plan_days (user_id, date);

create table workout_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  plan_day_id          uuid not null references plan_days(id) on delete cascade,
  date                 date not null,
  template_key         template_key_t not null,
  name                 text not null,              -- "Full body A" / "Upper body"
  planned_start        timestamptz not null,
  planned_duration_min int not null,
  status               session_status_t not null default 'planned',
  started_at           timestamptz,
  ended_at             timestamptz,
  start_source         start_source_t,
  importance           int not null default 2,
  moved_from_date      date,
  feedback             feedback_t,
  summary              jsonb,                       -- {prs:[], vs_last:{}, next_time:[]}
  version              int not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index workout_sessions_user_date_idx on workout_sessions (user_id, date);

create table workout_sets (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references workout_sessions(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  exercise_id              text not null references exercises(id),
  exercise_order           int not null,
  set_index                int not null,
  target_weight_kg         numeric(5,2) not null,
  target_reps_min          int not null,
  target_reps_max          int not null,
  target_reps              int not null,               -- the rep target shown for this set (engines.md §2.2)
  rest_sec                 int not null default 90,
  actual_weight_kg         numeric(5,2),
  actual_reps              int,
  status                   set_status_t not null default 'planned',
  done_at                  timestamptz,
  swapped_from_exercise_id text references exercises(id),
  updated_at               timestamptz not null default now(),
  unique (session_id, exercise_order, set_index)
);
create index workout_sets_user_idx on workout_sets (user_id);

create table exercise_progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  exercise_id       text not null references exercises(id),
  current_weight_kg numeric(5,2) not null,
  miss_streak       int not null default 0,
  hit_top_last      boolean not null default false,
  pr_weight_kg      numeric(5,2),
  pr_reps           int,
  last_session_id   uuid references workout_sessions(id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table food_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null,
  slot             slot_t not null,
  source           food_log_source_t not null,
  raw_input        text,
  photo_path       text,                         -- storage path meal-photos/<user_id>/<uuid>.jpg
  parsed           jsonb,                        -- AI output (names/units/qty/oil level only)
  items            jsonb not null default '[]',  -- [{food_id, grams, nutrition}] computed by code
  nutrition        jsonb,                        -- totals computed by code
  confidence       numeric(3,2),
  status           text not null default 'parsed' check (status in ('pending','parsed','confirmed')),  -- pending = logged offline, not parsed yet
  pending_question jsonb,                        -- {text, options[]}
  photo_deleted_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index food_logs_user_date_idx on food_logs (user_id, date);

create table meal_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  plan_day_id        uuid not null references plan_days(id) on delete cascade,
  date               date not null,
  slot               slot_t not null,
  planned_at         timestamptz not null,
  kind               text not null default 'recipe' check (kind in ('recipe','home_food','eat_out')),
  recipe_id          uuid references recipes(id),
  home_dish_ids      uuid[],                      -- Home Food mode picks (family-cooked)
  multiplier         numeric(4,2) not null default 1,
  portions           jsonb not null default '[]', -- [{food_id, grams, unit, qty, label}]
  addons             jsonb not null default '[]', -- [{addon_key, qty}]
  nutrition          jsonb not null,              -- {kcal, protein_g, carbs_g, fat_g} computed by code
  status             meal_status_t not null default 'planned',
  status_at          timestamptz,
  replaced_by_log_id uuid references food_logs(id) on delete set null,
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index meal_items_user_date_idx on meal_items (user_id, date);

create table food_resolution_misses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  query      text not null,
  lang       text,
  created_at timestamptz not null default now()
);

create table pantry_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid not null references foods(id),
  label      text not null,
  kind       pantry_kind_t not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, food_id, kind)
);

create table grocery_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  items      jsonb not null default '[]',  -- [{food_id, name, qty, unit, group, checked}]
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table ping_schedule (
  id          text primary key,             -- '<user_id>:ping:<fireDate>:<type>' (device id prefixed by the server)
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  type        ping_type_t not null,
  fire_at     timestamptz not null,
  payload     jsonb not null,               -- {title, body, categoryId, data}
  copy_source text not null default 'template' check (copy_source in ('template','ai')),
  status      ping_status_t not null default 'scheduled',
  updated_at  timestamptz not null default now()
);
create index ping_schedule_user_date_idx on ping_schedule (user_id, date);

create table ping_events (
  id            uuid primary key,             -- client-generated
  user_id       uuid not null references auth.users(id) on delete cascade,
  ping_id       text not null,
  type          ping_type_t not null,
  scheduled_for timestamptz not null,
  delivered_at  timestamptz,
  acted_at      timestamptz,
  action        text,
  latency_s     int,
  context       jsonb,
  created_at    timestamptz not null default now()
);
create index ping_events_user_type_idx on ping_events (user_id, type, scheduled_for desc);

create table events (
  id          uuid primary key,               -- client-generated → idempotent upsert
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  type        event_type_t not null,
  at          timestamptz not null,
  payload     jsonb not null default '{}',
  received_at timestamptz not null default now()
);
create index events_user_at_idx on events (user_id, at desc);

create table plan_commands (
  id          uuid primary key,               -- client-generated → idempotent
  user_id     uuid not null references auth.users(id) on delete cascade,
  command     jsonb not null,                 -- PlanCommand (contracts)
  status      command_status_t not null,
  reason      text,
  received_at timestamptz not null default now()
);
create index plan_commands_user_idx on plan_commands (user_id, received_at desc);

create table checkins (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  week_start          date not null,
  weight_kg           numeric(5,1),
  energy              int check (energy between 1 and 3),
  hunger              int check (hunger between 1 and 3),
  soreness            int check (soreness between 1 and 3),
  adherence           jsonb,                  -- {workouts_done, workouts_planned, meal_logged_pct, protein_days}
  kcal_adjust_applied int not null default 0,
  narrative           jsonb,                  -- {headline, body, nextWeekFocus} (validated prose)
  completed_at        timestamptz,
  updated_at          timestamptz not null default now(),
  unique (user_id, week_start)
);

create table weigh_ins (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  at        timestamptz not null,
  weight_kg  numeric(5,1) not null check (weight_kg between 30 and 300),
  source     weigh_source_t not null default 'manual',
  updated_at timestamptz not null default now()
);
create index weigh_ins_user_at_idx on weigh_ins (user_id, at desc);

create table agent_memory (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              memory_kind_t not null,
  key               text not null,             -- 'preference:diet', 'feedback:recipe:<slug>', 'observation:skips_friday'
  value             text not null,
  confidence        numeric(3,2) not null default 1,
  source            memory_source_t not null,
  last_confirmed_at timestamptz not null default now(),
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, key)
);

create table chat_threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  seed_summary  text,                          -- summary of the previous thread (simple compaction)
  system_hash   text not null,                 -- hash of the frozen system+tools used for this thread
  message_count int not null default 0,
  closed_at     timestamptz
);
create index chat_threads_user_idx on chat_threads (user_id, started_at desc);

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references chat_threads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  seq        int not null,
  role       chat_role_t not null,
  content    jsonb not null,                   -- VERBATIM Anthropic content blocks (incl. thinking blocks + signatures). Never edited.
  proposal   jsonb,                            -- {proposalId, commands: CoachCommand[], why} awaiting confirm
  created_at timestamptz not null default now(),
  unique (thread_id, seq)
);

create table subscriptions (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  rc_app_user_id     text not null,
  entitlement_active boolean not null default false,
  product_id         text,
  store              text,
  status             text,
  trial_ends_at      timestamptz,
  expires_at         timestamptz,
  will_renew         boolean,
  raw                jsonb,
  updated_at         timestamptz not null default now()
);

create table ai_calls (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  call_type          text not null,            -- plan_week | ping_copy | rebalance_line | meal_swap | offplan_parse | menu_parse | coach_chat | checkin_narrative | thread_summary
  provider           text not null check (provider in ('mock','anthropic')),
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd           numeric(10,6) not null default 0,
  latency_ms         int,
  status             ai_call_status_t not null,
  stop_reason        text,
  refusal_category   text,
  validated          boolean not null default false,
  error              text,
  batch_id           text,
  created_at         timestamptz not null default now()
);
create index ai_calls_user_idx on ai_calls (user_id, created_at desc);
create index ai_calls_type_idx on ai_calls (call_type, created_at desc);

create table ai_batches (
  id            text primary key,              -- Anthropic batch id
  kind          text not null,                 -- 'plan_week'
  week_start    date not null,
  submitted_at  timestamptz not null default now(),
  status        text not null default 'in_progress',
  request_count int not null,
  ended_at      timestamptz
);

create table devices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  device_id           text not null,
  platform            text not null check (platform in ('ios','android')),
  push_token          text,
  app_version         text,
  tz                  text,
  notif_permission    text,
  location_permission text,
  last_seen_at        timestamptz not null default now(),
  unique (user_id, device_id)
);

-- ───────────────────────── updated_at triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','targets','places','weekly_plans','plan_days','workout_sessions','workout_sets',
                           'exercise_progress','food_logs','meal_items','pantry_items','grocery_lists','ping_schedule',
                           'checkins','agent_memory','subscriptions','weigh_ins']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────── row level security ─────────────────────────
-- Reference tables: any signed-in user may read; nobody may write through the API (service role bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['exercises','foods','food_aliases','food_units','recipes','recipe_ingredients',
                           'home_dishes','protein_addons','workout_templates']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Per-user tables: read own rows only. All writes go through Edge Functions with the service role.
do $$
declare t text;
begin
  foreach t in array array['profiles','targets','places','weekly_plans','plan_days','workout_sessions','workout_sets',
                           'exercise_progress','food_logs','meal_items','pantry_items','grocery_lists','ping_schedule',
                           'ping_events','events','plan_commands','checkins','weigh_ins','agent_memory','chat_threads',
                           'chat_messages','subscriptions','devices']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_own on %I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Internal tables: RLS on, no policies at all (service role only).
alter table ai_calls enable row level security;
alter table ai_batches enable row level security;
alter table food_resolution_misses enable row level security;

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
  on conflict (id) do nothing;

create policy meal_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy meal_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
