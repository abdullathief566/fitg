// Sumi v2 — single haptics service (DESIGN-BIBLE §1.5)
//
// Rules: a haptic ALWAYS accompanies a visible change; fire at gesture
// thresholds, never continuously; never on screen mount. Success fires ON the
// checkmark keyframe, never the tap.
//
// All haptics in the app route through here so one global flag (user pref /
// reduced-motion) can silence everything.

import * as Haptics from "expo-haptics";

let enabled = true;

/** Global kill switch — wire to the user's Settings pref + Reduce Motion. */
export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

function fire(fn: () => Promise<void>) {
  if (!enabled) return;
  // Haptics can reject on web / simulators / devices without engines — never
  // let that surface to the UI.
  fn().catch(() => {});
}

export const haptics = {
  /** Tab switch, picker tick, chart-scrub point change. */
  selection: () => fire(() => Haptics.selectionAsync()),

  /** Button press-down, toggle, swipe-action snap. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Sheet snaps to detent, pull-to-refresh trigger, card expand. */
  detent: () =>
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Hero number transitions state (safe→careful etc.). */
  stateShift: () =>
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),

  /** Money moved, goal hit, expense logged — on the checkmark keyframe. */
  success: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    ),

  /** Destructive confirm, failed validation (with shake, same frame). */
  warning: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    ),

  /** Hard failure from a server/auth call. */
  error: () =>
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    ),
};

export default haptics;
