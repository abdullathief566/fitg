// Render inside the theme (light by default) and the safe-area context the screens expect.
import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, type Appearance } from '../src/ui/theme';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

export async function renderThemed(ui: ReactElement, appearance: Appearance = 'light') {
  return await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider appearance={appearance}>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}
