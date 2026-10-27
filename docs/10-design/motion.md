# FitG motion, "alive" spec, haptics

All durations, easings and springs come from `constants/motion.ts`: the tokens in `tokens.md` §4 plus the specific timings below, stored as named constants under `motion.signature.*` (e.g. `motion.signature.revealThinking = 1200`, `motion.signature.checkDraw = 220`, `motion.signature.confetti = 900`). No literal durations in components. Haptics go only through `lib/haptics.ts` (`tokens.md` §6).

## 0. The coach's presence: PulseDot, not an orb

An orb reads "chatbot", means nothing on a lock screen, and cost Sumi days of crashes and phone heat. FitG's coach is present through:
- **PulseDot** — an 8–10 px coral dot before every coach line.
  - Idle: opacity 0.6 ↔ 1.0, 2.4 s sine loop.
  - Thinking: scale 1 ↔ 1.3 at 0.9 s with a 40% halo.
  - Done: morphs into a 10 px check (150 ms).
  - One shared value per dot; paused when off-screen, on blur, or when the app is backgrounded.
- **Ambient tint** behind the NextUpCard (animation #8).

## 1. Signature animations

| # | Animation | Spec | Reduced-motion fallback |
|---|---|---|---|
| 1 | **Plan reveal build-up** | PulseDot "thinking" for 1.2 s: 3 live steps ("Working out your calories ✓ → Picking your week ✓ → Tomorrow's meals ✓", 300 ms each) + 300 ms settle. Then `RollingNumber` for kcal and protein (duration 700, 25 ms stagger per digit, `Easing.out(Easing.cubic)`); **Success haptic on the last digit's settle**. Week chips `FadeInDown` (duration 400, dampingRatio 0.75), 50 ms stagger. Ping preview card slides up over 240 ms at the end. Total under 3 s; tap anywhere to skip to the end state. | Static numbers; 200 ms cross-fade |
| 2 | **Set complete** | Button label → check path-trim (Skia, 220 ms) + Rigid haptic on the check keyframe; the set dot fills (scale 0→1, `spring.pop`); the number area slides left 240 ms to reveal the rest ring. | Instant swap + haptic |
| 3 | **Rest timer ring** | Skia arc; sweep driven by a shared value via `withTiming(0, { duration: remainingMs, easing: linear })`. Colour interpolates rest → coral over the last 5 s; screen edges glow (ported ScreenEdgeGlow) 0 → 0.8 opacity from T−5 s; at 0: ring scale 1 → 1.08 → 1 (`spring.pop`) + Heavy ×2. | Ring static, number counts down, haptics kept |
| 4 | **PR moment** | Summary row: number scales 1 → 1.15 → 1 (`spring.pop`); win-colour flash on the row background, 400 ms; one confetti burst (react-native-fast-confetti, 60 particles, 900 ms, win + coral + cream); Success, then Heavy at +200 ms. Multiple PRs in a session → still one burst. Run after `InteractionManager.runAfterInteractions`. | Win-colour badge fades in; Success haptic |
| 5 | **Comeback moment** | ComebackCard enters `FadeInUp` (duration 400, dampingRatio 1 — sober, no bounce); "Welcome back" typewriter 600 ms; reward badge pops after 300 ms; Soft haptic. **Never confetti here** — it's warmth, not a party. | Cross-fade |
| 6 | **Streak-week fill** | Pill fills left → right (width 0 → 100%, 400 ms, `Easing.bezier(0.2, 0, 0, 1)`), then scale pop 1.08; Soft haptic. | Instant fill |
| 7 | **NextUp card change** | Old card exits `FadeOutUp` 200 ms; new card enters `FadeInDown` (400, dampingRatio 0.8); the timeline below uses `LinearTransition.springify()`. | 200 ms cross-fade |
| 8 | **Ambient tint** | Two radial blobs behind the NextUpCard at 4–6% opacity, 20 s loop, ±2% translate (expo-linear-gradient on Android, Skia on iOS). **Off in gym mode.** | Off |
| 9 | **Sheets** | Gorhom v5 with `spring.sheet` (damping 80, stiffness 500); backdrop 0 → 0.45; Medium haptic on each detent. | Same, shorter |

## 2. Micro-interactions

- **Press:** scale 0.97 (gym 0.95) via `withSpring(spring.press)` + Light haptic on press-in.
- **List entrance:** 50 ms stagger, capped at 6 items; the rest appear instantly.
- **Number changes:** `AnimatedNumber`, 500 ms.
- **Quick actions (< 2 s):** button label → spinner → check morph.
- **Skeletons:** opacity pulse 0.5 ↔ 1, 1000 ms; shapes match the final layout.
- **Gym mode:** no decorative motion at all — only set-complete, rest ring, and PR. Everything else is instant.

## 3. Performance rules (60 fps on a mid-range Android)

1. Every animation is a Reanimated worklet (`useSharedValue` / `useAnimatedStyle`); never `setState` per frame; never `Animated` from RN core.
2. `cancelAnimation` on unmount, on screen blur, and on AppState → background (Sumi's heat lesson). Acceptance check #8.
3. Max 3 concurrent looping animations per screen.
4. No `expo-blur` on Android (solid surfaces); no shadows on Android (tonal elevation only).
5. Skia only for the rest ring, the check-draw and confetti.
6. FlashList v2 for the timeline, week and grocery lists.
7. Exercise images pre-sized WebP ≤ 60 KB.
8. `useReducedMotion()` gates every spring and loop (acceptance check #10); haptics stay on under reduced motion.

## 4. Haptics per moment

See the full map in `tokens.md` §6. The two rules that matter most: haptics fire **on the keyframe** the eye sees (check drawn, number settled), never on mount or scroll; and every haptic routes through `lib/haptics.ts`, which honours the Settings kill switch.
