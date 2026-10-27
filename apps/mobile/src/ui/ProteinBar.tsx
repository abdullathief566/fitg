// ProteinBar — protein is the one number we show all day (components.md). Never red: over target says
// "a bit over; dinner's lighter" in `careful`. The fill animates on the UI thread (reduced motion: jumps).
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PlanNumber } from '@fitg/engine';
import { motion } from '@/constants/motion';
import { AnimatedNumber } from './AnimatedNumber';
import { AppText } from './AppText';
import { Card } from './Card';
import { easing } from './motion';
import { useTheme } from './theme';

export interface ProteinBarProps {
  consumed: PlanNumber;
  target: PlanNumber;
  next?: { slot: string; protein: PlanNumber };
}

export function proteinHint(consumed: number, target: number, next?: { slot: string; protein: number }): string {
  const toGo = target - consumed;
  if (toGo <= 0) return consumed > target * 1.1 ? "A bit over today. Dinner's lighter." : 'Protein done for today.';
  return next ? `${toGo} g to go, ${next.slot} covers ${next.protein}` : `${toGo} g to go`;
}

export function ProteinBar({ consumed, target, next }: ProteinBarProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0;
  const fill = useSharedValue(ratio);
  useEffect(() => {
    fill.set(reduced ? ratio : withTiming(ratio, { duration: motion.signature.numberChange, easing: easing.standard }));
  }, [ratio, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  const hint = proteinHint(consumed, target, next);
  return (
    <Card sunken padding={t.space[4]} testID="protein-bar">
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Protein ${consumed} of ${target} grams. ${hint}`}
        accessibilityValue={{ min: 0, max: target, now: Math.min(consumed, target) }}
        style={{ gap: t.space[2] }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space[1] }}>
          <AppText variant="button">Protein</AppText>
          <View style={{ flex: 1 }} />
          <AnimatedNumber value={consumed} variant="numberM" />
          <AppText variant="caption" tone="secondary">
            / {target} g
          </AppText>
        </View>
        <View style={{ height: 8, borderRadius: t.radius.pill, backgroundColor: t.c.hairline, overflow: 'hidden' }}>
          <Animated.View
            style={[{ height: 8, borderRadius: t.radius.pill, backgroundColor: t.c.accent.primary }, fillStyle]}
          />
        </View>
        <AppText variant="caption" tone={consumed > target * 1.1 ? 'careful' : 'secondary'}>
          {hint}
        </AppText>
      </View>
    </Card>
  );
}

/** Habit-only mode: one dot per protein-rich food today, no numbers about food or body. */
export function ProteinDots({ foods }: { foods: Array<{ name: string; done: boolean }> }) {
  const t = useTheme();
  const done = foods.filter((f) => f.done).length;
  const line = foods.length === 0 ? 'Protein foods show up here.' : `${done} of ${foods.length} protein foods today`;
  return (
    <Card sunken padding={t.space[4]} testID="protein-dots">
      <View
        accessible
        accessibilityLabel={line}
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}
      >
        {foods.map((f) => (
          <View
            key={f.name}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: f.done ? t.c.accent.primary : 'transparent',
              borderWidth: 2,
              borderColor: f.done ? t.c.accent.primary : t.c.text.tertiary,
            }}
          />
        ))}
        <AppText variant="caption" tone="secondary" style={{ marginLeft: t.space[1] }}>
          {line}
        </AppText>
      </View>
    </Card>
  );
}
