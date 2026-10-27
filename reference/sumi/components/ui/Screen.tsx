// Sumi v2 — Screen primitive: bg.base + safe-area + 20px horizontal padding.
import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../constants/theme";

type ScreenProps = {
  children: React.ReactNode;
  /** Skip the horizontal screen padding (e.g. for full-bleed lists). */
  noPadding?: boolean;
  /** Extra styles on the inner content view. */
  style?: StyleProp<ViewStyle>;
  /** Background override (stays in the token family). */
  backgroundColor?: string;
  /** Respect top / bottom safe areas (default both true). */
  edges?: { top?: boolean; bottom?: boolean };
};

export default function Screen({
  children,
  noPadding = false,
  style,
  backgroundColor = theme.tokens.light.bg.base,
  edges,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = edges?.top !== false ? insets.top : 0;
  const bottom = edges?.bottom !== false ? insets.bottom : 0;

  return (
    <View style={[styles.root, { backgroundColor, paddingTop: top, paddingBottom: bottom }]}>
      <View
        style={[
          styles.content,
          !noPadding && { paddingHorizontal: theme.space.screenX },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
