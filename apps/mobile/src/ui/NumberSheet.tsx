// NumberSheet: a bottom sheet with a big value and the Keypad (height / weight / age entry, screens.md O2).
// Validation happens on Done; an out-of-range value shakes with a Warning haptic in the same frame.
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '@/lib/haptics';
import { AppText } from './AppText';
import { Keypad } from './Keypad';
import { PrimaryButton } from './PrimaryButton';
import { useTheme } from './theme';

export interface NumberSheetProps {
  visible: boolean;
  title: string;
  unit: string;
  initial?: number;
  min: number;
  max: number;
  decimal?: boolean;
  /** Shown when the value is out of range ("Between 120 and 230 cm"). */
  rangeHint: string;
  onDone: (value: number) => void;
  onClose: () => void;
  /** Optional unit switch under the value (kg | lb). */
  unitSwitch?: { options: string[]; value: string; onChange: (v: string) => void };
}

export function NumberSheet({
  visible,
  title,
  unit,
  initial,
  min,
  max,
  decimal = true,
  rangeHint,
  onDone,
  onClose,
  unitSwitch,
}: NumberSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setText(initial !== undefined ? String(initial) : '');
      setError(false);
    }
  }, [visible, initial]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const onKey = (k: string) => {
    setError(false);
    setText((cur) => {
      if (k === '.' && (!decimal || cur.includes('.'))) return cur;
      if (cur.includes('.') && cur.split('.')[1]!.length >= 1) return cur;
      if (cur.replace('.', '').length >= 5) return cur;
      return cur === '0' && k !== '.' ? k : cur + k;
    });
  };
  const done = () => {
    const v = Number(text);
    if (!text || !Number.isFinite(v) || v < min || v > max) {
      setError(true);
      haptics.warning();
      if (!reduced)
        shake.set(
          withSequence(
            withTiming(-8, { duration: 50 }),
            withTiming(8, { duration: 50 }),
            withTiming(-6, { duration: 50 }),
            withTiming(0, { duration: 50 }),
          ),
        );
      return;
    }
    onDone(v);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: t.c.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: t.c.bg.surface,
          borderTopLeftRadius: t.radius.sheet,
          borderTopRightRadius: t.radius.sheet,
          paddingHorizontal: t.space.screenX,
          paddingTop: t.space[5],
          paddingBottom: Math.max(insets.bottom, t.space[4]),
          gap: t.space[4],
        }}
      >
        <AppText variant="displayS" align="center">
          {title}
        </AppText>
        <Animated.View
          style={[
            { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: t.space[2] },
            shakeStyle,
          ]}
        >
          <AppText variant="numberHero" tone={text ? 'primary' : 'tertiary'} accessibilityLiveRegion="polite">
            {text || '0'}
          </AppText>
          <AppText variant="displayS" tone="secondary">
            {unit}
          </AppText>
        </Animated.View>
        {unitSwitch ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.space[2] }}>
            {unitSwitch.options.map((o) => (
              <PrimaryButton
                key={o}
                label={o}
                variant={o === unitSwitch.value ? 'secondary' : 'quiet'}
                onPress={() => unitSwitch.onChange(o)}
                style={{ minWidth: 72 }}
              />
            ))}
          </View>
        ) : null}
        <AppText variant="caption" tone={error ? 'careful' : 'tertiary'} align="center">
          {error ? rangeHint : ' '}
        </AppText>
        <Keypad decimal={decimal} onKey={onKey} onBackspace={() => setText((c) => c.slice(0, -1))} />
        <PrimaryButton label="Done" onPress={done} />
      </View>
    </Modal>
  );
}
