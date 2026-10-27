// PrimaryButton (ported from Sumi, re-tokened). Dark text on coral, never white (tokens.md §1). Sizes: normal 56 pt,
// kitchen 64, gym 72. `secondary` = surface with a hairline; `quiet` = text-only in accent.deep.
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Tap } from './Pressable';
import { useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'normal' | 'kitchen' | 'gym';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Fire the Light press-down haptic (default true); off when the handler fires its own. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  size = 'normal',
  loading = false,
  disabled = false,
  haptic = true,
  accessibilityHint,
  style,
  testID,
}: PrimaryButtonProps) {
  const t = useTheme();
  const height = size === 'gym' ? t.tap.gymPrimary : size === 'kitchen' ? t.tap.kitchenNext : t.tap.comfortable;
  const bg = variant === 'primary' ? t.c.accent.primary : variant === 'secondary' ? t.c.bg.surface : 'transparent';
  const fg = variant === 'primary' ? 'onAccent' : variant === 'secondary' ? 'primary' : 'accent';
  const inactive = disabled || loading;
  return (
    <Tap
      testID={testID}
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      disabled={inactive}
      feedback={haptic ? 'tap' : 'none'}
      onPress={onPress}
      minSize={height}
      style={[
        {
          minHeight: height,
          borderRadius: size === 'gym' ? t.radius.buttonGym : t.radius.button,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: variant === 'quiet' ? 0 : t.space[5],
          opacity: disabled ? 0.45 : 1,
        },
        variant === 'secondary' ? { borderWidth: 1, borderColor: t.c.hairline } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? t.c.text.onAccent : t.c.accent.deep} />
      ) : (
        <View>
          <AppText
            variant={size === 'normal' && variant !== 'primary' ? 'button' : 'buttonL'}
            tone={fg}
            align="center"
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </AppText>
        </View>
      )}
    </Tap>
  );
}
