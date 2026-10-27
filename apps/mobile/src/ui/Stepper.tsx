// Stepper rows: "Wake up  − 7:00 AM +". Selection haptic per tick; holding a button repeats.
import { useRef } from 'react';
import { View } from 'react-native';
import { Minus, Plus } from './icons';
import { to12h, type LocalTime } from '@fitg/engine';
import { maxFontScaleRows } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { AppText } from './AppText';
import { Tap } from './Pressable';
import { useTheme } from './theme';

function useRepeat(fire: () => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  return {
    onPress: fire,
    onLongPress: () => {
      stop();
      timer.current = setInterval(() => {
        haptics.selection();
        fire();
      }, 120);
    },
    onPressOut: stop,
  };
}

export interface StepperProps {
  label: string;
  value: string;
  /** Spoken form ("7:00 AM"). */
  spoken?: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
}

export function Stepper({ label, value, spoken, onDec, onInc, decDisabled, incDisabled }: StepperProps) {
  const t = useTheme();
  const dec = useRepeat(onDec);
  const inc = useRepeat(onInc);
  const btn = {
    width: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: t.radius.chip,
    backgroundColor: t.c.bg.sunken,
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: t.tap.comfortable, gap: t.space[3] }}>
      <AppText variant="body" style={{ flex: 1 }} maxFontSizeMultiplier={maxFontScaleRows}>
        {label}
      </AppText>
      <Tap
        accessibilityLabel={`${label}: earlier`}
        feedback="selection"
        disabled={decDisabled}
        {...dec}
        style={[btn, decDisabled ? { opacity: 0.4 } : null]}
      >
        <Minus size={t.icon.sm} color={t.c.text.primary} />
      </Tap>
      <AppText
        variant="numberM"
        accessibilityLabel={`${label}, ${spoken ?? value}`}
        maxFontSizeMultiplier={maxFontScaleRows}
        style={{ minWidth: 92, textAlign: 'center' }}
      >
        {value}
      </AppText>
      <Tap
        accessibilityLabel={`${label}: later`}
        feedback="selection"
        disabled={incDisabled}
        {...inc}
        style={[btn, incDisabled ? { opacity: 0.4 } : null]}
      >
        <Plus size={t.icon.sm} color={t.c.text.primary} />
      </Tap>
    </View>
  );
}

const DAY_MIN = 24 * 60;

export function shiftTime(time: LocalTime, by: number): LocalTime {
  const [h, m] = time.split(':').map(Number);
  const total = ((((h ?? 0) * 60 + (m ?? 0) + by) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function TimeStepper({
  label,
  value,
  step = 15,
  onChange,
}: {
  label: string;
  value: LocalTime;
  step?: number;
  onChange: (t: LocalTime) => void;
}) {
  const shown = to12h(value);
  return (
    <Stepper
      label={label}
      value={shown}
      spoken={shown}
      onDec={() => onChange(shiftTime(value, -step))}
      onInc={() => onChange(shiftTime(value, step))}
    />
  );
}
