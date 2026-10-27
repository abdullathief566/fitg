// P1 Progress (Phase 2 stub): the 90-day journey bar and the week-1 line. Streaks, strength and the share card come
// in Phase 7.
import { View } from 'react-native';
import { daysBetween, localDateOf, pn } from '@fitg/engine';
import { PROGRESS_COPY as C } from '@/src/copy/ui';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { JourneyBar } from '@/src/ui/JourneyBar';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Progress() {
  const t = useTheme();
  const { snapshot, now } = useApp();
  const profile = snapshot?.profile;
  const day = profile?.journeyStartedAt ? daysBetween(profile.journeyStartedAt, localDateOf(now(), profile.tz)) + 1 : 1;
  return (
    <Screen scroll testID="progress">
      <View style={{ gap: t.space[5], paddingTop: t.space[4] }}>
        <AppText variant="displayL" accessibilityRole="header">
          {C.title}
        </AppText>
        <Card style={{ gap: t.space[3] }}>
          <JourneyBar day={pn(day)} />
        </Card>
        <AppText variant="bodyL" tone="secondary">
          {C.week1}
        </AppText>
      </View>
    </Screen>
  );
}
