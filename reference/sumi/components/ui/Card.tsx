// Sumi v2 — Card primitive (DESIGN-BIBLE §1.3).
// r=24, white surface on warm base. NO shadow by default — the 3% surface-on-
// base contrast IS the elevation system. `hairline` only for white-on-white
// situations (e.g. cards inside sheets).
import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { theme } from "../../constants/theme";

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Opt-in soft shadow (light mode only situations that need lift). */
  elevated?: boolean;
  /** Opt-in 1px hairline border for white-on-white contexts. */
  hairline?: boolean;
  /** Sunken variant — inset well (inputs, nested zones). */
  sunken?: boolean;
  padding?: number;
};

export default function Card({
  children,
  style,
  elevated = false,
  hairline = false,
  sunken = false,
  padding = theme.space.screenX,
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        { padding },
        sunken && styles.sunken,
        elevated && theme.shadow.soft,
        hairline && styles.hairline,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.tokens.light.bg.surface,
    borderRadius: theme.radius.card,
  },
  sunken: {
    backgroundColor: theme.tokens.light.bg.surfaceSunken,
  },
  hairline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.tokens.light.hairline,
  },
});
