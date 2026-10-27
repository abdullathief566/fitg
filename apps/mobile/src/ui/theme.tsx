// useTheme(): the token set for the current mode (tokens.md §0). light / dark follow the OS unless the user picks
// one in Settings; `gym` (Phase 4) forces the dark palette for gym mode and every lock-screen surface.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, fonts, icon, light, radius, space, tap, type, type Palette } from '@/constants/theme';
import { motion } from '@/constants/motion';

export type ThemeMode = 'light' | 'dark' | 'gym';
export type Appearance = 'system' | 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  isDark: boolean;
  c: Palette;
  type: typeof type;
  fonts: typeof fonts;
  space: typeof space;
  radius: typeof radius;
  tap: typeof tap;
  icon: typeof icon;
  motion: typeof motion;
}

function build(mode: ThemeMode): Theme {
  const isDark = mode !== 'light';
  return { mode, isDark, c: isDark ? dark : light, type, fonts, space, radius, tap, icon, motion };
}

const THEMES: Record<ThemeMode, Theme> = { light: build('light'), dark: build('dark'), gym: build('gym') };

const ThemeContext = createContext<Theme>(THEMES.light);

export function ThemeProvider({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  const scheme = useColorScheme();
  const mode: ThemeMode = appearance === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : appearance;
  return <ThemeContext.Provider value={THEMES[mode]}>{children}</ThemeContext.Provider>;
}

/** Forces gym mode for a subtree (gym screens, lock-screen mirrors). */
export function GymTheme({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={THEMES.gym}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Memoised styles that depend on the theme: `const s = useStyles(makeStyles)`. */
export function useStyles<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => factory(t), [factory, t]);
}
