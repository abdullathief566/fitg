/**
 * ScreenEdgeGlow — Lightweight ambient edge glow for voice states.
 *
 * Only renders top + bottom gradients (no sides/corners) for a clean,
 * subtle vignette effect with minimal GPU cost.
 */

import React, { useEffect } from "react";
import { AppState, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import type { OrbState } from "./VoiceOrb";

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

/* Very soft, transparent colors — barely visible at rest */
const EDGE_COLOR = "rgba(16, 185, 129, 0.18)";
const EDGE_MID = "rgba(16, 185, 129, 0.06)";
const CLEAR = "transparent";

const GLOW_HEIGHT = 120;

interface ScreenEdgeGlowProps {
  state: OrbState;
  audioLevel?: number;
}

function ScreenEdgeGlowInner({ state }: ScreenEdgeGlowProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(opacity);

    switch (state) {
      case "idle":
      case "wake_listening":
        opacity.value = withTiming(0, { duration: 500 });
        break;

      case "listening":
        opacity.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          true
        );
        break;

      case "thinking":
        opacity.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.quad) })
          ),
          -1,
          true
        );
        break;

      case "speaking":
        opacity.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          true
        );
        break;
    }
  }, [state]);

  // Heat/battery: stop the animated gradient loop when the app is backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        cancelAnimation(opacity);
        opacity.value = 0;
      }
    });
    return () => sub.remove();
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <>
      {/* Top glow */}
      <AnimatedGradient
        colors={[EDGE_COLOR, EDGE_MID, CLEAR]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.top, animStyle]}
        pointerEvents="none"
      />
      {/* Bottom glow */}
      <AnimatedGradient
        colors={[EDGE_COLOR, EDGE_MID, CLEAR]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={[styles.bottom, animStyle]}
        pointerEvents="none"
      />
    </>
  );
}

const ScreenEdgeGlow = React.memo(ScreenEdgeGlowInner);
export default ScreenEdgeGlow;

const styles = StyleSheet.create({
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
    zIndex: 999,
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
    zIndex: 999,
  },
});
