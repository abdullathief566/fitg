// Jest setup (jest-expo): expo-router hooks that need no navigator. Reanimated and Worklets are mapped to the small
// stand-ins in test/mocks (package.json → jest.moduleNameMapper).
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
