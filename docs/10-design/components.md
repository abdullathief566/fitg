# FitG component library

One file per component under `apps/mobile/src/ui/`. Every component reads tokens through `useTheme()`; none imports hex, expo-haptics, or `Animated` from RN core directly.

## 1. Components and props

| Component | Props (TypeScript-ish) | Notes |
|---|---|---|
| `NextUpCard` | `step: NextStep` (`types.md` §7 — kinds `'workout'\|'meal'\|'prep'\|'rest'\|'checkin'\|'comeback'\|'tomorrow'`), plus display props: `time?: Date` (absent for `rest`); title; subtitle?; detail?; delta?: {text, tone: 'win'\|'careful'}; actions: Action[] (1–3: {label, onPress, variant: 'primary'\|'secondary'\|'quiet'}); coachLine?: string; state: 'upcoming'\|'now'\|'done'` | **Exactly one on Today** (snapshot test). Ambient tint by kind (accent / rest / win at 6%). |
| `PingBanner` | `ping: PingType; title; body; actions; onDismiss` | In-app mirror of a notification when tapped through; same copy source as the notification. |
| `SetRow` | `index; target: {kg, reps}; actual?: {kg, reps}; status: 'todo'\|'now'\|'done'\|'skipped'; onDone(actual); onEdit; unit: 'kg'\|'lb'` | 56 pt (gym 64). Done = check morph + Rigid haptic. |
| `WeightRepStepper` | `value; step (2.5 / 5 / 1); min; max; unit; size: 'gym'\|'normal'; onChange` | Selection haptic per tick; long-press accelerates. |
| `RestTimer` | `totalSec; remainingSec (shared value); state: 'running'\|'paused'\|'done'; onSkip; onAdd30; size: 'hero'\|'chip'` | Skia ring; `rest` colour → coral in the last 5 s. |
| `ProteinBar` / `MacroRing` | `current; target; unit: 'g'\|'kcal'; label; remainingHint?: string; mode: 'bar'\|'ring'` | Protein is a bar (primary); calories a quiet caption. Never red when over: "a bit over; dinner's lighter." |
| `RecipeStep` | `index; total; text; timerSec?; ingredients?: Ingredient[]; isCurrent` | `bodyXL`; timer button starts a local countdown. |
| `PortionPicker` | `unit: 'katori'\|'roti'\|'tsp'\|'tbsp'\|'cup'\|'piece'\|'g'; value; step; onChange; gramsEquivalent; showGrams: boolean` | Shows "1 katori ≈ 150 g" (`showGrams` false in habit-only mode → "1 katori"). Chips 56 pt. |
| `SwapSheet` | `kind: 'meal'\|'exercise'; current; options: Alt[3] {title, reason, delta}; onPick; reasonChips?: ['Equipment busy', "Don't like it", 'No ingredients']` | Gorhom bottom sheet v5, detents 0.55 / 0.9, Medium haptic on detent. |
| `StreakWeeks` | `weeks: ('hit'\|'missed'\|'pass'\|'future')[]; currentIndex; lifePassAvailable: boolean` | 13 pills (one quarter). "pass" shows a small heart. Missed is neutral grey, never red. |
| `ComebackCard` | `missedCount; rescheduledTo?: string; reward: {label, icon}; onStart` | Replaces guilt; appears once per miss. |
| `ShareCard` | `week; workoutsDone; strengthDelta: {lift, kg}[]; proteinDays; theme: 'cream'\|'dark'` | 1080×1920 via react-native-view-shot. |
| `CoachBubble` | `text; state: 'idle'\|'thinking'\|'done'; actions?; typewriter?: boolean` | PulseDot prefix; typewriter 18 ms/char, max 1.2 s, tap to skip. |
| `PulseDot` | `state: 'idle'\|'thinking'\|'done'\|'off'; size: 8\|10` | **The coach's presence** (motion.md §0). |
| `PermissionExplainer` | `kind: 'notifications'\|'location'; required: boolean; status; onAllow; onSkip` | Three lines: what / when / why. Copy in `copy.md` §6. |
| `Paywall` | `trialEndDate; monthly; yearly; currency; onStart(plan); onRestore; onLater?` | Honest-billing block is mandatory content. |
| `JourneyBar` | `day; total = 90; milestones: [14, 42, 90]` | Milestone ticks; week 6 labelled "where most people quit — you didn't." |
| `PrimaryButton` | port from Sumi; add `size: 'normal'\|'gym'\|'kitchen'` (56 / 72 / 64) and `tone` | Dark text on coral. Press scale per `motion.pressScale*`. |
| `PlanChangeCard` | `commands: CoachCommand[]; why: string; onConfirm; onReject` | Inline in Coach thread; nothing applies until Confirm. |
| `ProteinDots` | `foods: { name: string; done: boolean }[]` | Habit-only mode replacement for `ProteinBar`: one dot per protein-rich food planned today ("● ● ● ○ — 3 of 4 protein foods today"). No numbers about food or body. |
| `Card`, `Screen`, `Skeleton`, `RollingNumber`, `AnimatedNumber`, `Keypad` | port from Sumi as-is, re-tokened | |

## 2. What to port from Sumi (`~/Desktop/sumi/app/frontend`)

Port the **pattern and the component**, re-tokened to `theme.ts`:
- `components/onboarding/RollingNumber.tsx` → reveal count-ups and PR numbers.
- `components/AnimatedNumber.tsx` → ProteinBar count-ups.
- `PrimaryButton` press micro-state (scale + Light haptic on press-in).
- `Card`, `Screen`, `Keypad`.
- `src/lib/haptics.ts` → single haptics service with a global kill switch; extend with the map in `tokens.md` §6.
- `components/ScreenEdgeGlow.tsx` → re-coloured coral; used for the rest-timer's last 5 s.
- The "heat discipline": every `withRepeat` loop is cancelled on unmount, screen blur, and AppState background.

Do **not** port:
- `SumiOrb` / `VoiceOrb` — an orb reads "chatbot", means nothing on a lock screen, and cost Sumi days of crashes and heat. Presence = `PulseDot`.
- `SuccessCelebration` as-is — rewrite as a Skia check-draw + one confetti burst; no full-screen white overlay.
- `FinancialHealthScore`, `SpendingHeatmap`, `TutorialOverlay` — wrong product.

## 3. Component rules
- Props are typed; numbers shown to the user arrive as typed `PlanNumber` values from the engine, never as free text from AI (acceptance check #9).
- Every interactive component has an `accessibilityLabel`/`Role`; `NextUpCard` is one `accessibilityRole="summary"` with `accessibilityActions`.
- No component owns colour: all colour comes from `useTheme()`; mode-aware components (`SetRow`, `PrimaryButton`, `RestTimer`) accept `size` and read mode from context.
- Lists (timeline, week, grocery) use FlashList v2.
