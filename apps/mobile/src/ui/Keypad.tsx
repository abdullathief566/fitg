// Keypad (ported from Sumi): 4×3 grid of 64 pt keys, never the system keyboard. Selection haptic per key; a one-shot
// press spring through Tap. Used inside NumberSheet for height, weight and age.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Delete } from './icons';
import { AppText } from './AppText';
import { Tap } from './Pressable';
import { useTheme } from './theme';

export interface KeypadProps {
  /** "0"–"9" or "." */
  onKey: (key: string) => void;
  onBackspace: () => void;
  decimal?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function Keypad({ onKey, onBackspace, decimal = true }: KeypadProps) {
  const t = useTheme();
  const key = (label: string, onPress: () => void, content?: ReactNode) => (
    <Tap
      key={label}
      accessibilityLabel={label}
      feedback="selection"
      onPress={onPress}
      minSize={64}
      style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.button }}
    >
      {content ?? (
        <AppText variant="displayM" allowFontScaling={false} style={{ fontVariant: ['tabular-nums'] }}>
          {label}
        </AppText>
      )}
    </Tap>
  );
  return (
    <View style={{ gap: t.space[1] }}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap: t.space[1] }}>
          {row.map((k) => key(k, () => onKey(k)))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: t.space[1] }}>
        {decimal ? key('.', () => onKey('.')) : <View style={{ flex: 1 }} />}
        {key('0', () => onKey('0'))}
        {key('Delete', onBackspace, <Delete size={t.icon.md} color={t.c.text.primary} strokeWidth={2} />)}
      </View>
    </View>
  );
}
