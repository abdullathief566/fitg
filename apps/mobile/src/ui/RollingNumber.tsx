// RollingNumber (ported from Sumi): slot-machine digits. Each digit is a 0–9 strip in an overflow-hidden window that
// translates to −digit × height. On mount it rolls 0 → value (the reveal: 700 ms, 25 ms stagger per digit,
// out-cubic); `onSettled` fires when the LAST digit lands — the Success-haptic frame. One-shot, no loops.
// Reduced motion: no roll; the value is shown and `onSettled` fires on mount.
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PlanNumber } from '@fitg/engine';
import type { TypeToken } from '@/constants/theme';
import { motion } from '@/constants/motion';
import { easing } from './motion';
import { toneColor, type TextTone } from './AppText';
import { useTheme } from './theme';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface StripProps {
  digit: number;
  height: number;
  textStyle: object;
  delay: number;
  duration: number;
  rollOnMount: boolean;
  onSettled?: () => void;
}

function DigitStrip({ digit, height, textStyle, delay, duration, rollOnMount, onSettled }: StripProps) {
  const y = useSharedValue(rollOnMount ? 0 : -digit * height);
  useEffect(() => {
    const target = -digit * height;
    y.set(
      withDelay(
        delay,
        withTiming(target, { duration, easing: easing.outCubic }, (finished) => {
          if (finished && onSettled) scheduleOnRN(onSettled);
        }),
      ),
    );
  }, [digit, height, delay, duration, onSettled, y]);
  useEffect(() => () => cancelAnimation(y), [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text key={d} allowFontScaling={false} style={[textStyle, { height, lineHeight: height }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export interface RollingNumberProps {
  value: PlanNumber;
  variant?: TypeToken;
  tone?: TextTone;
  rollOnMount?: boolean;
  duration?: number;
  stagger?: number;
  onSettled?: () => void;
  /** Spoken value, e.g. "1,850 calories a day". */
  accessibilityLabel?: string;
}

export function RollingNumber({
  value,
  variant = 'numberL',
  tone = 'primary',
  rollOnMount = false,
  duration = motion.signature.revealNumber,
  stagger = motion.signature.revealDigitStagger,
  onSettled,
  accessibilityLabel,
}: RollingNumberProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const style = t.type[variant];
  const textStyle = { ...style, color: toneColor(t, tone), includeFontPadding: false };
  const text = Math.max(0, Math.round(value)).toLocaleString('en-US');

  useEffect(() => {
    if (reduced && onSettled) onSettled();
  }, [reduced, onSettled]);

  if (reduced) {
    return (
      <Text accessibilityLabel={accessibilityLabel ?? text} style={textStyle}>
        {text}
      </Text>
    );
  }
  const chars = text.split('');
  let lastDigit = -1;
  chars.forEach((ch, i) => {
    if (/\d/.test(ch)) lastDigit = i;
  });
  let ordinal = -1;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? text}
      style={{ flexDirection: 'row' }}
    >
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <Text
              key={`s${i}`}
              allowFontScaling={false}
              style={[textStyle, { height: style.lineHeight, lineHeight: style.lineHeight }]}
            >
              {ch}
            </Text>
          );
        }
        ordinal += 1;
        return (
          <DigitStrip
            key={`d${i}`}
            digit={Number(ch)}
            height={style.lineHeight}
            textStyle={textStyle}
            delay={ordinal * stagger}
            duration={duration}
            rollOnMount={rollOnMount}
            {...(i === lastDigit && onSettled ? { onSettled } : {})}
          />
        );
      })}
    </View>
  );
}
