// A small stand-in for react-native-reanimated in Jest: the UI tests check what renders, not animation physics.
// Covers exactly the API the app uses; animations jump to their target and completion callbacks fire.
import { Text, View } from 'react-native';
import type { ComponentType } from 'react';

type Done = ((finished: boolean) => void) | undefined;

export const useSharedValue = <T,>(init: T) => {
  let v = init;
  return {
    get: () => v,
    set: (next: T) => {
      v = next;
    },
    get value() {
      return v;
    },
    set value(next: T) {
      v = next;
    },
  };
};
export const useAnimatedStyle = <T,>(fn: () => T) => fn();
export const useAnimatedProps = <T,>(fn: () => T) => fn();
export const withTiming = <T,>(to: T, _cfg?: unknown, done?: Done) => {
  done?.(true);
  return to;
};
export const withSpring = <T,>(to: T, _cfg?: unknown, done?: Done) => {
  done?.(true);
  return to;
};
export const withDelay = <T,>(_ms: number, v: T) => v;
export const withSequence = <T,>(...vs: T[]) => vs[vs.length - 1];
export const withRepeat = <T,>(v: T) => v;
export const cancelAnimation = () => undefined;
export const useReducedMotion = () => false;
export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

const curve = () => (t: number) => t;
export const Easing = {
  bezier: curve,
  linear: (t: number) => t,
  out: () => curve(),
  cubic: (t: number) => t,
  inOut: () => curve(),
};

class Builder {
  duration() {
    return this;
  }
  delay() {
    return this;
  }
  springify() {
    return this;
  }
  dampingRatio() {
    return this;
  }
  reduceMotion() {
    return this;
  }
}
const builder = () => {
  const b = new Builder();
  return Object.assign(b, {
    duration: () => b,
    delay: () => b,
    springify: () => b,
    dampingRatio: () => b,
    reduceMotion: () => b,
  });
};
export const FadeIn = builder();
export const FadeOut = builder();
export const FadeInDown = builder();
export const FadeOutUp = builder();
export const SlideInDown = builder();
export const LinearTransition = builder();

const AnimatedView = ({ entering: _e, exiting: _x, layout: _l, ...rest }: Record<string, unknown>) => (
  <View {...rest} />
);
function createAnimatedComponent(C: ComponentType<Record<string, unknown>>) {
  return function AnimatedComponent({ animatedProps, ...rest }: Record<string, unknown> & { animatedProps?: object }) {
    return <C {...rest} {...(animatedProps ?? {})} />;
  };
}
const Animated = { View: AnimatedView, Text, createAnimatedComponent };
export default Animated;
