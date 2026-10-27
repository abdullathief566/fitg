// Notification categories and their action buttons (signals-and-pings.md §4). Android shows at most 3 buttons,
// so every category has 1–3 actions. The app registers exactly these (expo-notifications setNotificationCategoryAsync).

export interface NotificationAction {
  id: string;
  title: string;
  /** Opens the app (gym mode, kitchen mode, swap sheet…) instead of acting in the background. */
  opensApp: boolean;
}

const act = (id: string, title: string, opensApp = false): NotificationAction => ({ id, title, opensApp });
const ATE_PREV = act('ate_prev', 'Yes, ate it');

const BASE: Record<string, NotificationAction[]> = {
  night_before: [act('ack', 'Got it'), act('change_time', 'Change time', true)],
  pre_gym: [act('start', 'Start', true), act('later_30', 'Later +30'), act('skip', 'Skip today')],
  post_gym: [act('ate', 'Ate it'), act('swap', 'Swap', true), act('not_now', 'Not now')],
  post_gym_fallback: [act('ate', 'Ate it'), act('swap', 'Swap', true), act('still_gym', 'Still at the gym')],
  pre_dinner: [act('cook', 'Start cooking', true), act('swap', 'Swap', true), act('eating_out', 'Eating out', true)],
  ready: [act('start', 'Start', true)],
};

/**
 * Ask variants (`<category>_ask`): the lowest-priority action (the last one) is replaced by "Yes, ate it".
 * night_before has only two buttons, so "Change time" is the one replaced.
 */
function askVariant(actions: NotificationAction[]): NotificationAction[] {
  return [...actions.slice(0, -1), ATE_PREV];
}

export const NOTIFICATION_CATEGORIES: Record<string, NotificationAction[]> = {
  ...BASE,
  night_before_ask: askVariant(BASE.night_before!),
  pre_gym_ask: askVariant(BASE.pre_gym!),
  post_gym_ask: askVariant(BASE.post_gym!),
  post_gym_fallback_ask: askVariant(BASE.post_gym_fallback!),
  pre_dinner_ask: askVariant(BASE.pre_dinner!),
};
