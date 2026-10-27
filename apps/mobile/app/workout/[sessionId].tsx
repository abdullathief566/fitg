// T3 Workout detail (read-only in Phase 2): every exercise with sets × reps at kg, the rest, and three form cues.
// "Start workout" becomes gym mode in Phase 4.
import { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from '@/src/ui/icons';
import { WORKOUT_COPY as C, WEEK_COPY } from '@/src/copy/ui';
import { workoutView } from '@/src/domain/workout';
import { useApp } from '@/src/state/AppState';
import { AppText } from '@/src/ui/AppText';
import { Card } from '@/src/ui/Card';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Tap } from '@/src/ui/Pressable';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function WorkoutDetail() {
  const t = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { snapshot, lib } = useApp();
  const view = useMemo(
    () => (snapshot && sessionId ? workoutView(snapshot, lib, sessionId) : undefined),
    [snapshot, lib, sessionId],
  );
  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: t.space[2] }}>
          <AppText variant="caption" tone="secondary" align="center">
            {C.soon}
          </AppText>
          <PrimaryButton label={C.start} size="gym" disabled onPress={() => undefined} />
        </View>
      }
    >
      <View style={{ gap: t.space[4], paddingTop: t.space[2] }}>
        <Tap
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -t.space[3] }}
        >
          <ChevronLeft size={t.icon.md} color={t.c.text.primary} />
        </Tap>
        {view ? (
          <>
            <View style={{ gap: t.space[1] }}>
              <AppText variant="displayL" accessibilityRole="header">
                {view.name}
              </AppText>
              <AppText variant="body" tone="secondary">
                {view.when} · about {view.durationMin} min · {view.exercises.length} exercises
              </AppText>
              {view.movedFrom ? (
                <AppText variant="caption" tone="careful">
                  {WEEK_COPY.moved(view.movedFrom)}
                </AppText>
              ) : null}
            </View>
            {view.exercises.some((e) => e.isMachine) ? (
              <AppText variant="body" tone="secondary">
                {C.whyMachine}
              </AppText>
            ) : null}
            {view.exercises.map((e) => (
              <Card key={e.order} style={{ gap: t.space[2] }} testID={`exercise-${e.order}`}>
                <AppText variant="micro" tone="tertiary">
                  {e.muscle}
                </AppText>
                <AppText variant="displayS">{e.name}</AppText>
                <AppText variant="numberM">
                  {C.sets(e.sets, e.reps)}
                  {e.kg !== undefined ? ` at ${e.kg} kg${e.perHand ? ' each' : ''}` : ''}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {C.rest(e.restSec)}
                </AppText>
                {e.cues.map((cue) => (
                  <View key={cue} style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <AppText variant="body" tone="accent">
                      •
                    </AppText>
                    <AppText variant="body" tone="secondary" style={{ flex: 1 }}>
                      {cue}
                    </AppText>
                  </View>
                ))}
              </Card>
            ))}
          </>
        ) : (
          <AppText variant="body" tone="secondary">
            {WEEK_COPY.notBuilt}
          </AppText>
        )}
      </View>
    </Screen>
  );
}
