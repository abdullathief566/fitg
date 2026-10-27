// Shown only if the app can't open its database or read its plan on launch. There is always a way out: starting
// over keeps the app usable (Settings is unreachable from here).
import { View } from 'react-native';
import { useApp } from '@/src/state/AppState';
import { useTheme } from '@/src/ui/theme';
import { AppText } from '@/src/ui/AppText';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Screen } from '@/src/ui/Screen';
import { ERRORS, SETTINGS_COPY } from '@/src/copy/ui';

export function BootError() {
  const { error, startOver } = useApp();
  const t = useTheme();
  return (
    <Screen
      footer={<PrimaryButton label={SETTINGS_COPY.startOver} variant="secondary" onPress={() => void startOver()} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: t.space[3] }}>
        <AppText variant="displayM">{ERRORS.boot}</AppText>
        <AppText variant="body" tone="secondary">
          {SETTINGS_COPY.startOverHint}
        </AppText>
        {__DEV__ && error ? (
          <AppText variant="caption" tone="tertiary">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
