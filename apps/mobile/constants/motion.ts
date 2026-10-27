// Motion tokens (tokens.md §4) plus the named signature timings from motion.md §1. No literal durations in
// components: they come from here.
export const motion = {
  duration: { micro: 120, standard: 240, emphasized: 400, reveal: 700, celebrate: 1200 },
  /** Cubic-bezier control points, for `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
    enter: [0, 0, 0.2, 1],
    linear: [0, 0, 1, 1],
  },
  /** Reanimated 4 duration-based springs. */
  spring: {
    press: { duration: 300, dampingRatio: 0.8 },
    pop: { duration: 420, dampingRatio: 0.6 },
    settle: { duration: 500, dampingRatio: 1 },
    sheet: { damping: 80, stiffness: 500 },
  },
  stagger: 50,
  /** Entrance stagger stops after this many items; the rest appear at once (motion.md §2). */
  staggerCap: 6,
  pressScale: 0.97,
  pressScaleGym: 0.95,

  signature: {
    // #1 Plan reveal: 3 live steps × 300 ms + 300 ms settle = 1.2 s of "thinking".
    revealStep: 300,
    revealSettle: 300,
    revealThinking: 1200,
    revealNumber: 700,
    revealDigitStagger: 25,
    revealChip: 400,
    revealChipDamping: 0.75,
    revealPingCard: 240,
    // #2 / #4
    checkDraw: 220,
    confetti: 900,
    // #7 NextUp card change
    nextUpExit: 200,
    nextUpEnter: 400,
    nextUpEnterDamping: 0.8,
    // Reduced-motion fallback for every signature animation.
    crossFade: 200,
    // PulseDot (motion.md §0)
    pulseIdle: 2400,
    pulseThinking: 900,
    pulseDone: 150,
    pulseIdleMinOpacity: 0.6,
    pulseThinkingScale: 1.3,
    // CoachBubble typewriter
    typewriterPerChar: 18,
    typewriterMax: 1200,
    // Number changes (AnimatedNumber) and skeletons (motion.md §2)
    numberChange: 500,
    skeletonPulse: 1000,
    // O0 welcome: the demo NextUp card shows each example this long.
    welcomeDemoCycle: 2800,
    // Onboarding progress line
    progressLine: 240,
    // Ambient tint (#8, Phase 4+)
    ambientLoop: 20000,
  },
} as const;
