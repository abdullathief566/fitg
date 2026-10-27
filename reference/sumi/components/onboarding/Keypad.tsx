// Sumi onboarding — the custom keypad (ONBOARDING-BIBLE §S3).
// 4×3 grid, 64px keys, digits 24/600 ink on transparent. Pressed key springs
// 0.92 → 1 ({damping:15, stiffness:400}); selectionAsync per key. Never the
// system keyboard. One-shot springs only — no loops, nothing to pause.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { haptics } from "../../src/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const KEY_INK = "#1C2B26";
const PRESS_SPRING = { damping: 15, stiffness: 400 };

type KeypadProps = {
  /** Receives "0"–"9" or "." */
  onKey: (key: string) => void;
  onBackspace: () => void;
  /** Show the decimal key (default true). */
  decimal?: boolean;
};

function Key({
  label,
  icon,
  onPress,
  hidden = false,
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  hidden?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (hidden) return <View style={styles.key} />;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label || "delete"}
      style={[styles.key, animatedStyle]}
      onPressIn={() => {
        scale.value = withSpring(0.92, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
      }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      hitSlop={4}
    >
      {icon ? (
        <Ionicons name={icon} size={24} color={KEY_INK} />
      ) : (
        <Text style={styles.keyText}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

export default function Keypad({ onKey, onBackspace, decimal = true }: KeypadProps) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Key label="1" onPress={() => onKey("1")} />
        <Key label="2" onPress={() => onKey("2")} />
        <Key label="3" onPress={() => onKey("3")} />
      </View>
      <View style={styles.row}>
        <Key label="4" onPress={() => onKey("4")} />
        <Key label="5" onPress={() => onKey("5")} />
        <Key label="6" onPress={() => onKey("6")} />
      </View>
      <View style={styles.row}>
        <Key label="7" onPress={() => onKey("7")} />
        <Key label="8" onPress={() => onKey("8")} />
        <Key label="9" onPress={() => onKey("9")} />
      </View>
      <View style={styles.row}>
        <Key label="." onPress={() => onKey(".")} hidden={!decimal} />
        <Key label="0" onPress={() => onKey("0")} />
        <Key icon="backspace-outline" onPress={onBackspace} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: "100%",
    gap: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  key: {
    flex: 1,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderRadius: 16,
  },
  keyText: {
    fontSize: 24,
    fontWeight: "600",
    color: KEY_INK,
    fontVariant: ["tabular-nums"],
  },
});
