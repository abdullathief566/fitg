// O12 Permissions & privacy: the consent checkbox, then the notifications ask (needed) with what / when / why.
// Location was offered on the equipment step (pin your gym); nothing here requires a permission to continue.
import { useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Square, SquareCheck } from '@/src/ui/icons';
import { URLS } from '@/constants/brand';
import { PERMISSIONS_COPY as C } from '@/src/copy/ui';
import { PROGRESS_TOTAL, STEPS } from '@/src/domain/onboarding';
import { useApp } from '@/src/state/AppState';
import { track } from '@/src/analytics/analytics';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { PermissionExplainer, type PermissionStatus } from '@/src/ui/PermissionExplainer';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Tap } from '@/src/ui/Pressable';
import { StepScaffold } from '@/src/ui/StepScaffold';
import { useTheme } from '@/src/ui/theme';

async function askNotifications(): Promise<PermissionStatus> {
  if (Platform.OS === 'android') {
    // Android: the system's POST_NOTIFICATIONS permission (Android 13+; older versions grant it at install). Loading
    // expo-notifications here would crash Expo Go on Android, which no longer ships its push module (SDK 53+).
    if (Number(Platform.Version) < 33) return 'granted';
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }
  // iOS: loaded on demand, only at the moment we ask.
  const Notifications = await import('expo-notifications');
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return asked.granted ? 'granted' : 'denied';
}

/** Granted already? (Android can only tell granted / not granted without asking.) */
async function notificationsGranted(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  const Notifications = await import('expo-notifications');
  return (await Notifications.getPermissionsAsync()).granted;
}

export default function Permissions() {
  const t = useTheme();
  const { answers, updateAnswers, local, updateLocal } = useApp();
  const [notif, setNotif] = useState<PermissionStatus>(answers.notifications);
  const record = (status: PermissionStatus) => {
    setNotif(status);
    updateAnswers({ notifications: status });
    updateLocal({ permissions: { ...local.permissions, notifications: status } });
  };
  // The saved answer can be stale (revoked in system Settings): read the real status once on open.
  useEffect(() => {
    void notificationsGranted()
      .then((granted) => {
        if (granted) record('granted');
        else if (notif === 'granted') record('undetermined');
      })
      .catch(() => undefined);
    // Once, on open.
  }, []);
  // Some hosts (Expo Go on Android) never hand the system dialog's answer back to the request: re-read the status
  // whenever the app is active again (the dialog pauses it), so the card always catches up.
  useEffect(() => {
    if (notif === 'granted') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void notificationsGranted()
        .then((granted) => {
          if (granted) record('granted');
        })
        .catch(() => undefined);
    });
    return () => sub.remove();
  });
  const allow = async () => {
    let status: PermissionStatus;
    try {
      status = await askNotifications();
    } catch {
      status = 'denied';
    }
    record(status);
    track('notif_permission', { status });
  };
  const skip = () => {
    setNotif('denied');
    updateAnswers({ notifications: 'denied' });
    track('notif_permission', { status: 'skipped' });
  };
  return (
    <StepScaffold
      step={STEPS.length + 1}
      total={PROGRESS_TOTAL}
      title={C.title}
      nextLabel={C.cta}
      problem={answers.consent ? null : C.needConsent}
      onBack={() => router.back()}
      onNext={() => router.push('/reveal')}
    >
      <Card hairline style={{ gap: t.space[3] }}>
        <AppText variant="displayS">{C.consentTitle}</AppText>
        <AppText variant="body" tone="secondary">
          {C.consent}
        </AppText>
        <Tap
          testID="consent"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: answers.consent }}
          accessibilityLabel={C.agree}
          feedback="selection"
          scale={false}
          onPress={() => updateAnswers({ consent: !answers.consent })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}
        >
          {answers.consent ? (
            <SquareCheck size={t.icon.md} color={t.c.accent.deep} />
          ) : (
            <Square size={t.icon.md} color={t.c.text.secondary} />
          )}
          <AppText variant="button">{C.agree}</AppText>
        </Tap>
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <PrimaryButton label={C.privacy} variant="quiet" onPress={() => void Linking.openURL(URLS.privacy)} />
          <PrimaryButton label={C.terms} variant="quiet" onPress={() => void Linking.openURL(URLS.terms)} />
        </View>
      </Card>
      <PermissionExplainer
        kind="notifications"
        required
        title={C.notifications.title}
        body={C.notifications.body}
        allowLabel={C.notifications.allow}
        skipLabel={C.notifications.skip}
        deniedLine={C.notifications.denied}
        status={notif}
        onAllow={() => void allow()}
        onSkip={skip}
      />
    </StepScaffold>
  );
}
