import { INTEREST_LABELS, type ChatSummary } from '@200h/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import type { Query } from '@/lib/api';
import { colors, font, radius, space } from '@/theme';

// Wireframe-level building blocks. Screens are composed from these, so a visual
// polish pass later mostly touches this file and theme.ts.

// --- Layout -------------------------------------------------------------------

/** Page wrapper. `footer` pins the wireframes' bottom CTA buttons. Stack screens with a header pass edges={['bottom']}. */
export function Screen({
  children,
  footer,
  scroll = true,
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Row({
  children,
  wrap,
  between,
  style,
}: {
  children: ReactNode;
  wrap?: boolean;
  between?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, wrap && styles.wrap, between && styles.between, style]}>{children}</View>;
}

export function Card({
  children,
  dark,
  onPress,
  style,
}: {
  children: ReactNode;
  dark?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const cardStyle = [styles.card, dark && styles.cardDark, style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

// --- Text ---------------------------------------------------------------------

type TextProps = {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  onDark?: boolean;
  muted?: boolean;
  numberOfLines?: number;
};

const tone = (onDark?: boolean, muted?: boolean) => ({
  color: onDark ? (muted ? colors.onDarkMuted : colors.onDark) : muted ? colors.inkMuted : colors.ink,
});

export function Title({ children, style, onDark, muted }: TextProps) {
  return <Text style={[styles.title, tone(onDark, muted), style]}>{children}</Text>;
}

export function Heading({ children, style, onDark, muted }: TextProps) {
  return <Text style={[styles.heading, tone(onDark, muted), style]}>{children}</Text>;
}

export function Body({ children, style, onDark, muted, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, tone(onDark, muted), style]}>
      {children}
    </Text>
  );
}

// --- Controls -------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light';

const buttonVariants = {
  primary: { container: { backgroundColor: colors.dark }, text: { color: colors.onDark } },
  secondary: {
    container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink },
    text: { color: colors.ink },
  },
  ghost: { container: { backgroundColor: 'transparent', paddingHorizontal: space.sm }, text: { color: colors.accent } },
  light: { container: { backgroundColor: colors.surface }, text: { color: colors.ink } },
} satisfies Record<ButtonVariant, { container: ViewStyle; text: { color: string } }>;

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, v.container, (disabled || loading) && styles.disabled, pressed && styles.pressed, style]}>
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

/** The wireframes' round buttons: ✕, ♥, send, −/+. */
export function IconButton({
  label,
  onPress,
  filled,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  filled?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        filled && styles.iconButtonFilled,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.iconButtonText, filled && { color: colors.onDark }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.inkMuted} style={[styles.input, style]} {...props} />
    </View>
  );
}

// --- People ---------------------------------------------------------------------

export function Avatar({ name, uri, size = 36 }: { name: string; uri?: string | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} />;
  return (
    <View style={[styles.avatar, box]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function AvatarStack({ names, max = 5 }: { names: string[]; max?: number }) {
  return (
    <View style={styles.row}>
      {names.slice(0, max).map((name, i) => (
        <View key={`${name}-${i}`} style={i > 0 && styles.stacked}>
          <Avatar name={name} size={32} />
        </View>
      ))}
      {names.length > max ? <Body muted>{` +${names.length - max}`}</Body> : null}
    </View>
  );
}

export function ChatRow({ chat }: { chat: ChatSummary }) {
  return (
    <Pressable
      onPress={() => router.push(`/chat/${chat.crewId}`)}
      style={({ pressed }) => [styles.chatRow, pressed && styles.pressed]}>
      <Avatar name={INTEREST_LABELS[chat.activity]} />
      <View style={styles.fill}>
        <Body>{chat.crewName}</Body>
        <Body muted numberOfLines={1}>
          {chat.lastMessage ?? 'Say hi to your crew'}
        </Body>
      </View>
      {chat.unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{chat.unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// --- States -----------------------------------------------------------------------

/** Loading spinner, or the error with a retry button. */
export function QueryState({ query }: { query: Pick<Query<unknown>, 'error' | 'reload'> }) {
  return (
    <View style={styles.center}>
      {query.error ? (
        <>
          <Body muted>{query.error.message}</Body>
          <Button variant="secondary" title="Try again" onPress={query.reload} />
        </>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

/** "Tue 7:00 PM" in the viewer's time zone. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md },
  fill: { flex: 1 },
  footer: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  between: { justifyContent: 'space-between' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: space.sm,
  },
  cardDark: { backgroundColor: colors.dark, borderColor: colors.dark },

  title: { fontSize: font.title, fontWeight: '700' },
  heading: { fontSize: font.heading, fontWeight: '600' },
  body: { fontSize: font.body, lineHeight: 21 },

  button: {
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: font.body, fontWeight: '600' },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonFilled: { backgroundColor: colors.dark, borderColor: colors.dark },
  iconButtonText: { fontSize: font.heading, fontWeight: '600', color: colors.ink },

  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkMuted,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.dark, borderColor: colors.dark },
  chipText: { fontSize: font.small, color: colors.ink },
  chipTextSelected: { color: colors.onDark, fontWeight: '600' },

  field: { gap: space.xs },
  fieldLabel: { fontSize: font.small, fontWeight: '600', color: colors.inkMuted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.body,
    color: colors.ink,
  },

  avatar: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', color: colors.ink },
  stacked: { marginLeft: -10 },

  chatRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: font.small, fontWeight: '600', color: colors.ink },
});
