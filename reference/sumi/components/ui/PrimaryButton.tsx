// Sumi v2 — PrimaryButton (DESIGN-BIBLE §1.3 / §4 micro-states).
// Flat emerald, r=16; pressed = accent.deep + scale 0.97 spring; Light impact
// on press-down. Loading swaps the label for a spinner in place.
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { theme } from "../../constants/theme";
import { haptics } from "../../src/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Fire the Light press-down haptic (default true). Disable when the
   * onPress handler already fires its own. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  /** "quiet" = sunken neutral secondary action. */
  variant?: "primary" | "quiet";
  testID?: string;
};

export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  haptic = true,
  style,
  variant = "primary",
  testID,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = React.useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isPrimary = variant === "primary";
  const backgroundColor = isPrimary
    ? pressed
      ? theme.tokens.light.accent.deep
      : theme.tokens.light.accent.primary
    : theme.tokens.light.bg.surfaceSunken;
  const labelColor = isPrimary
    ? theme.tokens.light.text.onAccent
    : theme.tokens.light.text.secondary;

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPressIn={() => {
        setPressed(true);
        scale.value = withSpring(0.97, { duration: 350, dampingRatio: 0.8 });
        if (haptic) haptics.tap();
      }}
      onPressOut={() => {
        setPressed(false);
        scale.value = withSpring(1, { duration: 350, dampingRatio: 0.8 });
      }}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor, opacity: disabled ? 0.5 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.button,
    paddingVertical: 17,
    paddingHorizontal: 24,
    width: "100%",
    minHeight: 56,
  },
  label: {
    ...theme.type.button,
  },
});
