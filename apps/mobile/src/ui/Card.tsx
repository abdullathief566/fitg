// Card (ported from Sumi). r = 24, surface on the warm base; tonal elevation only (no shadow by default).
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { shadow } from '@/constants/theme';
import { useTheme } from './theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Inset well: sunken background. */
  sunken?: boolean;
  /** 1 px hairline, for surface-on-surface cases (cards in sheets). */
  hairline?: boolean;
  /** The one soft lift, light mode only. */
  elevated?: boolean;
  padding?: number;
  testID?: string;
}

export function Card({ children, style, sunken, hairline, elevated, padding, testID }: CardProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: sunken ? t.c.bg.sunken : t.c.bg.surface,
          borderRadius: t.radius.card,
          padding: padding ?? t.space.screenX,
        },
        hairline ? { borderWidth: 1, borderColor: t.c.hairline } : null,
        elevated && !t.isDark ? shadow.lightOnlySoft : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
