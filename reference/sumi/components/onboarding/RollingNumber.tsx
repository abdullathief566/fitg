// Sumi onboarding — rolling slot-machine digits (BIBLE §5, View renderer).
// Each digit is a vertical 0–9 strip in an overflow:hidden window; the strip
// translates to -digit*height. Roll-on-mount (the reveal: 0 → value, 25ms
// per-digit stagger, ~900ms, Easing.out(cubic), onSettled fired from the LAST
// digit's completion via runOnJS — the Success-haptic frame). Value changes
// re-roll in place (the S0 sample cycler). One-shot timings only — no loops.
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type DigitStripProps = {
  digit: number;
  height: number;
  fontSize: number;
  color: string;
  delay: number;
  duration: number;
  rollOnMount: boolean;
  onSettled?: () => void;
};

function DigitStrip({
  digit,
  height,
  fontSize,
  color,
  delay,
  duration,
  rollOnMount,
  onSettled,
}: DigitStripProps) {
  const y = useSharedValue(rollOnMount ? 0 : -digit * height);

  useEffect(() => {
    const target = -digit * height;
    if (onSettled) {
      y.value = withDelay(
        delay,
        withTiming(
          target,
          { duration, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(onSettled)();
          }
        )
      );
    } else {
      y.value = withDelay(
        delay,
        withTiming(target, { duration, easing: Easing.out(Easing.cubic) })
      );
    }
    // No cleanup between digit changes — withTiming retargets smoothly.
  }, [digit]);

  // Cancel on unmount (heat/crash hygiene).
  useEffect(() => () => cancelAnimation(y), []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            style={[
              styles.digit,
              { height, lineHeight: height, fontSize, color },
            ]}
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

type RollingNumberProps = {
  /** Integer value to display (rounded). */
  value: number;
  height: number;
  fontSize: number;
  color: string;
  /** Currency glyph, rendered at 0.45× and baseline-raised. */
  symbol?: string;
  symbolColor?: string;
  /** Per-digit roll duration (reveal: 900; ambient: ~500). */
  duration?: number;
  /** Per-digit stagger, left → right (reveal: 25). */
  stagger?: number;
  /** Start every strip at 0 and roll up to the value on mount (the reveal). */
  rollOnMount?: boolean;
  /** Fired once, when the LAST digit settles — the Success-haptic frame. */
  onSettled?: () => void;
};

export default function RollingNumber({
  value,
  height,
  fontSize,
  color,
  symbol,
  symbolColor = "#6B7672",
  duration = 500,
  stagger = 25,
  rollOnMount = false,
  onSettled,
}: RollingNumberProps) {
  const str = Math.max(0, Math.round(value)).toLocaleString("en-US");
  const chars = str.split("");
  const lastDigitIndex = (() => {
    for (let i = chars.length - 1; i >= 0; i--) {
      if (/\d/.test(chars[i])) return i;
    }
    return -1;
  })();

  let digitOrdinal = -1;
  const symbolSize = fontSize * 0.45;

  return (
    <View style={styles.row}>
      {symbol ? (
        <Text
          style={[
            styles.symbol,
            {
              fontSize: symbolSize,
              lineHeight: symbolSize * 1.2,
              color: symbolColor,
              marginBottom: height * 0.32,
            },
          ]}
        >
          {symbol}
        </Text>
      ) : null}
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <Text
              key={`sep-${i}`}
              style={[
                styles.digit,
                { height, lineHeight: height, fontSize, color },
              ]}
            >
              {ch}
            </Text>
          );
        }
        digitOrdinal += 1;
        return (
          <DigitStrip
            key={`d-${i}`}
            digit={Number(ch)}
            height={height}
            fontSize={fontSize}
            color={color}
            delay={digitOrdinal * stagger}
            duration={duration}
            rollOnMount={rollOnMount}
            onSettled={i === lastDigitIndex ? onSettled : undefined}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  digit: {
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    includeFontPadding: false,
  },
  symbol: {
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
