// C1 Coach (Phase 2 stub): the chat arrives with the real AI in Phase 5; the plan already runs without it.
import { View } from 'react-native';
import { COACH_COPY as C } from '@/src/copy/ui';
import { AppText } from '@/src/ui/AppText';
import { CoachBubble } from '@/src/ui/CoachBubble';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Coach() {
  const t = useTheme();
  return (
    <Screen scroll testID="coach">
      <View style={{ gap: t.space[5], paddingTop: t.space[4] }}>
        <AppText variant="displayL" accessibilityRole="header">
          {C.title}
        </AppText>
        <CoachBubble text={C.soon} />
      </View>
    </Screen>
  );
}
