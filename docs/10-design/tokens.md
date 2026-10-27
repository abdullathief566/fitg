# FitG design tokens — "Warm Spotter" (hybrid: warm app, dark gym)

Tokens are the **only** source of colour, size, type, motion and haptics in the app. Hex values live in `apps/mobile/constants/theme.ts` and nowhere else (acceptance check #1 in `docs/code_review.md`). This file is the spec for that module.

## 0. Modes

`useTheme()` returns the token set for one of three modes:

| Mode | When | Palette |
|---|---|---|
| `light` | default when OS is light | `light` below |
| `dark` | when OS is dark (or user picks dark) | `dark` below |
| `gym` | **forced** inside gym mode (`app/gym/**`) and on every lock-screen surface, regardless of OS setting | `dark` palette + `gymType` multiplier + `tap.gym*` sizes |

Settings → Appearance offers system / light / dark and a "Gym always dark" toggle that defaults ON (turning it off is allowed but not recommended; the lock screen stays dark regardless because the OS tints it).

## 1. Colour

```ts
// constants/theme.ts — the only place hex lives
export const light = {
  bg:   { base: "#FBF7F0", surface: "#FFFFFF", raised: "#FFFFFF", sunken: "#F3EDE3" },
  text: { primary: "#1F1A14", secondary: "#6B6259", tertiary: "#857A6E", onAccent: "#1F1A14", inverse: "#F6F0E8" },
  accent: { primary: "#F4683A", deep: "#B8431C", tint: "rgba(244,104,58,0.12)" },
  state: {
    win: "#E9A826",     winTint: "rgba(233,168,38,0.14)",      // PRs, streak, celebrations
    done: "#2F9D63",    doneTint: "rgba(47,157,99,0.12)",      // completed set / meal
    careful: "#D4850E", carefulTint: "rgba(212,133,14,0.12)",  // late, busy equipment, estimate
    rest: "#5B7DB1",    restTint: "rgba(91,125,177,0.12)",     // rest day, rest timer
  },
  hairline: "rgba(31,26,20,0.08)",
  overlay: "rgba(31,26,20,0.45)",
} as const;

export const dark = {
  bg:   { base: "#15110E", surface: "#1F1A16", raised: "#2A241F", sunken: "#110E0B" },
  text: { primary: "#F6F0E8", secondary: "#B5AAA0", tertiary: "#7E7369", onAccent: "#15110E", inverse: "#1F1A14" },
  accent: { primary: "#FF7A4D", deep: "#D6552B", tint: "rgba(255,122,77,0.16)" },
  state: {
    win: "#F2B63A",     winTint: "rgba(242,182,58,0.16)",
    done: "#4DB87A",    doneTint: "rgba(77,184,122,0.14)",
    careful: "#E59A2B", carefulTint: "rgba(229,154,43,0.14)",
    rest: "#7D9BD1",    restTint: "rgba(125,155,209,0.14)",
  },
  hairline: "rgba(246,240,232,0.08)",
  overlay: "rgba(0,0,0,0.55)",
} as const;
// gym mode = dark, forced.
```

**Rules**
- Buttons use **dark text on coral** (`text.onAccent`), never white on coral (white fails AA).
- Accent-coloured *small text* uses `accent.deep`, never `accent.primary`.
- `text.tertiary` is for timestamps and hints only (≈3.9:1 in light — large or non-essential text).
- `state.done` / `state.win` are fills and icons, always paired with a label; never the only differentiator (colour-blind rule in `accessibility.md`).
- **No red anywhere.** "Over" states say "a bit over; dinner's lighter" in `careful`, not red.
- Gym mode ≥ 7:1 by construction (cream on `#15110E`).

**Contrast (computed; re-verify with a tool in week 1):** light `text.primary`/`bg.base` 16:1 · `text.secondary`/`bg.base` 5.6:1 · `text.tertiary`/`bg.base` ≈3.9:1 (large only) · `text.onAccent`/`accent.primary` 5.5:1 · `accent.deep`/`bg.base` 5.1:1 · `state.done`/`bg.base` 3.2:1 (fill/icon only). Dark `text.secondary`/`bg.base` 8.3:1 · `accent.primary`/`bg.base` 7.3:1 · `text.onAccent`/`accent.primary` 7.3:1. **Flagged for a tool check:** tertiary in both modes, `careful` and `win` used as text.

## 2. Typography

Fonts via `@expo-google-fonts/outfit` and `@expo-google-fonts/dm-sans`, embedded with the expo-font config plugin (dev build — never gate on Expo Go).

```ts
export const fonts = {
  display: { semibold: "Outfit_600SemiBold", bold: "Outfit_700Bold", black: "Outfit_800ExtraBold" },
  body:    { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold", bold: "DMSans_700Bold" },
} as const;
// Every number that can change renders with fontVariant: ['tabular-nums'].
// Decided 2026-10-28: every number renders in Outfit. Outfit has a `tnum` feature; the Google Fonts build of DM Sans has
// none (its digits are proportional), so DM Sans can't be the fallback. `type.numberM` is Outfit 700 (was DM Sans 700).
```

| Token | Face | Size/Line | Tracking | Use |
|---|---|---|---|---|
| `type.numberHero` | Outfit 800 | 64/68 | −1.5 | Rest timer, current weight in gym mode, reveal calories |
| `type.numberL` | Outfit 700 | 36/40 | −0.8 | PR numbers, journey day, macro totals |
| `type.numberM` | Outfit 700 | 20/24 | 0 | Set rows, portions (Outfit for tabular digits — see the note above) |
| `type.displayXL` | Outfit 800 | 44/48 | −1 | Plan reveal headline, celebration titles |
| `type.displayL` | Outfit 700 | 32/38 | −0.5 | Screen titles, NextUp headline |
| `type.displayM` | Outfit 700 | 24/30 | −0.3 | Card titles, exercise name |
| `type.displayS` | Outfit 600 | 20/26 | −0.2 | Sub-heads, meal names |
| `type.bodyXL` | DM Sans 400 | 20/28 | 0 | Kitchen steps |
| `type.bodyL` | DM Sans 400 | 17/24 | 0 | Coach lines, ping previews |
| `type.body` | DM Sans 400 | 15/22 | 0 | Default |
| `type.buttonL` | DM Sans 700 | 17/22 | 0 | Primary buttons |
| `type.button` | DM Sans 600 | 15/20 | 0 | Secondary buttons, chips |
| `type.caption` | DM Sans 400 | 13/18 | +0.1 | Metadata |
| `type.micro` | DM Sans 600 | 11/14 | +0.4, uppercase | Labels ("NEXT UP", "SET 2 OF 3") |
| `gymType` | body/button/caption × 1.25, floor 17 pt | | | Gym mode only |

Dynamic type: `allowFontScaling` on everywhere; `maxFontSizeMultiplier` 1.3 on 56-pt rows and the lock-screen mirror; unlimited on body/kitchen text. Layouts use `minHeight`, never fixed heights.

## 3. Space, radius, elevation

```ts
export const space  = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, screenX: 20, gymScreenX: 24 } as const;
export const radius = { card: 24, cardInner: 12, button: 16, buttonGym: 20, chip: 10, pill: 999, sheet: 28, ring: 999 } as const;
export const elevation = {           // tonal only; Android elevation 0; no shadows in dark/gym
  flat:   {},
  card:   { backgroundColor: "bg.surface" },
  raised: { backgroundColor: "bg.raised", borderWidth: 1, borderColor: "hairline" },
  lightOnlySoft: { shadowColor: "#1F1A14", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 0 },
} as const;
```

## 4. Motion tokens

```ts
// constants/motion.ts
export const motion = {
  duration: { micro: 120, standard: 240, emphasized: 400, reveal: 700, celebrate: 1200 },
  easing: {                        // Easing.bezier(...)
    standard: [0.2, 0, 0, 1], exit: [0.3, 0, 1, 1], enter: [0, 0, 0.2, 1], linear: [0, 0, 1, 1],
  },
  spring: {                        // Reanimated 4 duration-based springs
    press:  { duration: 300, dampingRatio: 0.8 },
    pop:    { duration: 420, dampingRatio: 0.6 },
    settle: { duration: 500, dampingRatio: 1 },
    sheet:  { damping: 80, stiffness: 500 },
  },
  stagger: 50, pressScale: 0.97, pressScaleGym: 0.95,
} as const;
```

Full animation specs: `motion.md`. Its specific timings (reveal 1.2 s, check-draw 220 ms, confetti 900 ms, typewriter 18 ms/char, PulseDot loops…) also live in `motion.ts`, as named constants under `motion.signature.*`.

## 5. Icons and tap targets

```ts
export const icon = { xs: 16, sm: 20, md: 24, lg: 28, gym: 32, hero: 48, stroke: 2 } as const;   // Lucide, rounded caps
export const tap  = { min: 48, comfortable: 56, gymMin: 56, gymPrimary: 72, kitchenMin: 56, kitchenNext: 64, lockScreenButton: 44 /* system */ } as const;
```

## 6. Haptic map (`lib/haptics.ts` — the only module allowed to import expo-haptics; global kill switch in Settings)

| Moment | Call |
|---|---|
| Button press-down, ping action, chip select | `impactAsync(Light)` |
| Weight/reps +/−, picker tick, portion step | `selectionAsync()` |
| Set done (on the check keyframe) | `impactAsync(Rigid)` |
| "Ate it" / "Cooked it" | `impactAsync(Medium)` |
| Sheet detent, swap applied | `impactAsync(Medium)` |
| Rest timer 10 s left | `impactAsync(Light)` once |
| Rest timer end (in-app) | `impactAsync(Heavy)` ×2, 120 ms apart; on the lock screen: a vibration-only local notification, no sound |
| Workout complete, plan reveal settle | `notificationAsync(Success)` on the keyframe |
| PR | `Success`, then `impactAsync(Heavy)` at +200 ms (the double hit) |
| Streak-week fill, comeback card, state shift | `impactAsync(Soft)` |
| Validation error | `notificationAsync(Warning)` + shake, same frame |
| Never | on mount, on scroll, continuously |

## 7. Brand constants

```ts
// constants/brand.ts
export const APP_NAME = "FitG";
export const TAGLINE = "Never wonder what to do at the gym.";
export const SUPPORT_EMAIL = "support@fitg.app";   // placeholder until the domain is bought
export const URLS = { privacy: "https://fitg.app/privacy", terms: "https://fitg.app/terms", site: "https://fitg.app" };
export const SCHEME = "fitg";
```
