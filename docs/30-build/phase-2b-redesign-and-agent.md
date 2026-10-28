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

Add a unit test over `src/copy/**` that fails on "·", "→" and emoji, next to the existing banned-words test.

### Files

- `apps/mobile/src/ui/theme.ts`: new tokens. It stays the only place hex values live; ESLint enforces that.
- `apps/mobile/app/_layout.tsx`: font loading.
- Every component in `apps/mobile/src/ui/`.
- `apps/mobile/test-node/design-checks.test.ts`: contrast pairs.
- `docs/10-design/tokens.md`, `screens.md`, `components.md`, `copy.md`. Docs are the source of truth (AGENTS.md),
  so update them in the same change.

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

One user action gives **one** agent action, however many rows it changed. That settles Abdul's earlier decision
"one Skip that moves two workouts shows one card": "Moved Full body B to Thursday and Full body A to Saturday."

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
  facts: Record<string, string | number>; // names, dates, numbers from the engine, e.g. { session: 'Full body B', toDate, toTime }
  before: PlanRowSnapshot[];              // the plan rows this action changed, as they were (for undo)
  after: { id: string; updated_at: Instant }[]; // the same rows right after (to detect later edits)
  undo: 'restore' | 'change_day' | 'none';
  status: 'active' | 'undone';
  seen: boolean;
};
```

- **Device table:** `agent_actions`. Add it to `DEVICE_TABLES` with a migration, and add store functions next to
  the others in `src/db/store.ts`.
- **Phase 3:** add the same table to `schema.sql` and to sync, so the coach in Phase 5 can read the history as
  context.

### 2.3 Writing and undoing

- **Writing:**
  - `backend.runCommand` and the missed-workout loop in `backend.loadSnapshot` compare the week before and after a
    `SkipSession`. Moved sessions become one `session_moved` action; a dropped session becomes `session_dropped`.
  - Snap my plate writes `meals_rebalanced` (section 3).
- **Undo:** add `backend.undoAgentAction(id)`. In one transaction:
  1. If any row in `after` has a newer `updated_at`, refuse: "Can't undo: your plan changed since."
  2. Otherwise restore the `before` rows, mark the action `undone`, and queue an outbox command so Phase 3 can
     replay it on the server.
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
4. **Show the result.** A sample provider picks one of the sample plates in `fixtures/ai/offplan_parse/`.
   - Map each item to a `home_dishes` (or recipe) id in the bundle, so names and nutrition come from the bundle,
     never from the fixture text.
   - Each item shows its household portion (katori, roti, cup) with a stepper, and its kcal and protein.
   - If a dish is cooked with oil, ask one question: "How oily was it? Light / Normal / Very oily" (+0, +1 or +2 tsp
     at 4.5 g of oil each).
   - A small "Sample answer" tag sits on the photo until real AI is switched on.
5. **Preview the change.** Run the engine's `rebalanceDay` (`packages/engine/src/meal/rebalance.ts`) as a dry run on
   the rest of the day. Show one sentence: "When you log this, I'll make dinner lighter: egg bhurji with 1 roti
   instead of 2. You'll still reach 120 g protein."
6. **"Log lunch".**
   - Mark the planned item `replaced` (`SetMealStatus`) and save the food log (`outbox_logs` already exists).
   - Apply the rebalance and write one `meals_rebalanced` agent action.
   - Confirm with the toast "Logged lunch".
7. **Privacy.** In sample mode the photo never leaves the phone. Delete the temporary file after logging.

- **Habit-only:** no kcal or protein anywhere in the flow; portions only.
- **Real AI later:**
  - Set `EXPO_PUBLIC_AI_PROVIDER=server`. Phase 3 adds Supabase; Phase 5 adds the `offplan_parse` edge function
    (Haiku vision, about $0.0004 a photo).
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

- **11 question screens become 7:**
  1. Goal.
  2. Body: sex, age, height, weight.
  3. Training week: days, start time, session length.
  4. Experience: level, injuries, equipment, gym pin.
  5. Food: diet, cuisine, who cooks, staples.
  6. Your day: wake, meals, sleep. Prefilled from the defaults, confirmed with one "Looks right" tap.
  7. Health check.

  Then permissions, then the reveal. Keep `stepProblem` validation, regrouped per screen.
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
  - "What I know about you": the onboarding facts; editing opens Settings.
  - No chat box until chat is real.
- **Settings:** remove Appearance (dark only). Keep the rest.

---

## 5. Already decided, not built yet (fold into this phase)

1. **First workout is always Full body A** on a mid-week signup. Today the rotation can start with B
   (`planner.firstWeek`).
2. **One Skip that moves two workouts gives one card.** Now one agent action (section 2.1).
3. **Whey uses ON Gold Standard label values** instead of MuscleBlaze isolate. Use the values on the current pack
   label, cite it in the data pipeline the same way as the other curated foods, then run `npm run data:build`.
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
   - The contrast pairs in `design-checks.test.ts` are updated.
2. **Screens:**
   - Today, the reveal and the workout view match the mockups.
   - Onboarding is 7 question screens with the "What I know so far" strip.
   - Week, Progress, Coach and Settings follow section 4.
3. **Agent** (vitest on real SQLite):
   - Skip and missed-workout reshuffles each write exactly one action (two moves still make one action).
   - Undo restores the plan, and refuses after a later change.
   - Habit-only sentences carry no food or body numbers.
4. **Snap:**
   - Photo, then sample result, then Log: the planned meal is marked replaced, dinner is rebalanced by the engine,
     and one agent action is written.
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
the day dial, the 7-screen onboarding, the plan reveal, the workout view, Week, Progress, the Coach tab), the agent's
"What I changed" log with undo, Snap my plate with sample answers, and the five already-decided items in section 5.

Context: Read HANDOVER.md, AGENTS.md, then the Phase 2b doc. Mockups: docs/10-design/mockups/phase-2b/*.html (open
in a browser). The app runs fully on the phone: EXPO_PUBLIC_BACKEND=local, EXPO_PUBLIC_AI_PROVIDER=mock. The engine
(packages/engine) already does reshuffles (workout/) and rebalancing (meal/rebalance.ts); the app's domain layer is
apps/mobile/src/domain, storage apps/mobile/src/db, state apps/mobile/src/state/AppState.tsx.

Constraints: Expo Go SDK 58 only (no native modules Expo Go lacks). No real AI calls and no API keys. Every number
comes from the engine or the bundle, never from AI or fixture text. Habit-only mode shows no food or body numbers.
All colours come from theme.ts. Follow the banned list in section 1. Keep every existing test green and add the
tests section 7 lists. Update docs/10-design/* in the same change. Read the "Known traps" in HANDOVER.md first.

Done when: every item in section 7 holds, with the command output pasted in your report.
```
