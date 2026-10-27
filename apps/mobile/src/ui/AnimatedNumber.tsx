// AnimatedNumber (ported from Sumi): a number that counts to its new value (500 ms) on the UI thread, formatted
// inside the worklet without allocating per frame (Sumi's heat fix). Reduced motion: jumps.
import { useEffect } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PlanNumber } from '@fitg/engine';
import type { TypeToken } from '@/constants/theme';
import { motion } from '@/constants/motion';
import { easing } from './motion';
import { toneColor, type TextTone } from './AppText';
import { useTheme } from './theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface AnimatedNumberProps {
  value: PlanNumber;
  suffix?: string;
  variant?: TypeToken;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}

export function AnimatedNumber({
  value,
  suffix = '',
  variant = 'numberM',
  tone = 'primary',
  style,
}: AnimatedNumberProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const v = useSharedValue<number>(value);
  useEffect(() => {
    v.set(reduced ? value : withTiming(value, { duration: motion.signature.numberChange, easing: easing.outCubic }));
  }, [value, reduced, v]);
  const animatedProps = useAnimatedProps(() => {
    const whole = Math.round(v.get()).toString();
    const text = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${suffix}`;
    return { text, defaultValue: text } as object;
  });
  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      accessibilityLabel={`${value}${suffix}`}
      animatedProps={animatedProps}
      style={[t.type[variant], { color: toneColor(t, tone), padding: 0 }, style]}
    />
  );
}
