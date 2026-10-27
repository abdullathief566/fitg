// X1 Settings (Phase 2 basics): profile and targets, the plan, appearance, haptics, privacy links, and a developer
// section (time travel to test a whole day; start over). Subscription and permissions-fix rows arrive with Phase 7.
import { Alert, Linking, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { ChevronLeft } from '@/src/ui/icons';
import { localDateOf, normalizeSchedule, to12h, type Weekday } from '@fitg/engine';
import { URLS } from '@/constants/brand';
import { SETTINGS_COPY as C, STEP_COPY } from '@/src/copy/ui';
import { dayLabel, timeLabel } from '@/src/domain/format';
import { templateIdFor } from '@/src/domain/planner';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { Chip } from '@/src/ui/Chip';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Tap } from '@/src/ui/Pressable';
import { Screen } from '@/src/ui/Screen';
import { ChipRow } from '@/src/ui/StepScaffold';
import { useTheme } from '@/src/ui/theme';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR = 3_600_000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="micro" tone="secondary">
        {title}
      </AppText>
      <Card style={{ gap: t.space[3] }}>{children}</Card>
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const app = useApp();
  const { snapshot, lib } = app;
  const profile = snapshot?.profile;
  const targets = snapshot?.targets;
  const goal = STEP_COPY.goal.options.find((o) => o.value === profile?.goal)?.label;
  const schedule = profile ? normalizeSchedule(profile.gymSchedule) : [];
  const appNow = app.now();
  const tz = profile?.tz ?? app.tz;

  const confirmStartOver = () =>
    Alert.alert(C.startOver, C.startOverHint, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: C.startOver,
        style: 'destructive',
        onPress: () => {
          void app.startOver().then(() => router.replace('/welcome'));
        },
      },
    ]);

  return (
    <Screen scroll testID="settings">
      <View style={{ gap: t.space[5], paddingTop: t.space[2] }}>
        <Tap
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -t.space[3] }}
        >
          <ChevronLeft size={t.icon.md} color={t.c.text.primary} />
        </Tap>
        <AppText variant="displayL" accessibilityRole="header">
          {C.title}
        </AppText>

        {profile && targets ? (
          <Section title={C.profile}>
            <AppText variant="displayS">{profile.firstName ?? 'You'}</AppText>
            <AppText variant="body" tone="secondary">
              {goal}
            </AppText>
            {targets.displayMode === 'habit_only' ? (
              <>
                <AppText variant="body">{C.habitOnly}</AppText>
                <AppText variant="body" tone="secondary">
                  {C.support}
                </AppText>
              </>
            ) : (
              <AppText variant="numberM">
                {targets.kcal.toLocaleString('en-US')} kcal · {targets.proteinG} g protein
              </AppText>
            )}
          </Section>
        ) : null}

        {profile ? (
          <Section title={C.plan}>
            <AppText variant="body">{lib.templateNames.get(templateIdFor(profile)) ?? ''}</AppText>
            <AppText variant="body" tone="secondary">
              {schedule.map((s) => DAY_SHORT[s.weekday as Weekday]).join(' · ')} at{' '}
              {to12h(schedule[0]?.start ?? '18:00')}
            </AppText>
          </Section>
        ) : null}

        <Section title={C.appearance}>
          <ChipRow>
            {C.appearanceOptions.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={app.appearance === o.value}
                onPress={() => app.setAppearance(o.value)}
              />
            ))}
          </ChipRow>
          <AppText variant="caption" tone="secondary">
            {C.gymDark}
          </AppText>
        </Section>

        <Section title={C.haptics}>
          <ChipRow>
            <Chip label={C.on} selected={app.hapticsOn} onPress={() => app.setHapticsOn(true)} />
            <Chip label={C.off} selected={!app.hapticsOn} onPress={() => app.setHapticsOn(false)} />
          </ChipRow>
        </Section>

        <Section title={C.privacy}>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <PrimaryButton label="Privacy" variant="quiet" onPress={() => void Linking.openURL(URLS.privacy)} />
            <PrimaryButton label="Terms" variant="quiet" onPress={() => void Linking.openURL(URLS.terms)} />
          </View>
        </Section>

        <Section title={C.developer}>
          <AppText variant="displayS">{C.timeTravel}</AppText>
          <AppText variant="caption" tone="secondary">
            {C.timeTravelHint}
          </AppText>
          <AppText variant="numberM" testID="app-clock">
            {dayLabel(localDateOf(appNow, tz))} · {timeLabel(appNow, tz)}
          </AppText>
          <ChipRow>
            <Chip label="−1 h" selected={false} onPress={() => void app.setDevOffset(app.devOffsetMs - HOUR)} />
            <Chip label="+1 h" selected={false} onPress={() => void app.setDevOffset(app.devOffsetMs + HOUR)} />
            <Chip label="+6 h" selected={false} onPress={() => void app.setDevOffset(app.devOffsetMs + 6 * HOUR)} />
            <Chip label="+1 day" selected={false} onPress={() => void app.setDevOffset(app.devOffsetMs + 24 * HOUR)} />
            <Chip label={C.resetClock} selected={app.devOffsetMs === 0} onPress={() => void app.setDevOffset(0)} />
          </ChipRow>
          <PrimaryButton label={C.startOver} variant="secondary" onPress={confirmStartOver} />
          <AppText variant="caption" tone="tertiary">
            {C.version(Constants.expoConfig?.version ?? '0.1.0', `${lib.bundleVersion} (${lib.mode})`)}
          </AppText>
        </Section>
      </View>
    </Screen>
  );
}
