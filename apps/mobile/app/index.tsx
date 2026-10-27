// Entry: onboarding until a plan exists, then Today.
import { Redirect } from 'expo-router';
import { useApp } from '@/src/state/AppState';

export default function Index() {
  const { status } = useApp();
  if (status === 'ready') return <Redirect href="/today" />;
  return <Redirect href="/welcome" />;
}
