// T1 Today (screens.md wireframe): date + journey chip, the coach line, exactly ONE NextUpCard, today's timeline, the
// protein bar (protein dots in habit-only mode). Card actions run engine commands on the phone.
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { NextStep, NextStepAction, PlanCommandBody } from '@fitg/engine';
import { haptics } from '@/lib/haptics';
import { ERRORS, TODAY_COPY } from '@/src/copy/ui';
import { todayView, type TodayView } from '@/src/domain/today';
import { timeLabel } from '@/src/domain/format';
import { useApp } from '@/src/state/AppState';
import { track } from '@/src/analytics/analytics';
import { AppText } from '@/src/ui/AppText';
import { CoachBubble } from '@/src/ui/CoachBubble';
import { JourneyChip } from '@/src/ui/JourneyBar';
import { NextUpCard } from '@/src/ui/NextUpCard';
import { ProteinBar, ProteinDots } from '@/src/ui/ProteinBar';
import { Tap } from '@/src/ui/Pressable';
import { Screen } from '@/src/ui/Screen';
import { TimelineRow } from '@/src/ui/TimelineRow';
import { useTheme } from '@/src/ui/theme';

/** NextStep actions this build can do. Swap, off-plan logging, Home Food and check-in arrive in later phases. */
const SUPPORTED = new Set([
  'start',
  'resume',
  'later_30',
  'skip',
  'ate',
  'got_it',
  'prep_done',
  'see_week',
  'see_tomorrow',
]);

export function supportedActions(step: NextStep): NextStepAction[] {
  return step.actions.filter((a) => SUPPORTED.has(a.id));
}

export function commandFor(step: NextStep, action: NextStepAction): PlanCommandBody | undefined {
  const id = step.refId;
  if (!id) return undefined;
  if (step.kind === 'workout') {
    if (action.id === 'later_30') return { kind: 'LaterSession', sessionId: id, minutes: '30' };
    if (action.id === 'skip') return { kind: 'SkipSession', sessionId: id };
  }
  if (step.kind === 'meal') {
    if (action.id === 'ate') return { kind: 'SetMealStatus', itemId: id, status: 'eaten' };
    if (action.id === 'skip') return { kind: 'SetMealStatus', itemId: id, status: 'skipped' };
  }
  return undefined;
}

export interface TodayContentProps {
  view: TodayView;
  tz: string;
  /** The avatar letter (opens Settings). */
  initial: string;
  /** Show the "sample food values" line (development bundle). */
  sampleData: boolean;
  onAction: (a: NextStepAction) => void;
  onOpenSettings: () => void;
  onOpenWorkout: (sessionId: string) => void;
  notice?: string;
  /** An action is running: the card's buttons are disabled until it finishes (no double taps). */
  busy?: boolean;
}

/** Today's content as a pure function of its props (rendered by tests at every hour of a day). */
export function TodayContent({
  view,
  tz,
  initial,
  sampleData,
  onAction,
  onOpenSettings,
  onOpenWorkout,
  notice,
  busy = false,
}: TodayContentProps) {
  const t = useTheme();
  const step = view.next;
  return (
    <View style={{ gap: t.space[5], paddingTop: t.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <AppText variant="button" style={{ flex: 1 }}>
          {view.dateLabel}
        </AppText>
        <JourneyChip day={view.journeyDay} />
        <Tap
          testID="open-settings"
          accessibilityLabel="Settings"
          onPress={onOpenSettings}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.c.accent.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="button" tone="accent">
              {initial}
            </AppText>
          </View>
        </Tap>
      </View>
      <CoachBubble text={`${view.greeting} ${TODAY_COPY.coachLine}`} />
      {sampleData ? (
        <AppText variant="caption" tone="tertiary">
          {TODAY_COPY.sampleData}
        </AppText>
      ) : null}
      <NextUpCard
        step={step}
        {...(step.time ? { timeLabel: timeLabel(step.time, tz) } : {})}
        actions={supportedActions(step)}
        onAction={onAction}
        busy={busy}
        state={step.kind === 'rest' || step.kind === 'tomorrow' ? 'upcoming' : 'now'}
      />
      {notice ? (
        <AppText variant="caption" tone="careful" accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      ) : null}
      {view.timeline.length > 0 ? (
        <View>
          <AppText variant="micro" tone="secondary" style={{ marginBottom: t.space[1] }}>
            {TODAY_COPY.timeline}
          </AppText>
          {view.timeline.map((x) => (
            <TimelineRow
              key={x.key}
              time={x.time}
              title={x.title}
              {...(x.detail ? { detail: x.detail } : {})}
              status={x.status}
              {...(x.kind === 'workout' ? { onPress: () => onOpenWorkout(x.refId) } : {})}
            />
          ))}
        </View>
      ) : null}
      {view.habitOnly && view.proteinFoods ? <ProteinDots foods={view.proteinFoods} /> : null}
      {!view.habitOnly && view.protein ? <ProteinBar {...view.protein} /> : null}
    </View>
  );
}

export default function TodayScreen() {
  const { snapshot, lib, clock, local, updateLocal, runPlanCommand } = useApp();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  // `clock` is a value that changes every 30 s and on foreground, so the view follows the time of day.
  const view = useMemo(
    () => (snapshot ? todayView(snapshot, lib, clock, local) : undefined),
    [snapshot, lib, clock, local],
  );
  if (!snapshot || !view) return <Screen>{null}</Screen>;

  const onAction = async (action: NextStepAction) => {
    if (running.current) return; // a second tap while the first is still saving
    const step = view.next;
    setNotice(undefined);
    switch (action.id) {
      case 'start':
      case 'resume':
        if (step.refId) router.push(`/workout/${step.refId}`);
        return;
      case 'see_week':
      case 'see_tomorrow':
        router.push('/week');
        return;
      case 'got_it':
        // One card can cover several moved sessions: its refId lists them all.
        if (step.refId) updateLocal({ seenComebackIds: [...local.seenComebackIds, ...step.refId.split(',')] });
        return;
      case 'prep_done':
        if (step.refId) updateLocal({ doneTaskKeys: [...local.doneTaskKeys, step.refId] });
        return;
    }
    const cmd = commandFor(step, action);
    if (!cmd) return;
    if (action.id === 'ate') haptics.ate();
    running.current = true;
    setBusy(true);
    try {
      const reject = await runPlanCommand(cmd);
      if (reject) setNotice(reject === 'stale' ? ERRORS.stale('Today') : ERRORS.generic);
      else if (cmd.kind === 'SetMealStatus') track('meal_status', { status: cmd.status, source: 'one_tap' });
    } catch {
      setNotice(ERRORS.generic);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen scroll testID="today">
      <TodayContent
        view={view}
        tz={snapshot.profile.tz}
        initial={(snapshot.profile.firstName ?? 'F').charAt(0).toUpperCase()}
        sampleData={lib.mode === 'sample'}
        onAction={(a) => void onAction(a)}
        onOpenSettings={() => router.push('/settings')}
        onOpenWorkout={(id) => router.push(`/workout/${id}`)}
        busy={busy}
        {...(notice ? { notice } : {})}
      />
    </Screen>
  );
}
