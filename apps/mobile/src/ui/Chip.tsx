// Chip — the default answer control in onboarding ("chips first"). Selected = accent tint + a check (a shape, not
// only a colour: accessibility.md). 48 pt minimum; selection haptic.
import { View } from 'react-native';
import { Check } from './icons';
import { AppText } from './AppText';
import { Tap } from './Pressable';
import { useTheme } from './theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Second line under the label ("Cardio days, a sport, or a physical job"). */
  hint?: string;
  /** Radio (single choice) vs checkbox (many) for screen readers. */
  role?: 'radio' | 'checkbox';
  wide?: boolean;
  testID?: string;
}

export function Chip({ label, selected, onPress, hint, role = 'radio', wide, testID }: ChipProps) {
  const t = useTheme();
  return (
    <Tap
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ checked: selected, selected }}
      feedback="selection"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3],
        borderRadius: wide ? t.radius.button : t.radius.chip,
        borderWidth: 1.5,
        borderColor: selected ? t.c.accent.primary : t.c.hairline,
        backgroundColor: selected ? t.c.accent.tint : t.c.bg.surface,
        ...(wide ? { alignSelf: 'stretch' as const } : {}),
      }}
    >
      <View style={{ flexShrink: 1, flexGrow: wide ? 1 : 0 }}>
        <AppText variant="button" maxFontSizeMultiplier={1.3}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {selected ? <Check size={t.icon.xs} strokeWidth={2.5} color={t.c.accent.deep} /> : null}
    </Tap>
  );
}
