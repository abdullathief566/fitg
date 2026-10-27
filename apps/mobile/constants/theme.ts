// FitG design tokens — "Warm Spotter" (docs/10-design/tokens.md). The ONLY place hex values live in the app
// (design acceptance check #1). Components read these through `useTheme()` (src/ui/theme.tsx).
import type { TextStyle } from 'react-native';

export const light = {
  bg: { base: '#FBF7F0', surface: '#FFFFFF', raised: '#FFFFFF', sunken: '#F3EDE3' },
  text: { primary: '#1F1A14', secondary: '#6B6259', tertiary: '#857A6E', onAccent: '#1F1A14', inverse: '#F6F0E8' },
  accent: { primary: '#F4683A', deep: '#B8431C', tint: 'rgba(244,104,58,0.12)' },
  state: {
    win: '#E9A826', // PRs, streak, celebrations
    winTint: 'rgba(233,168,38,0.14)',
    done: '#2F9D63', // completed set / meal
    doneTint: 'rgba(47,157,99,0.12)',
    careful: '#D4850E', // late, busy equipment, estimate
    carefulTint: 'rgba(212,133,14,0.12)',
    rest: '#5B7DB1', // rest day, rest timer
    restTint: 'rgba(91,125,177,0.12)',
  },
  hairline: 'rgba(31,26,20,0.08)',
  overlay: 'rgba(31,26,20,0.45)',
} as const;

export const dark = {
  bg: { base: '#15110E', surface: '#1F1A16', raised: '#2A241F', sunken: '#110E0B' },
  text: { primary: '#F6F0E8', secondary: '#B5AAA0', tertiary: '#7E7369', onAccent: '#15110E', inverse: '#1F1A14' },
  accent: { primary: '#FF7A4D', deep: '#D6552B', tint: 'rgba(255,122,77,0.16)' },
  state: {
    win: '#F2B63A',
    winTint: 'rgba(242,182,58,0.16)',
    done: '#4DB87A',
    doneTint: 'rgba(77,184,122,0.14)',
    careful: '#E59A2B',
    carefulTint: 'rgba(229,154,43,0.14)',
    rest: '#7D9BD1',
    restTint: 'rgba(125,155,209,0.14)',
  },
  hairline: 'rgba(246,240,232,0.08)',
  overlay: 'rgba(0,0,0,0.55)',
} as const;
// Gym mode = the dark palette, forced (Phase 4).

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** One palette's shape; `light` and `dark` both satisfy it. */
export type Palette = Widen<typeof light>;
const _darkHasEveryToken: Palette = dark;
void _darkHasEveryToken;

/** Font family names = the keys `useFonts` registers (they also match the Android file names). */
export const fonts = {
  display: { semibold: 'Outfit_600SemiBold', bold: 'Outfit_700Bold', black: 'Outfit_800ExtraBold' },
  body: {
    regular: 'DMSans_400Regular',
    medium: 'DMSans_500Medium',
    semibold: 'DMSans_600SemiBold',
    bold: 'DMSans_700Bold',
  },
} as const;

// Every number that can change renders in Outfit with tabular figures. Decided 2026-10-28: Outfit has a `tnum`
// feature; the Google Fonts build of DM Sans has none (its digits are proportional), so DM Sans is never used for
// numbers (tokens.md §2 records this).
const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  numberHero: {
    fontFamily: fonts.display.black,
    fontSize: 64,
    lineHeight: 68,
    letterSpacing: -1.5,
    fontVariant: TABULAR,
  },
  numberL: { fontFamily: fonts.display.bold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8, fontVariant: TABULAR },
  numberM: { fontFamily: fonts.display.bold, fontSize: 20, lineHeight: 24, letterSpacing: 0, fontVariant: TABULAR },
  displayXL: { fontFamily: fonts.display.black, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  displayL: { fontFamily: fonts.display.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  displayM: { fontFamily: fonts.display.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  displayS: { fontFamily: fonts.display.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  bodyXL: { fontFamily: fonts.body.regular, fontSize: 20, lineHeight: 28, letterSpacing: 0 },
  bodyL: { fontFamily: fonts.body.regular, fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  body: { fontFamily: fonts.body.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  buttonL: { fontFamily: fonts.body.bold, fontSize: 17, lineHeight: 22, letterSpacing: 0 },
  button: { fontFamily: fonts.body.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: fonts.body.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  micro: {
    fontFamily: fonts.body.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;
export type TypeToken = keyof typeof type;

/** Gym mode: body/button/caption × 1.25 with a 17 pt floor (Phase 4). */
export const gymType = { multiplier: 1.25, floor: 17 } as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  screenX: 20,
  gymScreenX: 24,
} as const;
export const radius = {
  card: 24,
  cardInner: 12,
  button: 16,
  buttonGym: 20,
  chip: 10,
  pill: 999,
  sheet: 28,
  ring: 999,
} as const;

/** Tonal elevation only: Android elevation 0, no shadows in dark/gym. `lightOnlySoft` is the one light-mode lift. */
export const shadow = {
  lightOnlySoft: {
    shadowColor: light.text.primary,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
} as const;

export const icon = { xs: 16, sm: 20, md: 24, lg: 28, gym: 32, hero: 48, stroke: 2 } as const; // Lucide, rounded caps
export const tap = {
  min: 48,
  comfortable: 56,
  gymMin: 56,
  gymPrimary: 72,
  kitchenMin: 56,
  kitchenNext: 64,
  lockScreenButton: 44, // system
} as const;

/** Dynamic type: cap on 56-pt rows (tokens.md §2). Body and kitchen text are unlimited. */
export const maxFontScaleRows = 1.3;
