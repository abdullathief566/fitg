// CoachBubble: a coach line with the PulseDot in front (motion.md §0). The coach speaks as FitG; one sentence.
// Typewriter (18 ms/char, max 1.2 s, tap to skip) is used sparingly; reduced motion shows the line at once.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@/constants/motion';
import { AppText } from './AppText';
import { PulseDot, type PulseState } from './PulseDot';
import { Tap } from './Pressable';
import { useTheme } from './theme';

export interface CoachBubbleProps {
  text: string;
  state?: PulseState;
  typewriter?: boolean;
}

export function CoachBubble({ text, state = 'idle', typewriter = false }: CoachBubbleProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const animate = typewriter && !reduced;
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const perChar = Math.min(
      motion.signature.typewriterPerChar,
      motion.signature.typewriterMax / Math.max(text.length, 1),
    );
    const timer = setInterval(() => setShown((n) => (n >= text.length ? n : n + 1)), perChar);
    return () => clearInterval(timer);
  }, [text, animate]);
  const line = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
      <PulseDot state={state} />
      <AppText variant="bodyL" style={{ flex: 1 }}>
        {text.slice(0, shown)}
      </AppText>
    </View>
  );
  if (shown >= text.length)
    return (
      <View accessible accessibilityLabel={text}>
        {line}
      </View>
    );
  return (
    <Tap accessibilityLabel={text} feedback="none" scale={false} onPress={() => setShown(text.length)}>
      {line}
    </Tap>
  );
}
