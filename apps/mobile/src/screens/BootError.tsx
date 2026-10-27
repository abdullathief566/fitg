// Shown only if the app can't open its database or bundle on launch (should never happen; Sentry gets it).
import { View } from 'react-native';
import { useApp } from '@/src/state/AppState';
import { useTheme } from '@/src/ui/theme';
import { AppText } from '@/src/ui/AppText';
import { Screen } from '@/src/ui/Screen';
import { ERRORS } from '@/src/copy/ui';

export function BootError() {
  const { error } = useApp();
  const t = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: t.space[3] }}>
        <AppText variant="displayM">{ERRORS.generic}</AppText>
        {__DEV__ && error ? (
          <AppText variant="caption" tone="secondary">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
