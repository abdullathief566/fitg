// NextUpCard — the one next step (components.md; product law #1: exactly one on Today). One accessibility element
// with role "summary", its buttons exposed as accessibilityActions. Ambient tint by kind (accent / rest / win, ~6%).
// Motion #7: when the step changes, the old card exits up (200 ms) and the new one enters from below (400 ms spring);
// reduced motion: a 200 ms cross-fade.
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import type { NextStep, NextStepAction } from '@fitg/engine';
import { motion } from '@/constants/motion';
import { AppText } from './AppText';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { PulseDot } from './PulseDot';
import { KEEP_UNDER_REDUCED_MOTION } from './motion';
import { useTheme } from './theme';

export interface NextUpCardProps {
  step: NextStep;
  /** "6:30 PM" — absent for rest / tomorrow cards without a time. */
  timeLabel?: string;
  /** Only the actions this build supports (others are hidden, never dead buttons). */
  actions: NextStepAction[];
  onAction: (action: NextStepAction) => void;
  /** Card state: `now` breathes the dot; `upcoming` is still. */
  state: 'upcoming' | 'now' | 'done';
  /** An action is running: buttons are disabled. */
  busy?: boolean;
}

const S = motion.signature;

function tintFor(kind: NextStep['kind'], c: ReturnType<typeof useTheme>['c']): string {
  if (kind === 'rest' || kind === 'tomorrow') return c.state.restTint;
  if (kind === 'comeback' || kind === 'checkin') return c.state.winTint;
  return c.accent.tint;
}

function eyebrow(step: NextStep, time?: string): string {
  if (step.kind === 'rest') return 'Today';
  if (step.kind === 'tomorrow') return 'Next up';
  if (step.kind === 'comeback') return 'Week change';
  if (step.kind === 'checkin') return 'Sunday';
  return time ? `Next up · ${time}` : 'Next up';
}

export function NextUpCard({ step, timeLabel, actions, onAction, state, busy = false }: NextUpCardProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const entering = reduced
    ? FadeIn.duration(S.crossFade).reduceMotion(KEEP_UNDER_REDUCED_MOTION)
    : FadeInDown.duration(S.nextUpEnter).springify().dampingRatio(S.nextUpEnterDamping);
  const exiting = reduced
    ? FadeOut.duration(S.crossFade).reduceMotion(KEEP_UNDER_REDUCED_MOTION)
    : FadeOutUp.duration(S.nextUpExit);
  const label = [eyebrow(step, timeLabel), step.title, step.subtitle, step.detail].filter(Boolean).join('. ');

  return (
    <Animated.View key={`${step.kind}:${step.refId ?? step.title}`} entering={entering} exiting={exiting}>
      <Card testID="next-up-card" style={{ backgroundColor: t.c.bg.surface, overflow: 'hidden', gap: t.space[3] }}>
        {/* The ambient tint covers the whole card (about 6%: half of the tint token). */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tintFor(step.kind, t.c), opacity: 0.5 }]}
        />
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={label}
          accessibilityActions={actions.map((a) => ({ name: a.id, label: a.label }))}
          onAccessibilityAction={(e) => {
            const a = actions.find((x) => x.id === e.nativeEvent.actionName);
            if (a) onAction(a);
          }}
          style={{ gap: t.space[2] }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
            <PulseDot state={state === 'now' ? 'idle' : 'off'} />
            <AppText variant="micro" tone="secondary">
              {eyebrow(step, timeLabel)}
            </AppText>
          </View>
          <AppText variant="displayL">{step.title}</AppText>
          {step.subtitle ? (
            <AppText variant="body" tone="secondary">
              {step.subtitle}
            </AppText>
          ) : null}
          {step.detail ? <AppText variant="numberM">{step.detail}</AppText> : null}
        </View>
        {actions.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: t.space[2], marginTop: t.space[1] }}>
            {actions.map((a) => (
              <PrimaryButton
                key={a.id}
                label={a.label}
                variant={a.variant}
                onPress={() => onAction(a)}
                disabled={busy}
                style={a.variant === 'primary' ? { flex: 2 } : { flex: 1 }}
                testID={`next-up-action-${a.id}`}
              />
            ))}
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}
