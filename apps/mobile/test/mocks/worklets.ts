// Stand-in for react-native-worklets in Jest: there is no UI thread, so "schedule on the RN thread" just calls.
export const scheduleOnRN = <A extends unknown[]>(fn: (...args: A) => unknown, ...args: A) => {
  fn(...args);
};
