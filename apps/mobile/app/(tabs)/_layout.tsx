// The four tabs: Today · Week · Progress · Coach (screens.md). Settings opens from the avatar on Today.
import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { CalendarCheck2, CalendarDays, MessageCircle, TrendingUp } from '@/src/ui/icons';
import { useApp } from '@/src/state/AppState';
import { useTheme } from '@/src/ui/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { status } = useApp();
  // The tabs only make sense with a plan (e.g. Back after "Start over" must not land on an empty Today).
  if (status !== 'ready') return <Redirect href="/welcome" />;
  const icon = (Icon: typeof CalendarCheck2) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return (
        <Icon
          size={t.icon.md}
          color={typeof color === 'string' ? color : t.c.text.tertiary}
          strokeWidth={t.icon.stroke}
        />
      );
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.c.accent.deep,
        tabBarInactiveTintColor: t.c.text.tertiary,
        tabBarStyle: { backgroundColor: t.c.bg.surface, borderTopColor: t.c.hairline, minHeight: 56 },
        tabBarLabelStyle: { fontFamily: t.fonts.body.semibold, fontSize: 11 },
        sceneStyle: { backgroundColor: t.c.bg.base },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon(CalendarCheck2) }} />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon(TrendingUp) }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: icon(MessageCircle) }} />
    </Tabs>
  );
}
