// PulseDot — the coach's presence (motion.md §0). Idle: opacity 0.6 ↔ 1 on a 2.4 s sine. Thinking: scale 1 ↔ 1.3
// at 0.9 s with a 40% halo. Done: a small check. One shared value; cancelled when hidden (heat discipline).
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Check } from './icons';
import { motion } from '@/constants/motion';
import { easing, useLoopActive } from './motion';
import { useTheme } from './theme';

export type PulseState = 'idle' | 'thinking' | 'done' | 'off';

const S = motion.signature;

export function PulseDot({ state = 'idle', size = 8 }: { state?: PulseState; size?: 8 | 10 }) {
  const t = useTheme();
  const active = useLoopActive();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active || state === 'off' || state === 'done') {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    const half = (state === 'thinking' ? S.pulseThinking : S.pulseIdle) / 2;
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: half, easing: easing.standard }),
          withTiming(0, { duration: half, easing: easing.standard }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [active, state, pulse]);

  const dotStyle = useAnimatedStyle(() => {
    const p = pulse.get();
    return state === 'thinking'
      ? { transform: [{ scale: 1 + (S.pulseThinkingScale - 1) * p }], opacity: 1 }
      : { opacity: S.pulseIdleMinOpacity + (1 - S.pulseIdleMinOpacity) * p };
  });
  const haloStyle = useAnimatedStyle(() => ({
    opacity: state === 'thinking' ? 0.4 * pulse.get() : 0,
    transform: [{ scale: 1 + pulse.get() }],
  }));

  if (state === 'off') return null;
  if (state === 'done') {
    return (
      <View accessible={false} style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={10} strokeWidth={3} color={t.c.state.done} />
      </View>
    );
  }
  const round = { width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.accent.primary };
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      <Animated.View style={[round, { position: 'absolute' }, haloStyle]} />
      <Animated.View style={[round, dotStyle]} />
    </View>
  );
}
