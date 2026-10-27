// The app's only Pressable. Every tappable thing goes through here: it enforces the 48 pt minimum (accessibility.md;
// design acceptance check #3), the press scale (motion.md §2) and the Light press-down haptic.
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { motion } from '@/constants/motion';
import { useTheme } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TapProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Minimum touch size in pt; never below `tap.min` (48). */
  minSize?: number;
  /** Press-down haptic: Light tap (default), selection tick, or none when the handler fires its own. */
  feedback?: 'tap' | 'selection' | 'none';
  /** Scale on press (default on). */
  scale?: boolean;
}

export function Tap({
  children,
  style,
  minSize,
  feedback = 'tap',
  scale = true,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: TapProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const pressScale = t.mode === 'gym' ? motion.pressScaleGym : motion.pressScale;
  const min = Math.max(minSize ?? t.tap.min, t.tap.min);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...rest}
      onPressIn={(e) => {
        if (scale && !reduced) s.set(withSpring(pressScale, motion.spring.press));
        if (feedback === 'tap') haptics.tap();
        else if (feedback === 'selection') haptics.selection();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (scale && !reduced) s.set(withSpring(1, motion.spring.press));
        onPressOut?.(e);
      }}
      style={[{ minHeight: min, minWidth: min }, style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
