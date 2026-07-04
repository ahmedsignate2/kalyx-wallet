/**
 * Composants de base du design system (thémés clair/sombre).
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
import { fonts, radii, spacing, useTheme, type Theme, type ThemeMode } from './theme';

const stylesCache: Partial<Record<ThemeMode, ReturnType<typeof createStyles>>> = {};
function useThemeStyles() {
  const theme = useTheme();
  const styles = (stylesCache[theme.mode] ??= createStyles(theme));
  return { theme, styles };
}

export function Screen({ children }: { children: React.ReactNode }) {
  const { styles } = useThemeStyles();
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
  const { styles } = useThemeStyles();
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
  const { theme, styles } = useThemeStyles();
  const isPrimary = variant === 'primary';
  const content = loading ? (
    <ActivityIndicator color={isPrimary ? '#fff' : theme.colors.text} />
  ) : (
    <Text style={[styles.btnLabel, !isPrimary && { color: theme.colors.text }]}>{label}</Text>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ opacity: pressed || disabled ? 0.7 : 1 }]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={theme.gradients.accent}
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
  const { theme } = useThemeStyles();
  return <Text style={theme.typography.title}>{children}</Text>;
}
export function Muted({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStyles();
  return <Text style={theme.typography.muted}>{children}</Text>;
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
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
}
