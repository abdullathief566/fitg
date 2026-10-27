// The one Text component: a type token + a colour role from the theme. Font scaling stays on (accessibility.md).
import { Text, type TextProps, type TextStyle } from 'react-native';
import type { TypeToken } from '@/constants/theme';
import { useTheme, type Theme } from './theme';

export type TextTone =
  'primary' | 'secondary' | 'tertiary' | 'onAccent' | 'inverse' | 'accent' | 'win' | 'done' | 'careful' | 'rest';

/** Small accent-coloured text uses `accent.deep` (tokens.md §1); state colours are for large text only. */
export function toneColor(t: Theme, tone: TextTone): string {
  switch (tone) {
    case 'accent':
      return t.c.accent.deep;
    case 'win':
    case 'done':
    case 'careful':
    case 'rest':
      return t.c.state[tone];
    default:
      return t.c.text[tone];
  }
}

export interface AppTextProps extends TextProps {
  variant?: TypeToken;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', tone = 'primary', align, style, ...rest }: AppTextProps) {
  const t = useTheme();
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[t.type[variant], { color: toneColor(t, tone) }, align ? { textAlign: align } : null, style]}
    />
  );
}
