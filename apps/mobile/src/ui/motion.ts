// Motion helpers. The heat discipline (motion.md §3): a looping animation runs only while its screen is focused, the
// app is in the foreground, and Reduce Motion is off; otherwise it is cancelled.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Easing, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { motion } from '@/constants/motion';

export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** True while looping animations may run. */
export function useLoopActive(): boolean {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const appActive = useAppActive();
  return focused && appActive && !reduced;
}

export const easing = {
  standard: Easing.bezier(...motion.easing.standard),
  exit: Easing.bezier(...motion.easing.exit),
  enter: Easing.bezier(...motion.easing.enter),
  linear: Easing.linear,
  outCubic: Easing.out(Easing.cubic),
};

/** Reduced-motion fallbacks are deliberate, short cross-fades, so they must not be switched off by the OS setting. */
export const KEEP_UNDER_REDUCED_MOTION = ReduceMotion.Never;
