// JourneyBar (stub for Phase 2): "Day N of 90" with the milestone ticks at 14, 42 and 90 (components.md).
// Phase 7 builds the full Progress tab around it.
import { View } from 'react-native';
import type { PlanNumber } from '@fitg/engine';
import { AppText } from './AppText';
import { useTheme } from './theme';

export const JOURNEY_DAYS = 90;
export const MILESTONES = [14, 42, 90] as const;

export function JourneyChip({ day }: { day: PlanNumber }) {
  const t = useTheme();
  const shown = Math.min(day, JOURNEY_DAYS);
  return (
    <View
      accessible
      accessibilityLabel={`Day ${shown} of ${JOURNEY_DAYS}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        paddingHorizontal: t.space[3],
        paddingVertical: t.space[1],
        borderRadius: t.radius.pill,
        backgroundColor: t.c.bg.sunken,
      }}
    >
      <AppText variant="caption" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
        Day {shown}/{JOURNEY_DAYS}
      </AppText>
    </View>
  );
}

export function JourneyBar({ day }: { day: PlanNumber }) {
  const t = useTheme();
  const shown = Math.min(day, JOURNEY_DAYS);
  return (
    <View accessible accessibilityLabel={`Day ${shown} of ${JOURNEY_DAYS}`} style={{ gap: t.space[2] }}>
      <View style={{ height: 8, borderRadius: t.radius.pill, backgroundColor: t.c.hairline }}>
        <View
          style={{
            width: `${(shown / JOURNEY_DAYS) * 100}%`,
            height: 8,
            borderRadius: t.radius.pill,
            backgroundColor: t.c.accent.primary,
          }}
        />
        {MILESTONES.map((m) => (
          <View
            key={m}
            style={{
              position: 'absolute',
              left: `${(m / JOURNEY_DAYS) * 100}%`,
              top: -3,
              width: 2,
              height: 14,
              marginLeft: -1,
              backgroundColor: shown >= m ? t.c.state.win : t.c.text.tertiary,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" tone="secondary">
          Day {shown} of {JOURNEY_DAYS}
        </AppText>
        <AppText variant="caption" tone="tertiary">
          {shown < 14
            ? 'First milestone: day 14'
            : shown < 42
              ? 'Week 6 is where most people quit. Not you.'
              : 'Day 90 is the finish line'}
        </AppText>
      </View>
    </View>
  );
}
