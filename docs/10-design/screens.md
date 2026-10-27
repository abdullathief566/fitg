# FitG screens, flows, wireframes

Navigation: **4 tabs — Today · Week · Progress · Coach.** Settings opens from the avatar on Today. **Gym mode** and **Kitchen mode** are full-screen modal stacks with no tab bar. Onboarding is a stack with a thin coral progress line.

Routes (expo-router):
```
app/(onboarding)/welcome.tsx, [step].tsx (1–11), permissions.tsx, reveal.tsx
app/paywall.tsx
app/(tabs)/today.tsx | week.tsx | progress.tsx | coach.tsx
app/gym/[sessionId].tsx          (mode = gym, forced dark)
app/gym/summary/[sessionId].tsx
app/kitchen/[mealId].tsx         (mode = kitchen)
app/kitchen/home-food/[mealId].tsx
app/log/offplan.tsx
app/checkin.tsx
app/grocery.tsx
app/settings/*.tsx
```

## 1. Screen inventory

| # | Screen | Mode | Purpose / key elements | Primary action | Empty / loading / error |
|---|---|---|---|---|---|
| O0 | Welcome | normal | Headline "Never walk into the gym wondering what to do." Sub "You confirm. You don't log." A demo NextUp card cycling 3 examples. | "Build my plan (3 min)" | "I have an account" link |
| O1–O11 | Onboarding steps (PRD §5: goal, about you, activity, gym schedule, experience/injuries, equipment + pin gym, food, eating mode, your day, staples, health check) | normal | One question per screen, chips first; numeric keypad sheet for height/weight (port Sumi `Keypad`); day/time chips; map pin with a "Skip" of equal weight; staples as a 2-column checklist with Indian items first; health check in plain words with a "why we ask" link. | "Next" (bottom, full width) | Inline validation; skip allowed on map, goal weight, budget |
| O12 | Permissions & privacy | normal | Privacy consent (checkbox + Privacy/Terms links, copy in `copy.md` §6), then two `PermissionExplainer` cards: Notifications (needed) and Location "Always" (optional). Each: what, when, why, one toggle. | "Allow notifications" | Denied: "No problem, pings off. Turn on in Settings any time." |
| O13 | **Plan reveal** | normal | Wireframe below. Counts up calories/protein, builds the week strip, shows tomorrow's meals, previews the first ping. | "Show me the pings" → paywall | Loading 1.2 s "Building your week…" with live steps; error → cached template plan + "I'll refine this tonight." |
| O14 | **Paywall** | normal | Trial end date in words, prices, "remind 2 days before", "cancel in two taps", restore. | "Start 7 days free" | "Payment didn't go through. Your plan is safe; try again." |
| T1 | **Today** | normal | One `NextUpCard`; timeline list; `ProteinBar` footer; journey chip "Day 23 of 90". | Contextual (Start / Cooked it / Got it) | Rest day, all done: "Rest day. Nothing to do but eat well." Loading: cached plan on first frame. Offline: silent, pings already scheduled. |
| T2 | Week | normal | 7-day strip; each day: workout chip + 3–4 meal chips; "Missed → moved" labels; grocery list entry. | Tap day → detail | "Sunday's check-in builds next week." |
| T3 | Workout detail | normal | Exercise list with sets×reps×kg, demo thumbnails, "why this" line, Swap per exercise. | "Start workout" (72 pt) | Partial saved banner: "Saved as partial — 3 of 5 done." |
| G1 | **Gym mode (in-app)** | gym | Wireframe below. One exercise, big numbers, Done set, rest ring, swap / too heavy / too easy. | "Done set" | Equipment busy → `SwapSheet`; 3 h auto-end: "Ended for you; saved as partial." |
| G2 | Lock screen (Live Activity / Android ongoing) | gym | Wireframe below. | "Done set" | Unsupported OS (iOS < 16.2 / Android < 8): pinned in-app view + timer notification |
| G3 | Workout summary | normal | Sets done, PR badges, "vs last time", "Next time: +2.5 kg bench", share-card button. | "Done" → after-gym ping surface | No prior data: "First one in the books. Everything from here is a PR." |
| M1 | Meal / recipe | kitchen | Wireframe below. Ingredients in household units + grams, `RecipeStep` list with timers, oil callout. | "Next step" / "Cooked it" | Missing staple: "Out of curd? Swap for 2 boiled eggs." |
| M2 | Home-Food picker | kitchen | "What's for dinner at home?" grid of ~50 dishes (search), then `PortionPicker` + protein add-on. | "Ate it" | "Type it; I'll do portions." |
| M3 | Off-plan meal log | normal | Three tabs: **Pick** (search the on-device list — recipes, home dishes, recent foods; works offline, numbers instantly) · **Photo** · **Type**. Result card with foods + portions; one clarifying question ("How much oil? A little / normal / a lot"). Voice logging is v2. | "Log it" | Vision unsure: "Couldn't tell. Pick the closest:". Offline photo/type: queued + "Logged. I'll do the numbers when you're online." |
| S1 | Swap sheet (meal / exercise) | any | 3 alternatives (same muscle, or similar macros) with a reason line. | Tap alternative | "Nothing close in your kitchen; nearest is X (+80 kcal)." |
| W1 | **Weekly check-in** | normal | Wireframe below. Weigh-in, three taps (energy / hunger / soreness), what changes, next week + grocery. | "Build next week" | Skipped: quiet "Check-in waiting" chip on Today, no nag |
| P1 | Progress / 90-day | normal | `JourneyBar`, `StreakWeeks`, wins list, strength sparklines (3 lifts), share card. | "Share this week" | Week 1: "Your week-1 numbers become the thing you beat." |
| P2 | Share card preview | normal | 1080×1920 renderer (react-native-view-shot). | "Share" | — |
| K1 | Grocery list | normal | Grouped by type, minus staples, checkboxes; ticked = "in kitchen". | Tick | "Nothing to buy. Your staples cover the week." |
| C1 | Ask the coach | normal | Thread; inline `PlanChangeCard` (preview → confirm). | Send | Offline: "I'm offline; plan still works." |
| X1 | Settings | normal | Profile · Plan (goal, gym days) · Pings (times, time-sensitive toggle, quiet hours) · Permissions (status + Fix) · Units (kg/lb, household units) · Appearance (system/light/dark, "Gym always dark") · Subscription (**visible "Cancel subscription"**) · Privacy (export, delete account) | — | Permission off → status row with "Fix" |
| N1–N4 | The four pings | lock | Copy, buttons and levels in `copy.md` §3 | | |

## 2. Flows

- Welcome → O1…O11 → O12 → O13 reveal → O14 paywall → Today.
- Pre-gym ping **Start** → G1 (G2 starts automatically). Geofence enter → silent "Ready?" notification on the lock screen → tap Start → G1 (+ G2).
- G1 finish → G3 → after-gym ping surface (Today's NextUp becomes the post-workout meal).
- Before-dinner ping **Start cooking** → M1 kitchen mode. **Eating out** → M3. Family cooks → M2.
- Sunday → W1 → T2 + K1.
- Every ping action also writes an event and triggers a reschedule (engineering: `signals-and-pings.md`).

## 3. Wireframes

### Today (normal)
```
┌────────────────────────────────────┐
│ Tue 27 Oct              Day 23/90 ◯│
│ ● Evening, Abdul. Today's sorted.  │  bodyL coach line, PulseDot
│ ┌────────────────────────────────┐ │
│ │ ● NEXT UP · 6:30 PM            │ │  micro; coral dot breathes
│ │ Upper body                     │ │  displayL
│ │ 5 exercises · about 60 min     │ │  body, secondary
│ │ Bench 3×8 at 30 kg             │ │  numberM
│ │ 2.5 kg more than Monday ↑      │ │  caption, win colour
│ │ ┌───────────┐ ┌───────┐ ┌────┐ │ │
│ │ │  Start    │ │ Later │ │Skip│ │ │  56 pt row
│ │ └───────────┘ └───────┘ └────┘ │ │
│ └────────────────────────────────┘ │
│ TODAY                              │  micro
│ ✓ 8:00  Oats + curd        done    │  56 pt rows
│ ✓ 1:00  Dal, rice, sabzi   done    │
│ ● 6:30  Upper body         ← now   │
│ ○ 8:00  After gym: egg bhurji      │
│ ○ 8:45  Dinner: chicken curry      │
│ ┌────────────────────────────────┐ │
│ │ Protein 64 / 120 g  ▓▓▓▓▓░░░░  │ │  ProteinBar: "56 g to go, dinner covers 40"
│ └────────────────────────────────┘ │
│  Today   Week   Progress   Coach   │
└────────────────────────────────────┘
```

### Gym mode (in-app; forced dark; 24 px margins)
```
┌────────────────────────────────────┐
│ Upper body · 3 of 5 · 22:14     ✕  │  caption ×1.25
│                                    │
│ BENCH PRESS                     ⓘ  │  displayM (ⓘ → demo + 3 cues sheet)
│ SET 2 OF 3                         │  micro
│                                    │
│      30 kg          ×       8      │  numberHero
│   [ − ]  [ + ]           [ − ][ + ]│  56 pt, selection haptic
│                                    │
│ ┌────────────────────────────────┐ │
│ │          DONE SET  ✓           │ │  72 pt, coral, dark text
│ └────────────────────────────────┘ │
│  Swap     Too heavy     Too easy   │  48 pt text buttons
│                                    │
│ ● 30×8   ◉ now   ○ set 3           │  set dots
│ Next: Incline DB press 3×10 · 12 kg│  caption
└────────────────────────────────────┘
Resting: the numberHero area becomes the RestTimer ring "1:12" (rest colour);
label "Next: set 3 · 30 kg × 8"; the big button reads "Start set 3" (ends rest early);
"+30 s" text button. Screen edges glow coral in the last 5 s (ported ScreenEdgeGlow).
```

### Lock screen — iOS Live Activity + Dynamic Island + Android ongoing notification
```
iOS lock screen banner (activityBackgroundTint #15110E @ 0.9)
┌────────────────────────────────────┐
│ ◐ Upper body               3 of 5  │  caption, secondary
│ Bench press · set 2 of 3           │  17 semibold (SF Pro Rounded)
│ 30 kg × 8                   ◔ 1:12 │  28 bold rounded; timer = monospaced digits
│ ┌──────────────┐  ┌───────┐        │
│ │  Done set ✓  │  │ Edit  │        │  App Intent buttons (iOS 17+), 44 pt
│ └──────────────┘  └───────┘        │
└────────────────────────────────────┘
Dynamic Island compact:  [ ◐ S2 ]  …  [ 1:12 ]   (leading: set index · trailing: rest timer or "30×8")
Minimal: ◔ ring only.   Expanded: same as the banner.
Gym arrival (geofence enter, before Start) is NOT a Live Activity — iOS can't start one from the background.
It is a silent notification on the lock screen: "Ready? Upper body. First up: chest press 3×10 at 40 kg." + [Start].

Android ongoing notification (foreground service via notifee):
┌────────────────────────────────────┐
│ ◐ Bench press · set 2 of 3         │
│ 30 kg × 8 · rest 1:12 (chronometer)│
│ [ DONE SET ]   [ EDIT ]   [ END ]  │
└────────────────────────────────────┘
```
Payload contract (shared by both platforms): `{ sessionId, sessionName, exerciseName, exerciseIdx, setIdx, setTotal, kg, reps, restEndsAt?, phase: 'lift'|'rest'|'done' }`. Native requirements and background behaviour: `docs/20-engineering/signals-and-pings.md` §5.

### Meal / kitchen mode (big text, hands busy)
```
┌────────────────────────────────────┐
│ ✕                      Chicken curry│
│ 25 min · 540 kcal · 42 g protein   │  caption ×1.25
│ ┌────────────────────────────────┐ │
│ │ STEP 2 OF 6              ⏱ 8:00│ │  micro + optional timer
│ │ Add 1 tsp oil. Not 3. We see   │ │  bodyXL 20/28
│ │ you.                           │ │
│ └────────────────────────────────┘ │
│ You need: 150 g chicken (1 katori),│  caption list, household + grams
│ 1 tsp oil, 1 onion, 1 katori rice  │
│                                    │
│ ┌──────────┐  ┌──────────────────┐ │
│ │  ◀ Back  │  │   Next step  ▶   │ │  64 pt; Next = coral
│ └──────────┘  └──────────────────┘ │
│ Swap this meal · Eating out instead│  48 pt text buttons
└────────────────────────────────────┘
Last step → "Cooked it" (full width). Home-Food mode replaces steps with
PortionPicker: "2 rotis · 1 katori dal · 1 katori sabzi" + "Add 2 boiled eggs".
```

### Plan reveal
```
┌────────────────────────────────────┐
│            ● building…             │  PulseDot thinking; 3 live steps over 1.2 s
│ Here's your week, Abdul.           │  displayXL
│                                    │
│   1,850 kcal      120 g protein    │  numberL, RollingNumber count-up
│   a day           about 1.6 g/kg   │  caption
│                                    │
│ MON  TUE  WED  THU  FRI  SAT  SUN  │
│ Full A —  Full B —  Full A —   —   │  chips slide in, 50 ms stagger
│                                    │
│ TOMORROW                           │
│ 8:00  Oats + curd                  │
│ 1:00  Rajma, rice                  │
│ 8:45  Egg bhurji + 2 roti          │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ 6:15 PM tomorrow you'll get:   │ │  fake-notification preview card
│ │ "Gym in 15. Full body A, 5 moves│ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │        Show me the pings       │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```
(The numbers shown are the engine's golden case T1: 75 kg male, 175 cm, 28, desk job, fat loss, 3 gym days → 1,850 kcal / 120 g.)

### Weekly check-in
```
┌────────────────────────────────────┐
│ Week 4 check-in                    │
│ 3 of 3 workouts · 5 protein days   │  win-colour summary line
│ Weight today                       │
│        [ 78.4 ] kg      (last 78.9)│  keypad sheet, RollingNumber
│ Energy   😴 Low   ● Okay   ⚡ High │  3 chip rows, 56 pt
│ Hunger   Fine   ● A bit   Starving │
│ Soreness None   ● Some    A lot    │
│ ┌────────────────────────────────┐ │
│ │ What changes: calories stay.   │ │  rule result, one line each
│ │ Bench +2.5 kg. Rows +2.5 kg.   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │         Build next week        │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
→ streak-week fills (motion.md #6), next-week strip, grocery list CTA.
```

## 4. Context rules

| Context | Rules |
|---|---|
| Gym | one-handed; sweaty; 2-second glances; `gymType` ×1.25; tap ≥ 56 pt, primary 72 pt; forced dark; primary action at thumb height; no gestures without a button |
| Kitchen | hands busy; `bodyXL` steps; Next ≥ 64 pt; timers inline; screen stays awake (`expo-keep-awake`) |
| Lock screen | glanceable; ≤ 3 lines; one number big; buttons are system 44 pt |
| Onboarding | one question per screen; progress line; Skip equal weight where allowed; ends in the reveal, then the paywall |

## 5. Habit-only mode (users who report an eating-disorder history)

`targets.displayMode = 'habit_only'` hides every **food and body number**; training numbers (kg lifted, reps, sets, minutes) stay. Per screen:

| Screen | In habit-only mode |
|---|---|
| O13 Plan reveal | No kcal/protein count-up. Headline "Here's your week." + the week strip + tomorrow's meals in household portions ("2 rotis · 1 katori dal"). |
| T1 Today | `ProteinBar` is replaced by **protein portions**: dots for today's protein-rich foods ("● ● ● ○ — 3 of 4 protein foods today"). Meal rows show names and portions only. |
| M1 Kitchen | Header shows the meal name and cooking time only (no kcal / g protein). Ingredients keep household units; grams hidden. |
| M2 Home Food, M3 Off-plan | Portions in household words; no nutrition totals. |
| W1 Check-in | Weigh-in is **off by default** (can be turned on in Settings); the summary shows workouts and "protein-food days", never weight or calories; no calorie adjustment line. |
| P1 Progress | Workouts, streak-weeks and strength only; no weight chart. |
| Pings / coach | Copy never contains food or body numbers (validator: `allowed = []` for food/body prose). |
| Settings | Shows that habit-only mode is on, with a gentle link to professional support resources. |
