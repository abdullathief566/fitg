# FitG voice and UX copy

The coach speaks **as FitG**. These rules apply to every string: UI copy, ping templates, and every AI prompt that writes words (the prompts in `docs/20-engineering/ai-orchestration.md` §3 restate §1 and quote §8a verbatim).

## 1. The coach in five rules

1. **One sentence, then the button.** The next step first; reasons only if asked.
2. **Numbers from code, words from us.** Every number shown is a database or rule number. The coach never rounds creatively and never invents one.
3. **Friend, not dashboard.** Say "you", "we", "tonight". Never "Your daily nutritional intake summary".
4. **Funny at the edges, never at the user.** Jokes about oil, the chicken in the freezer, leg day. Never about weight, skips, bodies, or willpower.
5. **Comebacks, not consequences.** A missed thing is a schedule change, stated once, then gone.

| Do | Don't |
|---|---|
| "Gym in 15. Upper body, 5 moves, about 60 min." | "Reminder: scheduled workout session upcoming." |
| "Use 1 tsp oil, not 3. We see you." | "Limit fat intake to stay within your macros." |
| "Tuesday moved to Thursday. That's it." | "You missed your workout. Don't break your streak!" |
| "First one in the books." | "Great job!!! 🔥🔥🔥" |
| "Out of curd? 2 boiled eggs does the same job." | "Error: ingredient unavailable." |

## 2. Phrases people actually use (from the research — reuse them)

"tell me what to do" · "no idea what to do" · "mental drain" · "random stuff and hope it counts" · "can't be bothered to track" · "one dosa with a spoon of ghee" · "how much protein I really need" · "I didn't have to think today".

## 3. The four pings

The templates live in **`packages/engine/src/pings/copy-bank.ts`** (the engine builds pings, so it owns their copy; `apps/mobile/src/copy/` holds UI strings only). Shape: `CopyBank` in `docs/20-engineering/types.md` §7 — per ping type, per day type (`gym`/`rest`), per variant (`standard`/`late`/`comeback`/`ask`), a list of `{ title, body, short }`. **At least 5 wordings per ping type** for `standard` (the canonical first wording is below; Codex writes the others in the same voice and Abdul approves them); at least 2 for the other variants. AI copy may replace the *wording* nightly, never the numbers.

| Ping | Gym day | Rest day | Late variant | Missed → comeback |
|---|---|---|---|---|
| **Night before** · 21:30 · iOS `active` · Android `pings` | **"Tomorrow: {session} at {time}"** / "{exerciseList}. {prepTask}" · short: "Tomorrow: {session} at {time}." · [Got it] [Change time] | **"Rest day tomorrow"** / "{breakfast} at {breakfastTime}. {lunch} for lunch. Nothing else to think about." · [Got it] | — | **"Tomorrow's your comeback: {session} at {time}"** / "Same weights as last time. No catching up to do." · [Got it] [Change time] |
| **Pre-gym** · start − 15 min · iOS `timeSensitive` (user toggle) · Android `pings_high` | **"Gym in 15. {session}."** / "{n} moves, about {min} min. {firstLift} {sets}×{reps} at {kg} kg{deltaClause}." · short: "Gym in 15: {session}." · [Start] [Later +30] [Skip today] | — | first ping after a timing shift: **"Gym in 15."** / "Moved this to {newTime} since that's when you actually go." | **"Welcome back. {session}, {n} moves."** / "Small session, same weights. Just show up." · [Start] [Later +30] [Skip today] |
| **After gym** · on finish / zone exit / planned end + 45 · `active` · `pings` | **"Good session. {protein} g protein in the next 2 hours."** / "Quickest from your kitchen: {meal}, {mealMin} min." · short: "{protein} g protein soon: {meal}." · [Ate it] [Swap] [Not now] | — | fallback at +45: **"Done for today? {protein} g protein when you can."** · [Ate it] [Swap] [Still at the gym] | **"That's the comeback."** / "{protein} g protein: {meal}." |
| **Before dinner** · dinner − your usual cooking time − 10 · `active` · `pings` | **"Dinner: {meal}, {mealMin} min."** / "{oil} tsp oil, not 3. {carbPortion}." · short: "Dinner: {meal}." · [Start cooking] [Swap] [Eating out] | same | first ping after a timing shift: **"Late dinner's fine."** / "{meal}, {mealMin} min, or {quickMeal} in {quickMin}." | after an off-plan lunch: **"Dinner's a bit smaller tonight."** / "{dinnerPortions}. Lunch is covered." |

**Placeholders** (all filled by code):
| Placeholder | Value |
|---|---|
| `{session}` | session display name ("Full body A", "Upper body") |
| `{time}`, `{breakfastTime}`, `{newTime}` | local time, 12-hour ("6:30 PM") |
| `{exerciseList}` | first 4 exercise names, comma-separated |
| `{prepTask}` | the prep task text for tomorrow, or empty |
| `{n}` | number of exercises in the session |
| `{min}` | planned session length in minutes (45 / 60 / 75) |
| `{firstLift}`, `{sets}`, `{reps}`, `{kg}` | first exercise's name, set count, `targetReps`, target weight |
| `{deltaClause}` | ", {delta} kg more than {lastDay}" when the first lift went up since its last session ({lastDay} = weekday name); otherwise empty |
| `{protein}` | post-workout protein minimum (g) |
| `{meal}`, `{mealMin}` | planned meal name and its recipe's cooking time; `{quickMeal}`, `{quickMin}` = the fastest eligible alternative |
| `{oil}` | the meal's oil in tsp; the "not 3" clause only when oil ≤ 2 tsp |
| `{carbPortion}` | the carb portion label ("Rice: 1 katori", "2 rotis"), or empty |
| `{dinnerPortions}` | the rebalanced dinner portions label |
| `{breakfast}`, `{lunch}` | tomorrow's planned meal names |

**Variant rules**: `comeback` when the previous planned session was skipped or moved; `late` only for the first ping after `learnTiming` changes a shift; `ask` when a planned meal from earlier today has no status (the ping's lowest-priority button is replaced by **"Yes, ate it"** and the body adds "Did {slot} happen?" — Android shows at most 3 buttons); otherwise `standard`. When two pings merge (less than 20 minutes apart), the lower one's `short` line is appended to the higher one's body.

**Silent notices** (no sound, don't count toward the 4-a-day cap): trial reminder ("Your free week ends {weekday}. {price}/month after; cancel in Settings any time."), check-in ready ("Sunday check-in is ready. 30 seconds."), gym arrival ("Ready? {session}. First up: {firstLift} {sets}×{reps} at {kg} kg." with [Start]), rest-timer end on the lock screen (vibration only, channel `gym`).

## 4. Empty and loading states

- Today, rest day, all done: "Rest day. Nothing to do but eat well."
- Week not built: "Sunday's check-in builds next week."
- Progress, week 1: "Your week-1 numbers become the thing you beat."
- Grocery, nothing to buy: "Nothing to buy. Your staples cover the week."
- Workout summary, first ever: "First one in the books. Everything from here is a PR."
- Plan reveal loading: "Working out your calories… Picking your week… Tomorrow's meals…"

## 5. Errors

- Offline: "Offline. Your plan's on your phone, pings still fire."
- AI unavailable: "Coach is out for a minute. Your plan still works."
- Photo unclear: "Couldn't tell. Pick the closest:"
- Off-plan queued offline: "Logged. I'll do the numbers when you're online."
- Payment: "Payment didn't go through. Your plan is safe; try again."
- Swap with nothing close: "Nothing close in your kitchen; nearest is {meal} (+{kcal} kcal)."
- Plan command rejected after a replan: "Your {day} swap didn't apply — the week was replanned."

## 6. Permission asks

- **Notifications** (needed): "The whole app is 4 pings a day. Without them it's a list." · [Allow] [Not now]
  Denied: "No problem, pings off. Turn them on in Settings any time."
- **Location "Always"** (optional): "Pin your gym and FitG notices when you walk in — your workout is one tap away. This needs 'Always'. The Start button does the same job if you'd rather not." · [Pin my gym] [Skip, I'll tap Start]
- **Health data** (v1.1): "Read your sleep and steps so a bad night means a lighter session. Read-only. Never used for ads." · [Connect] [Not now]
- **Privacy consent** (on the Permissions & privacy step): "FitG uses your answers to plan your workouts and meals. Your data stays private, is never sold, and you can delete it any time in Settings." · checkbox "I agree" + links to Privacy and Terms.

## 7. Paywall (honest billing — mandatory content)

- Headline: "7 days free."
- Body: "Free until {weekday} {date}. Then {monthly}/month or {yearly}/year. We'll remind you 2 days before. Cancel in Settings in two taps."
- Button: "Start 7 days free" · small link: "Restore purchase"
- Settings → Subscription shows a literal **"Cancel subscription"** button.
- Open founder decision: whether "Maybe later" leaves Today in a read-only preview.

## 8. Banned words

### 8a. Automated list
Checked by `containsBannedWords` (case-insensitive, whole words, ' and ’ both matched) on the copy bank, UI strings and **every AI output** — never on prompt files, which quote this list on purpose:

cheat · cheat day · guilty · guilt-free · naughty · bad food · junk food · clean eating · detox · burn off · earn it · lazy · excuse · excuses · fail · failed · failure · broke your streak · don't break your streak · skinny · cure · toxins · boost metabolism · no pain no gain · and the pattern `lose \d+ ?kg in \d+ days`.

### 8b. Human review (can't be checked by a word list)
- Never call the user fat or comment on their body ("fat" in "fat loss", "low-fat curd" and the macro label is fine).
- No medical claims: nothing may "treat", "prevent" or "heal" a condition.
- Emoji: at most one per ping; **none in gym mode**; never 🔥/💪 spam.

## 9. Words to use for Indian food (plain text, no italics, no glosses after first use)

katori, roti / chapati / phulka (same item), sabzi, dal, bhurji, curd / dahi, paneer, rajma, chana, soya chunks, poha, upma, idli, dosa, sambar, biryani, ghee. Household units first, cooked grams second: "1 katori dal (150 g)".
