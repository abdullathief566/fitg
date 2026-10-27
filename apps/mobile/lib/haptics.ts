// FitG's single haptics service (tokens.md §6) — the ONLY module allowed to import expo-haptics.
//
// Rules: a haptic always accompanies a visible change; it fires on the keyframe the eye sees (check drawn, number
// settled), never on mount, scroll, or continuously. A global kill switch (Settings → haptics) silences everything;
// Reduce Motion does not (haptics stay on, motion.md §3).
import * as Haptics from 'expo-haptics';

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

function fire(fn: () => Promise<void>): void {
  if (!enabled) return;
  // Haptics can reject on simulators or devices without an engine; never surface that to the UI.
  fn().catch(() => {});
}

function later(ms: number, fn: () => void): void {
  setTimeout(fn, ms);
}

const impact = (style: Haptics.ImpactFeedbackStyle) => () => fire(() => Haptics.impactAsync(style));

export const haptics = {
  /** Button press-down, ping action, chip select. */
  tap: impact(Haptics.ImpactFeedbackStyle.Light),
  /** Weight/reps +/−, picker tick, portion step, keypad key. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** Set done — on the check keyframe. */
  setDone: impact(Haptics.ImpactFeedbackStyle.Rigid),
  /** "Ate it" / "Cooked it". */
  ate: impact(Haptics.ImpactFeedbackStyle.Medium),
  /** Sheet detent, swap applied. */
  detent: impact(Haptics.ImpactFeedbackStyle.Medium),
  /** Rest timer: 10 s left (once). */
  restTenLeft: impact(Haptics.ImpactFeedbackStyle.Light),
  /** Rest timer end, in the app: Heavy twice, 120 ms apart. */
  restEnd: () => {
    impact(Haptics.ImpactFeedbackStyle.Heavy)();
    later(120, impact(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Workout complete, plan reveal settle — on the keyframe. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** PR: Success, then Heavy at +200 ms (the double hit). */
  pr: () => {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    later(200, impact(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Streak-week fill, comeback card, state shift. */
  soft: impact(Haptics.ImpactFeedbackStyle.Soft),
  /** Validation error — with a shake in the same frame. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

export default haptics;
