// Onboarding step layout (screens.md: one question per screen, a thin coral progress line, Next at the bottom,
// full width; Skip has equal weight where a step allows it).
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { ChevronLeft } from './icons';
import { motion } from '@/constants/motion';
import { AppText } from './AppText';
import { easing } from './motion';
import { PrimaryButton } from './PrimaryButton';
import { Tap } from './Pressable';
import { Screen } from './Screen';
import { useTheme } from './theme';

export function ProgressLine({ step, total }: { step: number; total: number }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const ratio = Math.min(step / total, 1);
  const w = useSharedValue(ratio);
  useEffect(() => {
    w.set(reduced ? ratio : withTiming(ratio, { duration: motion.signature.progressLine, easing: easing.standard }));
  }, [ratio, reduced, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
      style={{ height: 3, borderRadius: 2, backgroundColor: t.c.hairline, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height: 3, backgroundColor: t.c.accent.primary }, style]} />
    </View>
  );
}

export interface StepScaffoldProps {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext: () => void;
  nextLabel?: string;
  /** Why Next is disabled (shown under it), or null. */
  problem?: string | null;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  loading?: boolean;
}

export function StepScaffold({
  step,
  total,
  title,
  subtitle,
  children,
  onNext,
  nextLabel = 'Next',
  problem,
  onBack,
  onSkip,
  skipLabel = 'Skip',
  loading,
}: StepScaffoldProps) {
  const t = useTheme();
  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: t.space[2] }}>
          {problem ? (
            <AppText variant="caption" tone="secondary" align="center" accessibilityLiveRegion="polite">
              {problem}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            {onSkip ? (
              <PrimaryButton label={skipLabel} variant="secondary" onPress={onSkip} style={{ flex: 1 }} />
            ) : null}
            <PrimaryButton
              label={nextLabel}
              onPress={onNext}
              disabled={!!problem}
              loading={!!loading}
              style={{ flex: 1 }}
              testID="step-next"
            />
          </View>
        </View>
      }
    >
      <View style={{ paddingTop: t.space[2], gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          {onBack ? (
            <Tap
              accessibilityLabel="Back"
              onPress={onBack}
              style={{ alignItems: 'center', justifyContent: 'center', marginLeft: -t.space[3] }}
            >
              <ChevronLeft size={t.icon.md} color={t.c.text.primary} />
            </Tap>
          ) : null}
          <View style={{ flex: 1 }}>
            <ProgressLine step={step} total={total} />
          </View>
        </View>
        <AppText variant="displayL" accessibilityRole="header" style={{ marginTop: t.space[4] }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodyL" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
        <View style={{ marginTop: t.space[4], gap: t.space[6] }}>{children}</View>
      </View>
    </Screen>
  );
}

/** A labelled group of answers inside a step ("How do you eat?"). */
export function Question({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[3] }}>
      <View>
        <AppText variant="displayS">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>{children}</View>;
}
