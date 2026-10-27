// O13 Plan reveal (motion.md #1). The plan is computed on the phone while the PulseDot "thinks" for 1.2 s with three
// live steps; then calories and protein roll up (Success haptic as the last digit lands), the week chips slide in,
// tomorrow appears, and the first ping's preview slides up. Under 3 s; tap anywhere to skip to the end.
// Reduced motion: static numbers and a short cross-fade. Habit-only: no calorie or protein numbers at all.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { Check } from '@/src/ui/icons';
import { motion } from '@/constants/motion';
import { haptics } from '@/lib/haptics';
import { REVEAL_COPY as C, TODAY_COPY } from '@/src/copy/ui';
import { revealView, type RevealView } from '@/src/domain/reveal';
import { useApp } from '@/src/state/AppState';
import { track } from '@/src/analytics/analytics';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Tap } from '@/src/ui/Pressable';
import { PulseDot } from '@/src/ui/PulseDot';
import { RollingNumber } from '@/src/ui/RollingNumber';
import { Screen } from '@/src/ui/Screen';
import { KEEP_UNDER_REDUCED_MOTION } from '@/src/ui/motion';
import { useTheme } from '@/src/ui/theme';

const S = motion.signature;
type Phase = 'thinking' | 'reveal' | 'done';

export default function Reveal() {
  const t = useTheme();
  const reduced = useReducedMotion();
  const { finishOnboarding, snapshot, lib, now, enterApp } = useApp();
  const [view, setView] = useState<RevealView>();
  const [failed, setFailed] = useState(false);
  const [stepsShown, setStepsShown] = useState(reduced ? C.steps.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'thinking');
  const [settled, setSettled] = useState(reduced);

  // Build the plan (or reuse it if this screen was reopened).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = snapshot ?? (await finishOnboarding());
        if (alive) setView(revealView(snap, lib, now()));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
    // Runs once on purpose: finishing onboarding twice would rebuild the plan.
  }, []);

  // The 1.2 s "thinking": three live steps, 300 ms apart, then a 300 ms settle.
  useEffect(() => {
    if (phase !== 'thinking') return;
    const timers = C.steps.map((_, i) => setTimeout(() => setStepsShown(i + 1), S.revealStep * (i + 1)));
    const done = setTimeout(() => setPhase('reveal'), S.revealThinking);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [phase]);

  // After the numbers roll and the ping card lands, the reveal is done (and the skip overlay goes away).
  useEffect(() => {
    if (phase !== 'reveal') return;
    const done = setTimeout(() => setPhase('done'), S.revealNumber + S.revealPingCard + S.revealSettle);
    return () => clearTimeout(done);
  }, [phase]);

  const onSettled = useCallback(() => {
    if (settled) return;
    setSettled(true);
    haptics.success();
    track('plan_revealed');
  }, [settled]);

  // Habit-only and reduced motion have no roll: settle as soon as the plan shows.
  useEffect(() => {
    if (view && (view.habitOnly || reduced) && phase !== 'thinking' && !settled) onSettled();
  }, [view, reduced, phase, settled, onSettled]);

  const skip = () => {
    setStepsShown(C.steps.length);
    setPhase('done');
  };
  const showPlan = !!view && phase !== 'thinking';
  const fade = (delay = 0) =>
    reduced
      ? FadeIn.duration(S.crossFade).reduceMotion(KEEP_UNDER_REDUCED_MOTION)
      : FadeInDown.duration(S.revealChip).delay(delay).springify().dampingRatio(S.revealChipDamping);

  const header = useMemo(
    () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], alignSelf: 'center' }}>
        <PulseDot state={showPlan ? 'done' : 'thinking'} size={10} />
        <AppText variant="caption" tone="secondary">
          {showPlan ? ' ' : C.building}
        </AppText>
      </View>
    ),
    [showPlan, t],
  );

  return (
    <Screen
      scroll
      footer={
        showPlan ? (
          <PrimaryButton
            label={C.cta}
            testID="reveal-cta"
            onPress={() => {
              enterApp();
              router.replace('/today');
            }}
          />
        ) : null
      }
    >
      <View style={{ gap: t.space[6], paddingTop: t.space[6] }}>
        {header}
        {!showPlan ? (
          <View style={{ gap: t.space[3], alignSelf: 'center' }} accessibilityLiveRegion="polite">
            {C.steps.slice(0, stepsShown).map((s) => (
              <Animated.View
                key={s}
                entering={FadeIn.duration(S.revealStep)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}
              >
                <Check size={t.icon.sm} color={t.c.state.done} />
                <AppText variant="bodyL">{s}</AppText>
              </Animated.View>
            ))}
            {failed ? (
              <AppText variant="body" tone="secondary">
                {C.error}
              </AppText>
            ) : null}
          </View>
        ) : view ? (
          <>
            <AppText variant="displayXL" accessibilityRole="header">
              {view.habitOnly ? C.headline() : C.headline(view.firstName)}
            </AppText>
            {view.habitOnly ? null : (
              <View style={{ flexDirection: 'row', gap: t.space[4] }}>
                <View style={{ flex: 1 }}>
                  <RollingNumber
                    value={view.kcal}
                    variant="numberL"
                    rollOnMount={phase === 'reveal'}
                    onSettled={onSettled}
                    accessibilityLabel={`${view.kcal} calories a day`}
                  />
                  <AppText variant="caption" tone="secondary">
                    {C.kcal}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <RollingNumber
                    value={view.protein}
                    variant="numberL"
                    rollOnMount={phase === 'reveal'}
                    accessibilityLabel={`${view.protein} grams of protein a day`}
                  />
                  <AppText variant="caption" tone="secondary">
                    {C.protein} · {C.perKg(view.proteinPerKg)}
                  </AppText>
                </View>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {view.days.map((d, i) => (
                <Animated.View
                  key={d.date}
                  entering={fade(i * motion.stagger)}
                  style={{ alignItems: 'center', gap: t.space[1], flex: 1 }}
                >
                  <AppText variant="micro" tone={d.isToday ? 'accent' : 'tertiary'}>
                    {d.label}
                  </AppText>
                  <View
                    style={{
                      minHeight: 40,
                      minWidth: 40,
                      paddingHorizontal: t.space[1],
                      borderRadius: t.radius.chip,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: d.session ? t.c.accent.tint : t.c.bg.sunken,
                    }}
                  >
                    <AppText
                      variant="caption"
                      tone={d.session ? 'primary' : 'tertiary'}
                      align="center"
                      numberOfLines={2}
                    >
                      {d.session ?? '—'}
                    </AppText>
                  </View>
                </Animated.View>
              ))}
            </View>
            {view.tomorrow.length > 0 ? (
              <Animated.View entering={fade(view.days.length * motion.stagger)} style={{ gap: t.space[2] }}>
                <AppText variant="micro" tone="secondary">
                  {C.tomorrow}
                </AppText>
                {view.tomorrow.map((x) => (
                  <View key={`${x.time}${x.title}`} style={{ flexDirection: 'row', gap: t.space[3] }}>
                    <AppText variant="caption" tone="secondary" style={{ width: 64, fontVariant: ['tabular-nums'] }}>
                      {x.time}
                    </AppText>
                    <AppText variant="body" style={{ flex: 1 }}>
                      {x.title}
                    </AppText>
                  </View>
                ))}
              </Animated.View>
            ) : null}
            {view.firstPing ? (
              <Animated.View
                entering={
                  reduced
                    ? FadeIn.duration(S.crossFade).reduceMotion(KEEP_UNDER_REDUCED_MOTION)
                    : SlideInDown.duration(S.revealPingCard).delay(S.revealNumber)
                }
              >
                <Card sunken style={{ gap: t.space[1] }}>
                  <AppText variant="caption" tone="secondary">
                    {C.pingPreview(view.firstPing.when)}
                  </AppText>
                  <AppText variant="button">{view.firstPing.title}</AppText>
                  <AppText variant="body" tone="secondary">
                    {view.firstPing.body}
                  </AppText>
                </Card>
              </Animated.View>
            ) : null}
            {lib.mode === 'sample' ? (
              <AppText variant="caption" tone="tertiary" align="center">
                {TODAY_COPY.sampleData}
              </AppText>
            ) : null}
            <AppText variant="caption" tone="tertiary" align="center">
              {C.disclaimer}
            </AppText>
          </>
        ) : null}
      </View>
      {phase !== 'done' ? (
        <Tap
          accessibilityLabel={C.skipHint}
          feedback="none"
          scale={false}
          onPress={skip}
          style={StyleSheet.absoluteFill}
        >
          <View />
        </Tap>
      ) : null}
    </Screen>
  );
}
