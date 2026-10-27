// Screen (ported from Sumi): bg.base, safe areas, 20 pt side gutter, optional scrolling with a pinned footer.
import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export interface ScreenProps {
  children: ReactNode;
  /** Scroll the content (footer stays pinned). */
  scroll?: boolean;
  /** Pinned to the bottom: primary actions live in the thumb zone (accessibility.md). */
  footer?: ReactNode;
  noPadding?: boolean;
  edges?: { top?: boolean; bottom?: boolean };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({ children, scroll, footer, noPadding, edges, style, testID }: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;
  const gutter = noPadding ? 0 : t.mode === 'gym' ? t.space.gymScreenX : t.space.screenX;
  const content = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingHorizontal: gutter, paddingBottom: t.space[6] }, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: gutter }, style]}>{children}</View>
  );
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: t.c.bg.base, paddingTop: top }}>
      {content}
      {footer ? (
        <View
          style={{ paddingHorizontal: gutter, paddingTop: t.space[3], paddingBottom: Math.max(bottom, t.space[4]) }}
        >
          {footer}
        </View>
      ) : (
        <View style={{ height: bottom }} />
      )}
    </View>
  );
}
