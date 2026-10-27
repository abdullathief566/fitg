// Root: fonts load behind the splash screen, then the app state boots (SQLite, bundle, plan) and the theme follows
// the user's appearance setting.
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { Outfit_700Bold } from '@expo-google-fonts/outfit/700Bold';
import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit/800ExtraBold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { AppProvider, useApp } from '@/src/state/AppState';
import { initSentry } from '@/src/analytics/sentry';
import { ThemeProvider, useTheme } from '@/src/ui/theme';
import { BootError } from '@/src/screens/BootError';

void SplashScreen.preventAutoHideAsync();
initSentry();

function ThemedStack() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg.base } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workout/[sessionId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="day/[date]" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const { status, appearance } = useApp();
  const ready = fontsReady && status !== 'booting';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return <ThemeProvider appearance={appearance}>{status === 'error' ? <BootError /> : <ThemedStack />}</ThemeProvider>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <Root fontsReady={loaded || !!error} />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
