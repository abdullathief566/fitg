// O0 Welcome: the promise in one line, a demo NextUp card cycling three real-looking steps, one button.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { motion } from '@/constants/motion';
import { WELCOME } from '@/src/copy/ui';
import { track } from '@/src/analytics/analytics';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { PulseDot } from '@/src/ui/PulseDot';
import { Screen } from '@/src/ui/Screen';
import { KEEP_UNDER_REDUCED_MOTION, useLoopActive } from '@/src/ui/motion';
import { useTheme } from '@/src/ui/theme';

export default function Welcome() {
  const t = useTheme();
  const reduced = useReducedMotion();
  const active = useLoopActive();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setI((n) => (n + 1) % WELCOME.demo.length), motion.signature.welcomeDemoCycle);
    return () => clearInterval(timer);
  }, [active]);
  const demo = WELCOME.demo[i]!;
  const entering = reduced
    ? FadeIn.duration(motion.signature.crossFade).reduceMotion(KEEP_UNDER_REDUCED_MOTION)
    : FadeInDown.duration(motion.signature.nextUpEnter).springify().dampingRatio(motion.signature.nextUpEnterDamping);

  return (
    <Screen
      footer={
        <PrimaryButton
          label={WELCOME.cta}
          testID="welcome-cta"
          onPress={() => {
            track('onboarding_step', { step: 'welcome' });
            router.push('/step/1');
          }}
        />
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: t.space[8] }}>
        <View style={{ gap: t.space[3] }}>
          <AppText variant="displayXL" accessibilityRole="header">
            {WELCOME.headline}
          </AppText>
          <AppText variant="bodyL" tone="secondary">
            {WELCOME.sub}
          </AppText>
        </View>
        <View style={{ minHeight: 150 }} accessible accessibilityLabel={`Example: ${demo.title}. ${demo.line}`}>
          <Animated.View key={i} entering={entering} exiting={FadeOut.duration(motion.signature.crossFade)}>
            <Card elevated style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <PulseDot />
                <AppText variant="micro" tone="secondary">
                  {demo.eyebrow}
                </AppText>
              </View>
              <AppText variant="displayM">{demo.title}</AppText>
              <AppText variant="numberM">{demo.line}</AppText>
            </Card>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}
