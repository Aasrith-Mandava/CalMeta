import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * A person as a ring that fills toward the next friendship milestone (50 / 90 / 200h).
 * `progress` is 0–1 (from the API's Progress.progress).
 */
export function FriendRing({
  name,
  progress,
  size = 56,
  center,
  label,
  onDark,
  onPress,
}: {
  name: string;
  progress: number;
  size?: number;
  /** Text inside the ring; defaults to the person's initial. */
  center?: string;
  /** Text under the ring, e.g. "52h". */
  label?: string;
  onDark?: boolean;
  onPress?: () => void;
}) {
  const stroke = Math.max(3, size / 14);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, progress));

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={`${name}${label ? `, ${label}` : ''}`}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.7 }]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={onDark ? colors.onDarkMuted : colors.line}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - filled)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.centerText, { fontSize: size * 0.3, color: onDark ? colors.onDark : colors.ink }]}>
            {center ?? name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      </View>
      {label ? <Text style={[styles.label, onDark && { color: colors.onDarkMuted }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { fontWeight: '700' },
  label: { fontSize: 12, color: colors.inkMuted },
});
