// A day from the Week view: the same timeline Today shows, for any planned date.
import { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from '@/src/ui/icons';
import { localDateOf, toInstant } from '@fitg/engine';
import { WEEK_COPY } from '@/src/copy/ui';
import { dayLabel } from '@/src/domain/format';
import { todayView } from '@/src/domain/today';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Tap } from '@/src/ui/Pressable';
import { Screen } from '@/src/ui/Screen';
import { TimelineRow } from '@/src/ui/TimelineRow';
import { useTheme } from '@/src/ui/theme';

export default function DayDetail() {
  const t = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { snapshot, lib, now, local, tick } = useApp();
  const items = useMemo(() => {
    if (!snapshot || !date) return [];
    // The day's timeline as Today would show it: today at the real time, a past day as of its last minute (open items
    // read "earlier"), a future day as of its first minute (everything coming up).
    const tz = snapshot.profile.tz;
    const today = localDateOf(now(), tz);
    const at = date === today ? now() : toInstant(date, date < today ? '23:59' : '00:01', tz);
    return todayView(snapshot, lib, at, local).timeline;
  }, [snapshot, lib, date, now, local, tick]);
  return (
    <Screen scroll>
      <View style={{ gap: t.space[4], paddingTop: t.space[2] }}>
        <Tap
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -t.space[3] }}
        >
          <ChevronLeft size={t.icon.md} color={t.c.text.primary} />
        </Tap>
        <AppText variant="displayL" accessibilityRole="header">
          {date ? dayLabel(date) : ''}
        </AppText>
        {items.length === 0 ? (
          <AppText variant="body" tone="secondary">
            {WEEK_COPY.notBuilt}
          </AppText>
        ) : (
          items.map((x) => (
            <TimelineRow
              key={x.key}
              time={x.time}
              title={x.title}
              {...(x.detail ? { detail: x.detail } : {})}
              status={x.status === 'now' ? 'upcoming' : x.status}
              {...(x.kind === 'workout' ? { onPress: () => router.push(`/workout/${x.refId}`) } : {})}
            />
          ))
        )}
      </View>
    </Screen>
  );
}
