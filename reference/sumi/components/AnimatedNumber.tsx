import React, { useEffect } from "react";
import { StyleSheet, TextStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { TextInput } from "react-native";
import { theme } from "../constants/theme";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  decimals?: number;
}

export default function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  duration = 1000,
  style,
  decimals = 0,
}: AnimatedNumberProps) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => {
    const currentValue = animatedValue.value;

    // HEAT FIX: format inside the worklet WITHOUT allocating an
    // Intl.NumberFormat every frame (that was ~60 allocations/sec per number,
    // ×several dashboard numbers = a CPU/GC spike on mount). Group thousands
    // with a cheap regex on the toFixed string instead.
    let formatted: string;
    try {
      const fixed = currentValue.toFixed(decimals);
      const parts = fixed.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      formatted = parts.join(".");
    } catch {
      formatted = currentValue.toFixed(decimals);
    }

    const displayText = `${prefix}${formatted}${suffix}`;

    return {
      text: displayText,
      defaultValue: displayText,
    };
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      animatedProps={animatedProps}
      style={[styles.text, style]}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#1A1A2E",
    fontSize: theme.typography.h1.fontSize,
    fontWeight: theme.typography.h1.fontWeight,
    letterSpacing: theme.typography.h1.letterSpacing,
  },
});
