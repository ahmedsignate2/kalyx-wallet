/**
 * Composants de base du design system (thémés clair/sombre).
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radii, spacing, useTheme, type Theme, type ThemeMode } from './theme';

const SCREEN_W = Dimensions.get('window').width;

/** Éclat qui balaie un bouton par intermittence (effet premium « bling »). */
function ButtonShimmer() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(x, { toValue: 1, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-120, SCREEN_W] });
  const opacity = x.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.6, 0.6, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: -20, bottom: -20, width: 70, opacity, transform: [{ translateX }, { rotate: '18deg' }] }}
    >
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.7)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

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
      style={({ pressed }) => [{ opacity: pressed || disabled ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={theme.gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.btn, { overflow: 'hidden' }]}
        >
          {content}
          {!disabled && !loading ? <ButtonShimmer /> : null}
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
