# Reference: components from the founder's previous app (Sumi)

These 9 files are **references to port, not drop-ins.** `docs/10-design/components.md` §2 says which patterns to keep. They import Sumi's `constants/theme` (emerald palette) and `ScreenEdgeGlow.tsx` imports an `OrbState` type from Sumi's `VoiceOrb` (which FitG does not port). When porting:

- Re-token everything to FitG's `constants/theme.ts` / `constants/motion.ts` (no hex, no Sumi colours).
- Route haptics through FitG's `lib/haptics.ts` (port `src/lib/haptics.ts` as its starting point, extended with the map in `tokens.md` §6).
- `ScreenEdgeGlow`: drop the orb-state coupling; drive it from the rest timer (coral, last 5 s).
- `PrimaryButton`: add `size: 'normal' | 'gym' | 'kitchen'` (56 / 72 / 64 pt) and dark text on coral.
- `utils/sentry.ts`: keep the init pattern; DSN from `EXPO_PUBLIC_SENTRY_DSN`; `setUser({ id })` only.

| File | Port to |
|---|---|
| `components/onboarding/RollingNumber.tsx` | `apps/mobile/src/ui/RollingNumber.tsx` (reveal + PR count-ups) |
| `components/AnimatedNumber.tsx` | `apps/mobile/src/ui/AnimatedNumber.tsx` (ProteinBar) |
| `components/onboarding/Keypad.tsx` | `apps/mobile/src/ui/Keypad.tsx` (height/weight entry) |
| `components/ui/PrimaryButton.tsx`, `Card.tsx`, `Screen.tsx` | `apps/mobile/src/ui/` |
| `components/ScreenEdgeGlow.tsx` | `apps/mobile/src/ui/ScreenEdgeGlow.tsx` |
| `src/lib/haptics.ts` | `apps/mobile/lib/haptics.ts` |
| `utils/sentry.ts` | `apps/mobile/src/analytics/sentry.ts` |
