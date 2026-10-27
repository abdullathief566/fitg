# FitG accessibility and inclusivity

- **Contrast.** All body and label pairs ≥ 4.5:1 (`tokens.md` §1). `text.tertiary` and `state.done` / `state.win` used as text are ≥ 3:1 only — restricted to large text or paired with an icon. Gym mode ≥ 7:1 by construction (cream on `#15110E`). Verify every flagged pair with a contrast tool in week 1 and record the numbers in `tokens.md`.
- **Dynamic type.** `allowFontScaling` on everywhere. `maxFontSizeMultiplier` 1.3 on 56-pt rows and the lock-screen mirror; unlimited on body and kitchen text. Layouts use `minHeight`, never fixed heights; test at the largest accessibility size on a small phone.
- **One-handed use.** Primary actions sit in the bottom 40% of the screen. Gym mode's "Done set" is at thumb height. No primary action lives only in the top-right corner. Swipe-back works everywhere.
- **Colour-blind safe.** Every state also has a shape: done = check, now = filled dot, upcoming = ring, rest = zzz icon, careful = triangle, win = star. Coral vs green is never the only difference. StreakWeeks: hit = filled + check, missed = outline (protanopia check).
- **VoiceOver / TalkBack.** Live Activity buttons are labelled in full ("Done set, set 2 of 3, 30 kilograms, 8 reps"; "Edit set"). The rest ring's `accessibilityValue` updates every 10 s, not every second. `NextUpCard` is a single element with `accessibilityRole="summary"` and its buttons exposed as `accessibilityActions`. Every icon-only button has a label.
- **Reduce Motion.** `useReducedMotion()` gates every spring and loop (fallbacks in `motion.md` §1). Haptics stay on.
- **Touch targets.** 48 pt minimum everywhere; 56 / 72 pt in gym mode; 56 / 64 pt in kitchen mode. No gesture without a button equivalent.
- **Language and units.** Plain English, short sentences. Indian dish names in plain text (katori, roti, sabzi, dal, bhurji) — no italics, no "Indian flatbread" glosses after first use. Units: kg default for India and most locales, lb for the US (steps 2.5 kg ↔ 5 lb). Household units first, grams second. The dish picker maps regional spellings to one item (chapati / roti / phulka).
- **Names.** Never assume a name's gender or pronouns; the coach addresses the user by first name only, or "you".
- **Kitchen mode** keeps the screen awake (`expo-keep-awake`) and uses `bodyXL` steps readable at arm's length.
