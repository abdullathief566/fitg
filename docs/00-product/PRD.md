# FitG — Product Requirements (PRD v1.1)

Owner: Abdul (Shaik Abdul Lathief) · v1.0 written 2026-10-26 · v1.1 refreshed 2026-10-27 with the build decisions
Research behind this doc: `Fitness-Agent-Research-2026-10-25.md` (kept outside the repo; ask the founder).

> This is the source of truth for **what** FitG does and **why**. The design docs (`docs/10-design/`) say how it looks and talks; the engineering docs (`docs/20-engineering/`) say how it's built; `docs/30-build/phases.md` says in what order. If a doc contradicts this one, this one wins and the other doc gets fixed.

---

## 0. The whole thing in one minute

- **Problem:** gym beginners don't know what to do at the gym, what to eat after, or how much. Tracking apps make them log everything by hand, so they quit. Most new gym members drop off within 3 months.
- **Product:** an app with an AI agent that plans your week (workouts + meals) and tells you the next step right before you need it. You don't log; you confirm.
- **First user:** gym beginners (0–6 months of lifting), 18–35, who want to lose fat or build muscle.
- **Promise:** never walk into the gym, or your kitchen, wondering what to do. We get you through your first 90 days.
- **v1:** setup → your plan → Today screen → 4 timed pings a day → gym mode on the lock screen → one-tap meal logging → daily rebalance + weekly check-in → grocery list → paywall.
- **Not in v1:** grocery ordering, calendar, Apple Watch app, health-data import, GLP-1 mode, friends.
- **Platforms:** iPhone and Android from one Expo codebase, built as a dev-build project from day one.
- **Build:** 8 phases (see `docs/30-build/phases.md`), about 6–8 weeks to a 20–30 person beta.

## 0.1 Decisions locked on 2026-10-27

| Decision | Choice |
|---|---|
| Name | **FitG** (working name; trademark search before launch; `fitg.app` to be bought) |
| Look | **Dark, data-first** (changed 28 Oct 2026 by Abdul, after the Warm Spotter build read as generic). True black, data colours from competition weight plates, white primary buttons, Big Shoulders Display + Atkinson Hyperlegible. Spec: `docs/30-build/phase-2b-redesign-and-agent.md` §1 |
| Coach persona | The coach speaks **as FitG**, in the first person. No mascot, no orb. Its presence is what it does: "What I changed" notes with the reason and an undo. |
| Build type | **Expo Go (SDK 58) until Phase 6** (changed 28 Oct 2026: there's no Xcode on Abdul's Mac, and the App Store's Expo Go only opens SDK 58). Dev builds arrive with Phase 6's native features. |
| Backend | **Supabase Edge Functions (Deno/TS) + Postgres + pg_cron.** No FastAPI, no Vercel. |
| AI | Anthropic Claude behind `AI_PROVIDER=mock\|anthropic`. Strong = `claude-opus-5-5`, fast = `claude-haiku-5-5`, vision = benchmark Haiku 5.5 vs Sonnet 5.5. Phases 1–4 run fully on mock. |
| RAG | None in v1 (catalog fits in a cached prompt; food lookup = aliases + trigram + full-text + ask). pgvector only in v1.1 if beta miss rate > 20%. |
| Protein target | **1.6 g/kg** (1.4 for "get fit"), not 2.0. 2.0 g/kg couldn't be reached from ordinary Indian home food in the reference simulation; research shows the muscle benefit levels off around 1.6 g/kg (Morton et al. 2018). Higher-protein recipes added (whey shake, soya chunks curry, eggs + toast). |
| Untapped meals | One tap confirms. If the user doesn't tap, FitG **assumes the plan was eaten for today's math** and asks once at the next ping. Never nags. |

---

## 1. The problem

- At the gym: "I spend more time deciding what to do at the gym than actually working out." Beginners wander, copy others, or skip the gym because they don't have a plan.
- At home: they don't know what to cook, what to eat after training, or how much protein they need.
- Tracking: every app (MyFitnessPal, Cal AI, MacroFactor) makes you log what already happened. Logging is tedious, so people stop. In a MyFitnessPal trial, 84% of people who stopped said it was tedious.
- Timing: the gym habit takes about 2–3 months to stick, and most new members quit before then.
- Nobody today pings you before your session with the exact workout, starts it when you arrive, tells you what to eat after the gym, or re-plans your week when you skip.

## 2. Who it's for

**Primary (v1):** gym beginners, 0–6 months of lifting, 18–35, phone in pocket, want to lose fat or build muscle. They have just started or are restarting. Many eat home food cooked by family, or eat at a mess or canteen. Abdul is user #1.

**Not for v1:** advanced lifters who already run their own programs, competitive athletes, under-18s, and people who need medical nutrition plans.

**Second audience (v2):** people on Ozempic-type drugs (GLP-1s) who need protein and strength training to keep their muscle. Same engine, different mode.

## 3. The promise and a day with it

**One line:** never walk into the gym, or your kitchen, wondering what to do.

- **9:30 PM, night before:** "Tomorrow: upper body at 6:30 PM. Take the chicken out of the freezer before bed."
- **6:15 PM:** "Gym in 15. Upper body, 5 exercises, about 60 min. Bench 3×8 at 30 kg, 2.5 kg more than Monday."
- **6:32 PM, you walk into the gym:** the workout appears on your lock screen (exercise, weight, reps, rest timer). Tap to finish a set. Nothing to type.
- **7:30 PM, you leave:** "Good session. Get about 30 g protein in the next 2 hours. Quickest from your kitchen: egg bhurji and 2 rotis."
- **8:35 PM:** "Dinner: chicken curry and rice, 25 min. Use 1 tsp oil, not 3." Tap "Cooked it" and it's logged with exact numbers.
- **Ate out at lunch?** Snap a photo and tonight's dinner shrinks to fit.
- **Skipped Tuesday?** It moves the session and tells you once.
- **Sunday:** quick check-in, next week's plan, and the grocery list.

## 4. How the app knows what you're doing

The AI never "watches" you. It always knows your plan, and these signals tell it what actually happened. (Engineering detail: `docs/20-engineering/signals-and-pings.md`.)

1. **What you tell it once (setup, v1).** Body, goal, gym days and time, where your gym is, what you eat, who cooks, and what's in your kitchen. That gives it your plan.
2. **The clock (v1).** Every plan item has a time. The app schedules its pings on the phone itself, so they fire on time even without internet. This needs only the notification permission.
3. **Location (optional, v1).** You pin your gym (and home) once on a map. The phone notices when you walk into the gym, and the workout appears on your lock screen. When you leave, you get the post-workout meal ping. It uses low-power zone detection (geofence, ~150 m), not constant GPS, and can fire a few minutes late. It needs "Always allow location". If you say no, the "Start" button on the pre-gym ping does the same job.
4. **Your taps (v1).** "Set done", "Ate it", "Ate something else", "Skip". Sets are pre-filled with the plan, so you only edit when you did something different; a meal is confirmed with one tap.
5. **Phone and watch health data (optional, v1.1).** Apple Health / Health Connect: workouts, steps, sleep, weight. A bad night's sleep means a lighter session. A big walking day means a bit more food.
6. **Later (v2).** Calendar (meeting on your gym slot → session moves), grocery orders (it knows what's in your kitchen), wearables (recovery).

**What it can't know, and what we do about it:**
- Whether you ate the planned meal → one tap. If you don't tap, it assumes you ate the plan for today's math and asks once at the next ping ("Did lunch happen?"). Never a separate ping, never a nag.
- What your family cooked tonight → Home Food mode asks "What's for dinner at home?" (pick from common dishes) and gives you portions.
- That you trained at a different gym → no zone there, so you tap Start.

## 5. Setup (onboarding)

Like Cal AI (body + goal → calories and macros), plus the parts Cal AI skips: your schedule, your gym, and your food life. One question per screen, about 3 minutes, with a progress bar.

1. **Goal:** lose fat / build muscle / both / get fit.
2. **About you:** sex, age, height, weight, optional goal weight.
3. **Day-to-day activity:** desk job / on your feet / very active.
4. **Gym schedule:** which days, what time, session length (45 / 60 / 75 min).
5. **Experience and injuries:** brand new / under 6 months / over 6 months; knees, back, shoulders.
6. **Equipment and your gym:** full gym / basic gym / home dumbbells; pin your gym on the map (or skip).
7. **Food:** veg / eggetarian / non-veg / vegan; Indian / Western / mixed; allergies; foods you hate.
8. **Eating mode:** I cook / family cooks / I eat out or at a mess / a mix.
9. **Your day:** wake time, sleep time, meal times, weekday cooking time (10 / 20 / 30+ min), budget.
10. **Kitchen staples:** a checklist (rice, atta, dal, eggs, paneer, chicken, oats, milk, curd, bread, peanut butter, whey…).
11. **Health check (safety):** pregnant? diabetes? on GLP-1 or weight-loss medication? history of an eating disorder? (See §9.)
12. **Permissions,** each with a one-line reason: notifications (needed), location (optional, for gym auto-start).
13. **Plan reveal (the wow moment):** your calories and protein, your week of workouts, tomorrow's meals, and a preview of the pings ("Tomorrow at 6:15 PM you'll get…").
14. **Paywall:** 7-day free trial (§6.10).

**How targets are calculated (code, not AI; exact formulas in `docs/20-engineering/engines.md` §1):**
- Calories: Mifflin-St Jeor BMR × activity factor. Fat loss −20%. Muscle +10% (+5% if BMI is 27 or more). Both −10% if BMI is 25 or more, else 0. Get fit 0.
- Protein: 1.6 g per kg of body weight (1.4 for "get fit"); goal weight is used if BMI is over 30.
- Fat: 27.5% of calories, at least 0.6 g/kg.
- Carbs: whatever is left (min 50 g).
- Floors: never below 1,200 kcal (women) / 1,500 kcal (men).

## 6. v1 features

### 6.1 Today screen
- One "Next up" card at the top, always showing a single next step.
- Below it, today's timeline: prep tasks, meals, and the workout, with times.
- Opens instantly and works offline (the plan is stored on the phone).

### 6.2 The pings

**Gym day, max 4:**
1. **Night before** (default 9:30 PM): tomorrow's workout in one line, tomorrow's meals, and prep tasks. Buttons: Got it · Change time.
2. **Pre-gym** (default 15 min before): the workout summary. Buttons: Start · Later (+30 min) · Skip today.
3. **After the gym:** fires when the workout ends or you leave the gym zone. If neither happens, it fires at the planned end time + 45 min. It gives your post-workout meal. Buttons: Ate it · Swap · Not now.
4. **Before dinner** (dinner time − your usual cooking time from setup − 10 min): the recipe, or portions in Home Food mode. Buttons: Start cooking · Swap · Eating out.

**Rest day:** the night-before and before-dinner pings only.

**Rules:**
- The lock-screen gym view makes no sound and doesn't count as a ping.
- Never more than 4 pings with sound a day. Silent system notices (trial reminder, check-in) don't count.
- Quiet hours follow your sleep time.
- No guilt-tripping, ever.
- The wording varies, but it's written within fixed templates; AI copy may overlay a template, never replace the numbers.
- If you keep acting late (for example, starting the gym 20+ minutes after the planned time three times in a row), the ping moves.

**Delivery:** scheduled locally on the phone for a rolling 3 days, and rescheduled whenever the plan changes or the app opens. The pre-gym ping uses iOS "time-sensitive" delivery (users can turn it off).

### 6.3 Gym mode

**Start:** arriving at your gym (if location is on) shows "Ready? Full body A. First up: leg press 3×10 at 40 kg" with a Start button; or the Start button on the pre-gym ping; or the big Start button in the app.

**Lock screen** (iOS Live Activity; Android ongoing notification): current exercise, "set 2 of 3", target weight × reps, rest-timer countdown. Buttons: Done set · Edit. Always dark, oversized.

**In the app:** exercise demo (image + 3 form cues); quick +/− for weight and reps; "Equipment busy?" → Swap with 2–3 alternatives for the same muscle; "Too heavy / too easy" feedback.

**Finish:** summary with personal records, comparison with last time, "next time: +2.5 kg on bench". Then the after-gym ping.

**Edge cases:** leaving without finishing saves a partial; gym mode auto-ends after 3 hours; training elsewhere → start manually.

### 6.4 Workout plan engine (code)
- Templates: full body A/B (2–3 days/week), upper/lower (4 days), machine-friendly and home-dumbbell variants.
- Double progression per exercise (rep range; all sets at top → smallest weight jump; two misses → hold or −10%).
- Injuries: tagged exercises are left out or replaced.
- Missed session: the week shifts; sessions are never stacked; the least important one is dropped if needed; the app says so once.
- Code sets sets/reps/weights. AI explains, swaps exercises, and adjusts when you say it felt too easy or too hard.

### 6.5 Food plan engine
- Each day: breakfast, lunch, a post-workout meal (gym days), dinner, optional snack; together they land within ±5% of the calorie target and reach at least 95% of the protein target.
- Recipe library: 60–100 simple curated recipes at launch, Indian plus simple Western, with ingredients in grams and household units (katori, roti, tsp oil), cooking time, cost tier, diet tags.
- AI picks and combines meals; code scales portions; every number comes from the food database.
- Planning rules: every day must be able to reach the protein target; pantry staples first; a recipe at most once a day; deliberate repetition across days (2–3 breakfasts a week; cook once, eat twice); oil/ghee always written out.
- Eating modes: I cook (recipes with steps) · Family cooks / Home Food (pick dish → portions + protein add-on) · Eat out / mess (type or photo the options → best pick + portion).
- Swap any meal with one tap: 3 alternatives with similar macros.

### 6.6 Logging (only when something's different)
- Workouts: sets pre-filled from the plan; tap Done; edit only if different.
- Meals: Ate it · Ate half · Ate something else (pick from the list / photo / type) · Skipped. Voice logging is v2.
- Off-plan meals: AI identifies foods and portions; numbers come from the food database, not the AI; if unsure it asks one quick question ("How much oil? A little / normal / a lot"). Target under 15 seconds.
- Weight: at the weekly check-in (daily optional).

### 6.7 Rebalance and weekly check-in
- Daily rebalance after an off-plan or skipped meal: remaining meals adjust (portions, protein add-on); the next ping says what changed in one line.
- Weekly check-in (default Sunday evening): weigh-in; three taps (energy, hunger, soreness); calories adjust by rule (fat loss: losing >1%/week → +150 kcal; no change in 2 weeks → −150); workouts progress; next week's plan and grocery list are generated.

### 6.8 Progress and the 90-day journey
- Journey bar "Day 23 of 90"; milestones at week 2, week 6 (where many quit) and day 90.
- Streak counts weeks with 2+ workouts, not days; one free "life happens" pass a month.
- Comeback: after a missed session, the next one opens with "Welcome back" and a small reward. No streak-shaming.
- Wins: personal records, "stronger than week 1".
- Weekly share card (Instagram-story size).

### 6.9 Ask the coach
- A chat for "can I swap rice for roti?" or "my knee hurts on squats". It can change the plan after you confirm. Not the main screen.

### 6.10 Paywall and pricing
- Shown right after the plan reveal.
- 7-day free trial, then **$9.99/month or $59.99/year**; India test ₹299/month or ₹1,999/year. Hypothesis to test.
- Honest billing: trial end date in words; reminder 2 days before; cancel in two taps; visible "Cancel subscription" in Settings.

### 6.11 Grocery list
- Built weekly from the plan, grouped by type, minus staples. Ticked items count as "in your kitchen" for the week.

## 7. Not in v1 (and when)
- Apple Health / Health Connect import → v1.1 · Home-screen widget → v1.1 · Gym buddy → v1.1
- Grocery ordering (Swiggy Instamart IN, Instacart US) → v2 · Calendar-aware rescheduling → v2 · GLP-1 mode → v2 · Voice ("what's next?" and voice meal logging) → v2 · Full pantry inventory → v2
- Apple Watch app, automatic rep counting → later

## 8. Product laws (every feature, every screen, every prompt must obey)
1. One next step at a time.
2. Confirm, don't log.
3. Max 4 sounding pings a day, and every ping has a button that does something.
4. **Code does the numbers; AI does the choices and the words. The AI never invents a number.**
5. No guilt, ever. Celebrate comebacks; never shame a broken streak.
6. Everything works without location or health permissions.
7. It talks like a friend (short, warm, a little funny), not like a dashboard.
8. Indian home food is first-class, not an afterthought.

## 9. Safety, privacy, trust
- 18+ only in v1 (checked from the birth year asked in setup).
- Health check: pregnancy, diabetes or GLP-1/weight-loss medication → no calorie deficit + "check with your doctor". Eating-disorder history → habit-only mode (no calorie numbers shown, gentle pointer to professional support).
- Limits: calorie floors 1,200 / 1,500 kcal; weight loss at most 1% of body weight a week.
- Claims: not medical advice; never "cure", "treat", "prevent".
- Data: never sold, no ads; delete account deletes data; Apple HealthKit rules, India DPDP, GDPR basics; food photos kept 7 days; AI keys only on the server.

## 10. Tech approach (summary; detail in `docs/20-engineering/`)
- Expo (React Native + TypeScript) monorepo, one codebase for iPhone + Android; **dev build from Phase 2**.
- Native pieces: iOS Live Activity (WidgetKit + App Intents via `expo-apple-targets` + a local Expo module); Android ongoing notification via `@notifee/react-native`; geofence via `expo-location` + `expo-task-manager`. All optional for the user.
- Pings: local notifications scheduled on the phone (rolling 3 days), rescheduled on every plan change; server only re-plans.
- Backend: Supabase (Postgres + RLS + auth + storage) with Edge Functions (Deno/TS) and pg_cron. One pure-TypeScript engine package shared by app and server.
- AI (server-side only): Claude strong/fast/vision tiers behind a provider interface with a full mock mode; structured outputs validated by code; every AI output contains IDs and prose only.
- Food data: USDA FoodData Central + curated Indian staples (IFCT licensing caveat) + Open Food Facts at runtime (v1.1). Exercises: free-exercise-db (public domain).
- Payments RevenueCat · analytics PostHog · crashes Sentry.
- Cost target: AI ≤ $0.60 per active user per month (≈ 12% of net revenue on the annual plan). Updated 2026-10-27 from $0.30: Opus 5.5 always thinks and thinking is billed as output; honest estimate $0.45–1.05 and the levers are in `docs/20-engineering/ai-orchestration.md` §9.

## 11. How we'll know it works

**Beta (20–30 users, 4 weeks):** ≥40% of pings get a button tap within 30 min · ≥70% of planned workouts done in weeks 1–4 · ≥60% of meal logs are one-tap · ≤15% turn notifications off by day 30 · ≥40% "very disappointed" without it.

**After launch:** trial→paid ≥38% · day-30 retention ≥25% · still training twice a week at day 90: beat 20%.

## 12. Build phases
See `docs/30-build/phases.md` (8 phases). In parallel, the founder: 14-day self-test; collect 60–100 recipes; approve exercise set + form cues; sketch nothing (design docs are done).

## 13. Risks and mitigations
- Big apps copy it (12–18 month window) → move fast; own beginners, Indian food, timing.
- Notification fatigue → 4/day cap, buttons on every ping, timing that learns.
- "Won't pay for a workout list" → plan reveal + week 1 must feel like a trainer.
- Location refused → fully works on time + taps.
- Wrong food estimates (oil/ghee) → planned meals use exact recipes; off-plan logs get one oil question.
- Safety (eating disorders, medication) → §9.
- Android OEM background killing (Indian market) → exact alarms, guidance screen, server silent push as second trigger.
- One founder → v1 scope is fixed; everything else waits.

## 14. Founder decisions
- Name: **FitG** (done). Buy `fitg.app`; trademark search before launch.
- Price: default in §6.10 unless changed.
- Exercise demos: free library images (faster) vs filming at the gym (authentic; doubles as reels) — **open**.
- Beta group: first 20–30 (gym friends in Hyderabad + waitlist) — **open**.
