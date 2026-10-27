// One row of Today's timeline. Every state has a shape, not only a colour (accessibility.md): done = check,
// now = filled dot, upcoming = ring, skipped = dash, past (assumed eaten) = faint ring. 56 pt rows.
import { View } from 'react-native';
import { Check, Minus } from './icons';
import { maxFontScaleRows } from '@/constants/theme';
import type { TimelineStatus } from '@/src/domain/today';
import { AppText } from './AppText';
import { Tap } from './Pressable';
import { useTheme } from './theme';

export interface TimelineRowProps {
  time: string;
  title: string;
  detail?: string;
  status: TimelineStatus;
  onPress?: () => void;
}

const SPOKEN: Record<TimelineStatus, string> = {
  done: 'done',
  now: 'now',
  upcoming: 'coming up',
  past: 'earlier',
  skipped: 'skipped',
};

function Marker({ status }: { status: TimelineStatus }) {
  const t = useTheme();
  const box = {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  switch (status) {
    case 'done':
      return (
        <View style={[box, { backgroundColor: t.c.state.doneTint }]}>
          <Check size={14} strokeWidth={3} color={t.c.state.done} />
        </View>
      );
    case 'now':
      return (
        <View style={box}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.c.accent.primary }} />
        </View>
      );
    case 'skipped':
      return (
        <View style={box}>
          <Minus size={14} strokeWidth={2.5} color={t.c.text.tertiary} />
        </View>
      );
    default:
      return (
        <View style={box}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: status === 'past' ? t.c.hairline : t.c.text.tertiary,
            }}
          />
        </View>
      );
  }
}

export function TimelineRow({ time, title, detail, status, onPress }: TimelineRowProps) {
  const t = useTheme();
  const faded = status === 'past' || status === 'skipped';
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        minHeight: t.tap.comfortable,
        paddingVertical: t.space[2],
      }}
    >
      <Marker status={status} />
      <AppText
        variant="caption"
        tone="secondary"
        maxFontSizeMultiplier={maxFontScaleRows}
        style={{ width: 64, fontVariant: ['tabular-nums'] }}
      >
        {time}
      </AppText>
      <View style={{ flex: 1 }}>
        <AppText
          variant="body"
          tone={faded ? 'tertiary' : 'primary'}
          maxFontSizeMultiplier={maxFontScaleRows}
          numberOfLines={2}
        >
          {title}
        </AppText>
        {detail ? (
          <AppText variant="caption" tone="tertiary" maxFontSizeMultiplier={maxFontScaleRows}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {status === 'now' ? (
        <AppText variant="micro" tone="accent">
          Now
        </AppText>
      ) : null}
    </View>
  );
  const a11y = `${time}, ${title}, ${SPOKEN[status]}`;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11y}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityLabel={a11y} onPress={onPress} scale={false}>
      {content}
    </Tap>
  );
}
