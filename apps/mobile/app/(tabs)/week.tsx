// T2 Week: a strip of days per week; each shows the workout chip (or Rest) and the day's meals. Tap → day detail.
import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { WEEK_COPY } from '@/src/copy/ui';
import { weekView } from '@/src/domain/week';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { Tap } from '@/src/ui/Pressable';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Week() {
  const t = useTheme();
  const { snapshot, lib, now, tick } = useApp();
  const sections = useMemo(() => (snapshot ? weekView(snapshot, lib, now()) : []), [snapshot, lib, now, tick]);
  return (
    <Screen scroll testID="week">
      <View style={{ gap: t.space[6], paddingTop: t.space[4] }}>
        {sections.map((section) => (
          <View key={section.weekStart} style={{ gap: t.space[3] }}>
            <AppText variant="displayM" accessibilityRole="header">
              {section.title}
            </AppText>
            {section.days.map((d) => (
              <Tap
                key={d.date}
                accessibilityLabel={`${d.label}. ${d.session ? d.session.name : WEEK_COPY.rest}. ${d.meals.join(', ')}`}
                onPress={() => router.push(`/day/${d.date}`)}
                scale={false}
              >
                <Card
                  padding={t.space[4]}
                  style={{
                    gap: t.space[2],
                    opacity: d.isPast ? 0.55 : 1,
                    borderWidth: d.isToday ? 1.5 : 0,
                    borderColor: t.c.accent.primary,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                    <AppText variant="button" style={{ flex: 1 }}>
                      {d.label}
                    </AppText>
                    <View
                      style={{
                        paddingHorizontal: t.space[3],
                        paddingVertical: t.space[1],
                        borderRadius: t.radius.pill,
                        backgroundColor: d.session ? t.c.accent.tint : t.c.state.restTint,
                      }}
                    >
                      <AppText variant="caption" tone={d.session ? 'accent' : 'secondary'}>
                        {d.session ? d.session.name : WEEK_COPY.rest}
                      </AppText>
                    </View>
                  </View>
                  {d.session?.movedFrom ? (
                    <AppText variant="caption" tone="careful">
                      {WEEK_COPY.moved(d.session.movedFrom)}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" tone="secondary" numberOfLines={2}>
                    {d.meals.join(' · ')}
                  </AppText>
                </Card>
              </Tap>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
