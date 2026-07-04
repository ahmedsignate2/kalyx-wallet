/**
 * Composants de base du design system.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, colors, radii, spacing, typography, accentGradient } from './theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.screenInner}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  const content = loading ? (
    <ActivityIndicator color={colors.text} />
  ) : (
    <Text style={[styles.btnLabel, !isPrimary && { color: colors.text }]}>{label}</Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ opacity: pressed || disabled ? 0.7 : 1 }]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.btn, styles.btnGhost]}>{content}</View>
      )}
    </Pressable>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={typography.title}>{children}</Text>;
}
export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={typography.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenInner: { flex: 1, padding: spacing(3), gap: spacing(2) },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing(2.5),
    gap: spacing(1.5),
  },
  btn: {
    height: 54,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(3),
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.cardBorder },
  btnLabel: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
});
