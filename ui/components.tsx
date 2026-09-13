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
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radii, spacing, useTheme, type Theme, type ThemeMode } from './theme';
import { KalyxRing } from './KalyxRing';

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

/**
 * Écran de base, CLAVIER-AWARE : le contenu remonte au-dessus du clavier.
 * - défaut : contenu fixe (pour les écrans qui gèrent DÉJÀ leur propre défilement —
 *   ScrollView/FlatList —, afin d'éviter un double défilement qui casserait tout).
 * - `scroll` : ajoute une ScrollView (KAV + ScrollView) pour les écrans-FORMULAIRES
 *   plats (montant, adresse, mot de passe…) → le champ actif reste visible et on défile.
 *   `flexGrow:1` sur le contentContainer garde les spacers `flex:1` (bouton en bas).
 */
export function Screen({ children, scroll }: { children: React.ReactNode; scroll?: boolean }) {
  const { styles } = useThemeStyles();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : insets.top + 8;
  // Bas : inset système (barre de navigation Android edge-to-edge / home
  // indicator iOS) pour que la dernière rangée (pavé PIN, bouton) reste visible.
  const bottom = insets.bottom;
  return (
    <View style={[styles.screen, { paddingTop: topPadding }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.screenScroll, { paddingBottom: spacing(3) + bottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.screenInner, { paddingBottom: spacing(3) + bottom }]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </View>
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
    <KalyxRing size={24} spinning color={isPrimary ? theme.colors.onPrimary : theme.colors.text} />
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
    screenInner: { flex: 1, padding: spacing(3), paddingTop: 4, gap: spacing(2) },
    // contentContainer du ScrollView (mode `scroll`) : flexGrow garde les spacers
    // `flex:1` fonctionnels ; marge basse pour respirer au-dessus du clavier.
    screenScroll: { flexGrow: 1, padding: spacing(3), paddingTop: 4, paddingBottom: spacing(5), gap: spacing(2) },
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
    btnLabel: { color: colors.onPrimary, fontSize: 16, fontFamily: fonts.bold },
  });
}
