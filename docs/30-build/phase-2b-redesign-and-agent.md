# Phase 2b: the dark redesign and a visible agent

**Status:** direction approved by Abdul on 28 Oct 2026. Not built yet. This is the next job, before Phase 3.

**Mockups:** `docs/10-design/mockups/phase-2b/` (open any `.html` file in a browser), also on a live canvas at
https://claude.ai/artifact/98wjJijFB6uauBz6h4r7de (private to Abdul until he shares it). Four screens: plan
reveal, Today, Snap my plate, and the workout screen.

## Why this phase exists

Abdul tried Phase 2 on his iPhone. Everything works, but:

- **Every screen felt weak:** onboarding, the plan reveal, Today and the workout view.
- **It looks AI-made.** It is the default look AI design tools produce:
  - a cream background with a coral accent;
  - identical rounded white cards;
  - small ALL-CAPS labels above everything, and "A · B · C" meta lines;
  - not one picture of a body, a machine or a plate of food.
- **The agent is invisible.** The engine already moves missed workouts and sizes every portion. The app only shows
  the result. It never says "I did this for you, here's why, undo".

## What Abdul decided (28 Oct, multiple choice)

| Question                         | His answer                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| Look                             | Like WHOOP / Oura: dark, premium, big numbers, rings and charts, a pro tool |
| What makes the agent feel real   | 1. It acts and tells you, with undo. 2. Snap my plate.                      |
| Real AI now?                     | No. Sample answers now; real AI later ($5 Anthropic credit + free Supabase) |
| Which screens to fix             | All four: onboarding, plan reveal, Today, workout view                      |

He did not pick "talk to it" (chat) or "voice in the gym" for now. Chat arrives with real AI in Phase 5.

## Goals

1. Nobody mistakes FitG for a template. Dark, data-first, with pictures of real moves and real food.
2. The agent's work is visible. Every change the app makes on its own becomes one first-person sentence with the
   reason and, where it makes sense, an Undo.
3. Snap my plate works end to end on the phone with sample answers, and the rest of the day really changes.

## Non-goals (they belong to later phases)

- Real AI calls, chat, Supabase and sign-in (Phases 3 and 5).
- Gym mode with "Done set" and the rest timer (Phase 4). The workout mockup shows the look Phase 4 builds on.
- Light mode. FitG is dark-only until users ask for light.

## Anti-goals (failure even if it works)

- Purple gradients, sparkles, an orb, emoji or "AI-powered" badges. The agent proves itself by what it does.
- Numbers from AI or from fixture text. Every kcal, gram, kg and rep comes from the engine and the data bundle.
- Breaking habit-only mode. It never shows food or body numbers: not in agent sentences, not in Snap results.

---

## 1. The visual system (replaces Warm Spotter)

### Colours

The ground is true black, chosen on purpose for OLED iPhones (not a tinted near-black). The four data colours are
the colours of competition weight plates. Each means exactly one thing, and each is always paired with a word or an
icon, never used as decoration.

| Token            | Hex       | Use                                                         |
| ---------------- | --------- | ----------------------------------------------------------- |
| `bg.base`        | `#000000` | Every screen                                                |
| `bg.surface`     | `#111214` | Panels (next action, agent notes, tab bar)                  |
| `bg.raised`      | `#1B1C1F` | Dial track, steppers, chips                                 |
| `line`           | `#2B2C30` | Hairlines between rows                                      |
| `line.strong`    | `#3A3B3F` | Outline buttons                                             |
| `text.primary`   | `#F3F3F0` | Text; also the fill of primary buttons (with black text)    |
| `text.secondary` | `#A9AAA5` | Supporting text                                             |
| `text.tertiary`  | `#8A8B86` | Times and hints (passes 4.5:1 on base and surface)          |
| `data.load`      | `#FF5B4F` | Workouts and training load (red plate)                      |
| `data.protein`   | `#4E8EFF` | Protein (blue plate)                                        |
| `data.streak`    | `#FFD13B` | Streaks, wins and PRs (yellow plate)                        |
| `data.done`      | `#3FD68A` | Done: eaten, finished (green plate)                         |

The primary button is white with black text (about 19:1), not a coloured accent.

### Type

- **Big Shoulders Display** (700, 800): numbers and screen titles. Industrial and condensed, like a gym's scoreboard.
  Package: `@expo-google-fonts/big-shoulders-display`.
- **Atkinson Hyperlegible** (400, 700): everything else. It was designed for reading at a glance, which is what you
  do mid-set. Package: `@expo-google-fonts/atkinson-hyperlegible`.
- Numbers that change (timers, steppers, count-ups): check that Big Shoulders has tabular figures on both
  platforms. If it doesn't, give the number a fixed-width box so it doesn't jitter.

### Shape

Panels have a 22 px radius, buttons 14, chips 12. Rows inside a panel are separated by hairlines, not stacked as
separate cards. Keep the 4-pt spacing scale and the tap-target rules from `docs/10-design/tokens.md`: 48 pt minimum,
56 to 72 in the gym.

### Banned (each is a tell of generated design)

- ALL-CAPS labels. Remove the uppercase `micro` text variant.
- A small label above every heading, when the content already says what it is.
- Meta lines joined with "·". Write "6 moves, about 55 minutes".
- "→" in button text, and emoji anywhere.
- Gradient washes, glass blur, left-border accent cards, identical card stacks.

First, move the user-facing strings that still live outside `src/copy` into it. The handover review found "·" in
`src/domain/today.ts:145`, `src/domain/reveal.ts:58` and `app/settings.tsx:93` and `:103`. Then add a unit test over
`src/copy/**` that fails on "·", "→" and emoji, next to the existing banned-words test.

### Files

- `apps/mobile/constants/theme.ts`: the tokens, including the text variants (`micro` lives here). It stays the only
  place hex values live; ESLint enforces that. `apps/mobile/src/ui/theme.tsx` is only the provider.
- `apps/mobile/app/_layout.tsx`: font loading.
- Every component in `apps/mobile/src/ui/`.
- A new contrast test in `apps/mobile/test-node/` for the pairs in the colour table. None exists yet.
- Docs, in the same change (AGENTS.md: docs are the source of truth):
  - `docs/10-design/tokens.md`, `screens.md`, `components.md`, `copy.md`;
  - `store-assets.md`: the icon becomes a white mark on black.

  `docs/00-product/PRD.md` and `brand.md` already describe the new look (changed 28 Oct).

---

## 2. The agent shows its work

### 2.1 What counts as an agent action

Anything the app changes on the user's behalf.

| Kind               | When (built so far)                                                                                     | Title (template)                              | Reason (template)                                                     | Undo                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `session_moved`    | The user taps Skip, or a workout was missed and the next app open skips it (`backend.loadSnapshot`)     | Moved Full body B to Thursday, 6:30 pm        | You missed it yesterday. Same weights, and Friday stays as planned.   | After Skip: Undo puts it back. After a missed workout: "Change day" instead (the original day is past) |
| `session_dropped`  | The reshuffle finds no free day left this week                                                          | Dropped Full body A this week                 | No free day before Sunday. Next week starts with Full body B.         | None                                                                 |
| `meals_rebalanced` | Snap my plate logs a meal that differs from the plan (section 3)                                        | Made dinner lighter: 1 roti instead of 2      | Lunch was heavier than planned. You'll still reach 120 g protein.     | Undo restores dinner and removes the logged meal                     |
| `weight_progressed` | Phase 4, after a logged workout                                                                        | Added 2.5 kg to Shoulder press                | You did 12, 12 and 12 last time.                                      | Undo keeps the old weight                                            |
| `targets_adjusted` | Phase 7, weekly check-in                                                                                | Calories down 150 a day                       | Your weight hasn't moved for 2 weeks.                                 | Undo                                                                 |

**One trigger, one action.**

- **What counts as one trigger:**
  - one Skip tap;
  - one catch-up at app open, covering every missed workout it skips (`backend.ts:127-130`).
- **What the action contains:** everything the trigger moved or dropped. Its kind is `session_moved` if anything
  moved (drops are listed in the same action), and `session_dropped` only if nothing moved.
- **Example:** "Moved Full body B to Thursday and Full body A to Saturday."

This settles Abdul's earlier decision that one Skip which moves two workouts shows one card.

### 2.2 Data

Store facts, not sentences. The copy can then change later, and habit-only mode can render the same action without
numbers.

```ts
// packages/contracts: a new doc table, same pattern as the others (Zod row + DbTables entry)
AgentActionRow = {
  id: uuid;
  user_id: uuid;
  at: Instant;
  kind: 'session_moved' | 'session_dropped' | 'meals_rebalanced' | 'weight_progressed' | 'targets_adjusted';
  facts: Record<string, string | number | string[]>; // names, dates, numbers from the engine
  undo: PlanCommandBody[] | null; // the inverse plan commands, worked out when the action is written
  undo_label: 'Undo' | 'Change day' | null;
  status: 'active' | 'undone';
  seen: boolean;
};
```

- **Device table:** `agent_actions`. Add it to `DbTables` and to `docs/20-engineering/schema.sql` in the same
  change; `packages/contracts/test/db.test.ts:54-56` checks that they match. Then add it to `DEVICE_TABLES` with a
  migration, and add store functions next to the others in `src/db/store.ts`.
- **Phase 3:** sync it, so the coach in Phase 5 can read the history as context.

### 2.3 Writing and undoing

- **Writing:**
  - `backend.runCommand` and the missed-workout loop in `backend.loadSnapshot` compare the week before and after a
    `SkipSession`. Moved sessions become one `session_moved` action; a dropped session becomes `session_dropped`.
  - Snap my plate writes `meals_rebalanced` (section 3).
- **Undo:** add `backend.undoAgentAction(id)`. It runs the action's inverse commands through the normal command path
  (`runPlanCommand`), so they're saved and queued for sync like any other edit.
  - **After a Skip:** for each moved session, `MoveSession` back to its original day and `SetSessionTime` to its
    original time.
  - **After Snap:** `SetMealStatus` back to `planned` and delete the food log. The engine re-runs the day's
    rebalance, so dinner comes back. If the engine refuses `planned` as a target status, allow it for this case.
  - **If the engine rejects any inverse command** (the plan changed since), apply none and show "Can't undo: your
    plan changed since."
  - **Don't detect conflicts with `updated_at`.** `saveWeek` re-stamps every row of the week on every command
    (`store.ts:180-251`), so any later tap would block every undo.
- **Missed workouts** get "Change day" instead: a day picker that sends `MoveSession`.
- **When Undo shows:** only while the affected item is still in the future.
- **Tests:** add them to `apps/mobile/test-node/` on real SQLite, like `domain.test.ts`.

### 2.4 Where it shows

- **Today:**
  - "What I changed today" lists today's actions, newest first, at most 3, with "See all".
  - The newest unseen action also becomes the one-line coach brief at the top of Today.
  - Actions are marked seen once they're shown.
- **Coach tab:** "Everything I've changed", the full history grouped by day (until chat arrives in Phase 5).
- **Retired:** the `comeback` next-step card and its "Got it" flow. The agent log replaces them.
- **Later:** Phase 4's push notifications reuse the same templates.

### 2.5 Copy rules

- First person, past tense, specific: "Moved", "Made dinner lighter", "Added 2.5 kg".
- Reasons are one sentence. No guilt words; `src/copy` already has a banned-words test.
- **Habit-only:**
  - Reasons drop every food and body number: "Lunch was heavier than planned, so dinner is lighter."
  - Add a test that fails when a habit-only sentence contains a digit, apart from times and dates.

---

## 3. Snap my plate (sample answers for now)

1. **Open the camera.** The raised button in the middle of the tab bar opens "Take photo" or "Choose from library"
   via `expo-image-picker` (works in Expo Go; add it with `npx expo install expo-image-picker`). The permission copy
   goes in `src/copy`.
2. **Pick the meal.** It defaults to the planned meal closest to now (within 2 hours). Otherwise one tap: Breakfast,
   Lunch, After gym, Dinner or Snack.
3. **"Looking at your plate".** Show the PulseDot for at least 1.2 s.
4. **Show the result** from a sample plate.
   - **Where the plates live:** in the app, at `apps/mobile/src/ai/samplePlates.ts`. They're shaped like the
     `offplan_parse` output in `packages/contracts`, and a test validates them against it.
   - **Three plates, picked by diet**, so a vegetarian never sees chicken (my call):
     - chicken biryani with raita and onion salad (non-veg; based on
       `fixtures/ai/offplan_parse/valid_biryani.json`);
     - egg bhurji with 2 rotis (eggetarian);
     - dal, rice, roti and a sabzi (veg).
   - **Other fixtures:** the rest of `fixtures/ai/offplan_parse/` are reject and question cases for Phase 5's
     validators. Don't use them as plates.
   - **Bundle ids:** map every item to a `home_dishes` or recipe id in the bundle, so names and nutrition come from
     the bundle, never from fixture text. Raita maps to the curd food, at ½ katori.
   - **Provider switch:** the app doesn't use `@fitg/ai`, and nothing reads `EXPO_PUBLIC_AI_PROVIDER` yet. Add
     `apps/mobile/src/ai/provider.ts` that reads it, with `mock` (the sample plates) as the default.
   - Each item shows its household portion (katori, roti, cup) with a stepper, and its kcal and protein.
   - If a dish is cooked with oil, ask one question: "How oily was it? Light / Normal / Very oily" (+0, +1 or +2 tsp
     at 4.5 g of oil each).
   - A small "Sample answer" tag sits on the photo until real AI is switched on.
5. **Make the rebalance count the logged meal first.**
   - `SetMealStatus` with `replaced` already rebalances the rest of the day inside the engine
     (`packages/engine/src/plan/commands.ts:372`).
   - But `backend.runCommand` passes no `logs` to the engine (`backend.ts:172-178`), so today a replaced meal counts
     as 0 kcal (`rebalance.ts:33-36`).
   - Fix: load the day's food logs, with nutrition computed from the bundle, into `PlanState.logs` in `runCommand`.
6. **Preview the change.** Run the same `SetMealStatus` on a copy of the snapshot, without saving. Show one
   sentence: "When you log this, I'll make dinner lighter: egg bhurji with 1 roti instead of 2. You'll still reach
   120 g protein."
7. **"Log lunch".**
   - **Save the log** as a `food_logs` row (already a device table) and in `outbox_logs` for Phase 3. Use the existing
     sync contract for logs the device computed: `source: 'pick'` (`packages/contracts/src/api.ts:202-211`), because
     the user confirmed a list of bundle items.
   - **Apply** `SetMealStatus` (`replaced`, with the log's id as `logId`). The engine rebalances the day.
   - **Write one `meals_rebalanced` agent action.** Its undo is `SetMealStatus` back to `planned`, plus deleting the
     log.
   - **Confirm** with the toast "Logged lunch".
8. **Privacy.** In sample mode the photo never leaves the phone. Delete the temporary file after logging.

- **Habit-only:** no kcal or protein anywhere in the flow; portions only.
- **Real AI later:**
  - Set `EXPO_PUBLIC_AI_PROVIDER=server`. Phase 3 adds Supabase; Phase 5 adds the `offplan_parse` edge function
    (Haiku vision, about $0.0004 a photo).
  - Real photos then use the sync path for photos the server parses (`api.ts:214-231`).
  - The result has the same contract shape (`packages/contracts`, offplan_parse), so this screen doesn't change.

---

## 4. Screen by screen

### Today (mockup: `Main`)

- **Header:** the date, "Day 4 of 90", and a settings button.
- **Day dial (the one bold element):**
  - A 24-hour ring with midnight at the top.
  - Arcs: sleep is dark, planned meals grey, eaten meals green, the workout red and thicker.
  - A white dot marks now and moves with `clock`.
  - The centre shows the next item's time, its name and "in 50 minutes".
  - Tapping an arc scrolls to that item.
  - Build it with `react-native-svg` and Reanimated (both work in Expo Go).
- **Three numbers, each with a thin bar:** protein today (blue), workouts this week (red), weeks on plan (yellow).
- **Next action:** still exactly one, with the same actions as now (Start, Later, Skip; Ate it, ...). The primary
  button is white.
- **What I changed today:** section 2.4.
- **Rest of today:** time, item, and a status word in its plate colour (Eaten, Logged, Up next, After gym).
- **Tab bar:** Today, Week, Snap (a raised white camera button), Progress, Coach.

### Onboarding (no mockup; follow the system)

- **11 question screens become 8 (my call),** by merging three pairs of the current steps (`STEPS` in
  `src/domain/onboarding.ts`):
  1. `goal`;
  2. `about`;
  3. `activity` + `schedule`. Activity sets calories, so it stays;
  4. `experience` + `equipment`;
  5. `food`;
  6. `eating` + `staples`;
  7. `day`, prefilled from the defaults and confirmed with one "Looks right" tap;
  8. `health`.

  Each merged screen keeps every field of the steps it merges: name, cook time and budget included. Then
  permissions, then the reveal. Keep `stepProblem` validation, run per merged screen.
- **"What I know so far":** a strip pinned above the Next button that grows with each answer, for example "28, 75
  kg, lose fat, gym Mon Wed Fri at 6:30 pm". Tap it to expand.
- **One coach sentence per step**, reacting to the answer: "Three days is the sweet spot for your first 90 days."
  This is written copy, no AI.
- **Inputs:** big tiles with icons for goal, equipment and diet; steppers for numbers. No keyboard except for the
  name.

### Plan reveal (mockup: `Reveal`)

- **Content, top to bottom:**
  - the headline "Your first week is ready, Abdul";
  - three numbers: calories a day, protein a day, workouts a week;
  - a week grid with gym days marked A or B, and meals;
  - three first-person promises;
  - a preview of the first ping;
  - the "Start my week" button.
- **One orchestrated animation:** the numbers count up, the gym squares fill left to right, then the promises
  appear. Under 3 s, tap to skip, reduced motion respected.

### Workout view (mockup: `Workout`)

- **In Phase 2b, the workout detail screen takes the new look:**
  - Each move shows its demo: two photos from free-exercise-db (public domain, `github.com/yuhonas/free-exercise-db`)
    looping start to end. Compress them to WebP at about 25 KB each.
  - A muscle map: `react-native-body-highlighter`, or your own SVG. Check its licence and that it runs in Expo Go
    before adding it.
  - Sets, reps and kg in big numbers, plus the three form cues.
  - The agent's note on the weight:
    - Phase 2b, with no history yet: "First time: start light. If 10 reps feel easy, tell me and I'll add weight next
      time."
    - Phase 4: "Last time you did 22.5 kg for 12, 12 and 12, so I added 2.5 kg."
- **Phase 4:** the one-move-at-a-time gym mode in the mockup (big kg and reps, "Done set", Swap machine, Too
  heavy, Too easy) is built on this look.

### Week, Progress, Coach, Settings

- **Week:** seven day columns like the reveal's grid. Sessions the agent moved say so ("Moved from Wed").
- **Progress:**
  - a journey ring (day N of 90);
  - a "Log weight" stepper: a `weigh_ins` row feeds a 7-day-average trend line;
  - placeholders that say what will appear: "Your strength chart starts after your first logged workout."
- **Coach tab (until chat in Phase 5):**
  - "Everything I've changed".
  - "What I know about you": the onboarding facts, read-only in 2b (my call). Settings is read-only too
    (`app/settings.tsx:78-106`). Profile editing comes with Phase 7's Settings work.
  - No chat box until chat is real.
- **Settings:** remove Appearance (dark only). Keep the rest.

---

## 5. Already decided, not built yet (fold into this phase)

1. **First workout is always Full body A** on a mid-week signup. Today the rotation can start with B
   (`planner.firstWeek`).
2. **One Skip that moves two workouts gives one card.** Now one agent action (section 2.1).
3. **Whey becomes ON Gold Standard** instead of MuscleBlaze isolate.
   - It's a whey blend, so don't just relabel the `whey_isolate` key (`data/seed/foods.map.json:660-670`).
   - Add a curated food for Optimum Nutrition Gold Standard 100% Whey, Double Rich Chocolate. That flavour is my
     default: ask Abdul which one he buys.
   - Take its values from the Indian pack's label, cited like the other curated foods.
   - Point every recipe and protein add-on that used `whey_isolate` at it, then run `npm run data:build`.
4. **Prices and paywall in the docs** (`docs/20-engineering/analytics-paywall.md`, `docs/10-design/copy.md` §7):
   - India ₹299/month and ₹1,999/year; US $12.99/month and $69.99/year.
   - No "Maybe later": the 7-day trial is required.
5. **After a skipped workout, the "after gym" meal stays as planned.** Nothing to build.

## 6. What users care about, and where each lands

| Users care about                                       | Today   | Lands in                                      |
| ------------------------------------------------------ | ------- | --------------------------------------------- |
| Knowing what to do today                               | Built   | —                                             |
| Seeing how to do each move                             | Missing | 2b (photos), later video                      |
| Seeing what the coach changed and why, with undo       | Missing | 2b                                            |
| Logging food without typing                            | Missing | 2b with samples, Phase 5 real                 |
| Logging weight and seeing the trend                    | Missing | 2b                                            |
| Which plates to load or where to set the pin           | Missing | Phase 4 gym mode                              |
| Ticking off sets, rest timer                           | Missing | Phase 4                                       |
| "Short on time / training at home / sore" today        | Missing | Phase 4 (engine commands), Phase 5 (chat)     |
| What to order when eating out                          | Missing | Phase 5 (menu photo)                          |
| Calories that adjust when weight stalls                | Missing | Phase 7 weekly check-in                       |
| Grocery list                                           | Missing | Phase 7                                       |
| Streaks, PRs, share card                               | Missing | Phase 7                                       |
| Reminders at the right moment                          | Missing | Phase 4 pings                                 |
| Steps, sleep and weight from Apple Health/Google Fit   | Missing | v1.1                                          |

## 7. Done when

1. **Look:**
   - `theme.ts` holds the new tokens; Outfit and DM Sans are gone.
   - Big Shoulders Display and Atkinson Hyperlegible load in Expo Go on iPhone and Android.
   - No ALL-CAPS label style is left.
   - The copy test fails on "·", "→" and emoji.
   - A new contrast test covers the colour table's pairs.
2. **Screens:**
   - Today, the reveal and the workout view match the mockups.
   - Onboarding is 8 question screens with the "What I know so far" strip, and no field is lost.
   - Week, Progress, Coach and Settings follow section 4.
3. **Agent** (vitest on real SQLite):
   - Skip and missed-workout reshuffles each write exactly one action (two moves still make one action).
   - Undo runs the inverse commands and restores the plan. It refuses, applying nothing, when the engine rejects
     one.
   - Habit-only sentences carry no food or body numbers.
4. **Snap:**
   - Photo, then sample result, then Log: the planned meal is marked replaced and one agent action is written.
   - Dinner is rebalanced by the engine, counting the logged meal's real kcal, not 0.
   - It works in airplane mode, the "Sample answer" tag shows, and habit-only shows no numbers.
5. **Today** renders exactly one next action, the dial and the agent log (jest).
6. **Checks and release:**
   - `npm test`, `npm run typecheck`, `npm run lint` and `npx prettier --check .` pass.
   - An EAS update is published to channel `main`.
   - The app is checked on an iPhone: fonts, dial, Snap with the real camera, Undo.
7. **Docs:** `docs/10-design/*` describe the new system, and section 5's items are done.

## 8. Prompt to paste into Claude Code or Codex

```text
Goal: Build Phase 2b as specified in docs/30-build/phase-2b-redesign-and-agent.md: the dark redesign (Today with
the day dial, the 8-screen onboarding, the plan reveal, the workout view, Week, Progress, the Coach tab), the agent's
"What I changed" log with undo, Snap my plate with sample answers, and the five already-decided items in section 5.

Context: Read HANDOVER.md, AGENTS.md, then the Phase 2b doc. Mockups: docs/10-design/mockups/phase-2b/*.html (open
in a browser). The app runs fully on the phone: no backend, no AI. .env.example lists EXPO_PUBLIC_BACKEND and
EXPO_PUBLIC_AI_PROVIDER, but nothing reads them yet; section 3 adds the AI one. The engine
(packages/engine) already does reshuffles (workout/) and rebalancing (meal/rebalance.ts); the app's domain layer is
apps/mobile/src/domain, storage apps/mobile/src/db, state apps/mobile/src/state/AppState.tsx.

Constraints: Expo Go SDK 58 only (no native modules Expo Go lacks). No real AI calls and no API keys. Every number
comes from the engine or the bundle, never from AI or fixture text. Habit-only mode shows no food or body numbers.
All colours come from theme.ts. Follow the banned list in section 1. Keep every existing test green and add the
tests section 7 lists. Update docs/10-design/* in the same change. Read the "Known traps" in HANDOVER.md first.

Done when: every item in section 7 holds, with the command output pasted in your report.
```
