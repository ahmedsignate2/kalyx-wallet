/**
 * Composants UI premium V2 (glassmorphism, accents violet/bleu). Purement
 * présentationnels — aucune logique crypto. Thémés clair/sombre : chaque
 * composant lit le thème via useTheme() ; les StyleSheet sont créées une fois
 * par mode (cache) pour rester aussi performantes qu'en statique.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Image,
  Animated,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Path, Defs, Stop, LinearGradient as SvgLinearGradient, RadialGradient, Rect } from 'react-native-svg';
import { Dimensions } from 'react-native';
import { fonts, radii, spacing, useTheme, type Theme, type ThemeMode } from './theme';
import { Icon, type IconName } from './icon';
import { haptic } from '../lib/haptics';

const PREMIUM_W = Dimensions.get('window').width;

/** Halo violet doux et statique en haut d'écran (lumière d'ambiance premium). */
function TopGlow() {
  const { theme } = useThemeStyles();
  const w = PREMIUM_W * 1.5;
  const h = 360;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -70, left: (PREMIUM_W - w) / 2, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id="premium-topglow" cx="50%" cy="35%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={theme.colors.violet} stopOpacity={0.14} />
            <Stop offset="0.55" stopColor={theme.colors.blue} stopOpacity={0.04} />
            <Stop offset="1" stopColor={theme.colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#premium-topglow)" />
      </Svg>
    </View>
  );
}

/* Styles dépendant du thème : créés une fois par mode puis réutilisés. */
const stylesCache: Partial<Record<ThemeMode, ReturnType<typeof createStyles>>> = {};
function useThemeStyles() {
  const theme = useTheme();
  const styles = (stylesCache[theme.mode] ??= createStyles(theme));
  return { theme, styles };
}

export function PremiumScreen({
  children,
  footer,
  refreshControl,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Élément <RefreshControl> pour le « balayer vers le bas pour rafraîchir ». */
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useThemeStyles();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgDeep }}>
      <LinearGradient colors={theme.gradients.screen} style={StyleSheet.absoluteFill} />
      <TopGlow />
      {/* Clavier-aware : le contenu remonte au-dessus du clavier et reste défilable. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + spacing(1.5),
            paddingHorizontal: spacing(2.5),
            paddingBottom: insets.bottom + spacing(13),
            gap: spacing(2.5),
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {footer}
    </View>
  );
}

/** Wrapper tactile : léger scale au toucher (feedback premium). */
export function PressableScale({
  children,
  onPress,
  disabled,
  scaleTo = 0.97,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      onPressIn={() => {
        haptic.selection();
        animate(scaleTo);
      }}
      onPressOut={() => animate(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Bloc « squelette » animé (pulsation) pour les états de chargement. */
export function Skeleton({
  width,
  height = 16,
  radius = 8,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useThemeStyles();
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.glassStrong, opacity }, style]}
    />
  );
}

/** Ligne squelette (avatar + 2 lignes + valeur) pour listes en chargement. */
export function SkeletonRow({ divider }: { divider?: boolean }) {
  const { styles } = useThemeStyles();
  return (
    <View style={[styles.listItem, divider ? styles.divider : null]}>
      <Skeleton width={42} height={42} radius={21} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={56} height={14} />
    </View>
  );
}

export function GlassCard({
  children,
  style,
  glow,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
}) {
  const { theme, styles } = useThemeStyles();
  return (
    <View style={[styles.glass, theme.shadow.card, style]}>
      {glow ? (
        <LinearGradient
          colors={theme.gradients.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* Reflet supérieur (glassmorphism) */}
      <LinearGradient
        colors={theme.gradients.sheen}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32 }}
      />
      <View>{children}</View>
    </View>
  );
}

export function Chip({
  label,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'warning';
}) {
  const { theme, styles } = useThemeStyles();
  const { colors } = theme;
  const color =
    tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : colors.text;
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={styles.chip}>
        <Text style={{ color, fontFamily: fonts.semibold }}>{label}</Text>
        {onPress ? <Text style={{ color: colors.textMuted }}>▾</Text> : null}
      </View>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, badge }: { icon: IconName; onPress?: () => void; badge?: boolean }) {
  const { theme, styles } = useThemeStyles();
  return (
    <Pressable onPress={onPress}>
      <View style={styles.iconBtn}>
        <Icon name={icon} size={19} color={theme.colors.text} />
        {badge ? <View style={styles.badge} /> : null}
      </View>
    </Pressable>
  );
}

/** Tuile d'action rectangulaire (glass) : icône + libellé. */
export function ActionTile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme, styles } = useThemeStyles();
  const { colors } = theme;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1 }}>
      <View style={[styles.tile, disabled ? { opacity: 0.4 } : null]}>
        <Text style={{ fontSize: 20, color: colors.text }}>{icon}</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontFamily: fonts.semibold, marginTop: 6 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Bouton d'action circulaire compact (style Revolut) + libellé dessous. */
export function CircleAction({
  icon,
  label,
  onPress,
  disabled,
  dimmed,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Grisé mais tappable (ex. fonctionnalité « bientôt » qui s'explique au tap). */
  dimmed?: boolean;
}) {
  const { theme, styles } = useThemeStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ alignItems: 'center', gap: 8, flex: 1, opacity: disabled || dimmed ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <View style={styles.circleAction}>
        <Icon name={icon} size={22} color={theme.colors.text} />
      </View>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontFamily: fonts.semibold }}>{label}</Text>
    </Pressable>
  );
}

/** Petit badge (ex. TESTNET). */
export function Badge({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'accent' }) {
  const { theme } = useThemeStyles();
  const c = tone === 'accent' ? theme.colors.accent : theme.colors.warning;
  return (
    <View style={{ backgroundColor: c + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: c, fontSize: 10, fontFamily: fonts.extrabold, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

/** Barre de recherche (glass). */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const { theme, styles } = useThemeStyles();
  const { colors } = theme;
  return (
    <View style={styles.search}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 }}
      />
    </View>
  );
}

/** Encadré d'erreur/avertissement avec icône. */
export function ErrorBox({ message, tone = 'danger' }: { message: string; tone?: 'danger' | 'warning' }) {
  const { theme } = useThemeStyles();
  const c = tone === 'warning' ? theme.colors.warning : theme.colors.danger;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
        backgroundColor: c + '18',
        borderWidth: 1,
        borderColor: c + '55',
        borderRadius: radii.md,
        padding: spacing(1.5),
      }}
    >
      <Icon name="warning" size={18} color={c} />
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme, styles } = useThemeStyles();
  return (
    <View style={styles.rowBetween}>
      <Text style={theme.typography.section}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={{ color: theme.colors.accent, fontFamily: fonts.semibold }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({ label, color }: { label: string; color?: string }) {
  const { theme, styles } = useThemeStyles();
  // Fond accent (par défaut) → glyphe blanc ; fond « verre » fourni par
  // l'appelant → glyphe couleur texte (lisible dans les deux thèmes).
  const bg = color ?? theme.colors.accent;
  const fg = color ? theme.colors.text : '#fff';
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 18, color: fg }}>{label}</Text>
    </View>
  );
}

/**
 * Icône d'actif (réseau/token) : image distante avec repli AUTO sur cercle lettré
 * si l'URL est absente OU si le chargement échoue (404, hors-ligne, host bloqué).
 * Évite les images cassées et les icônes ETH génériques partout.
 */
export function RemoteIcon({
  uri,
  label,
  size = 42,
  color,
}: {
  uri?: string | null;
  label: string;
  size?: number;
  color?: string;
}) {
  const { theme } = useThemeStyles();
  const [failed, setFailed] = React.useState(false);
  const letter = (label || '?').slice(0, 1).toUpperCase();
  if (!uri || failed) {
    const bg = color ?? theme.colors.glassStrong;
    const fg = color ? '#fff' : theme.colors.text;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Text style={{ fontSize: size * 0.42, color: fg, fontWeight: '600' }}>{letter}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.glass }}
    />
  );
}

export function GradientAvatar({ label }: { label: string }) {
  const { theme, styles } = useThemeStyles();
  return (
    <LinearGradient
      colors={theme.gradients.accent}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.avatar}
    >
      <Text style={{ fontSize: 18, color: '#fff' }}>{label}</Text>
    </LinearGradient>
  );
}

/** Ligne de liste générique (transparente, à placer dans une GlassCard). */
export function ListRow({
  left,
  title,
  subtitle,
  right,
  onPress,
  divider,
}: {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
}) {
  const { theme, styles } = useThemeStyles();
  const content = (
    <View style={[styles.listItem, divider ? styles.divider : null]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={theme.typography.bodyStrong}>{title}</Text>
        {subtitle ? <Text style={theme.typography.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress}>{content}</PressableScale> : content;
}

/** Mini-graphe (react-native-svg). */
export function Sparkline({
  data,
  color,
  width = 88,
  height = 34,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** Graphique de prix (courbe + aire dégradée) — react-native-svg. */
export function PriceChart({
  data,
  color,
  width,
  height = 190,
}: {
  data: number[];
  color: string;
  width: number;
  height?: number;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 6;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area =
    `M ${pts[0][0].toFixed(1)},${height} ` +
    pts.map((p) => `L ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
    ` L ${pts[pts.length - 1][0].toFixed(1)},${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill="url(#chartGrad)" />
      <Polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export function SegmentedTabs({
  items,
  active,
  onChange,
}: {
  items: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  const { theme, styles } = useThemeStyles();
  return (
    <View style={styles.segWrap}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={[styles.segItem, on ? styles.segItemActive : null]}>
            <Text style={{ color: on ? '#fff' : theme.colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MarketRow({
  icon,
  color,
  imageUri,
  name,
  symbol,
  price,
  change,
  spark,
  divider,
  onPress,
}: {
  icon: string;
  color: string;
  imageUri?: string;
  name: string;
  symbol: string;
  price: string;
  change: number;
  spark: number[];
  divider?: boolean;
  onPress?: () => void;
}) {
  const { theme, styles } = useThemeStyles();
  const up = change >= 0;
  const c = up ? theme.colors.up : theme.colors.down;
  const content = (
    <View style={[styles.listItem, divider ? styles.divider : null]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: 42, height: 42, borderRadius: 21 }} />
      ) : (
        <Avatar label={icon} color={color} />
      )}
      <View style={{ width: 88 }}>
        <Text style={theme.typography.bodyStrong}>{name}</Text>
        <Text style={theme.typography.muted}>{symbol}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Sparkline data={spark} color={c} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: theme.colors.text, fontFamily: fonts.semibold }}>{price}</Text>
        <Text style={{ color: c, fontSize: 13 }}>
          {up ? '+' : ''}
          {change.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
  return onPress ? <PressableScale onPress={onPress}>{content}</PressableScale> : content;
}

export interface NavItem {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** Bottom nav : 4 items + bouton central surélevé (FAB). */
export function BottomNav({
  items,
  active,
  center,
}: {
  items: NavItem[];
  active: string;
  center: { icon: IconName; label: string; onPress: () => void };
}) {
  const insets = useSafeAreaInsets();
  const { theme, styles } = useThemeStyles();
  const { colors } = theme;
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  const renderItem = (it: NavItem) => {
    const on = it.key === active;
    return (
      <Pressable key={it.key} onPress={it.onPress} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
        <Icon name={it.icon} size={22} color={on ? colors.accent : colors.textFaint} />
        <Text style={{ fontSize: 11, color: on ? colors.accent : colors.textFaint, fontFamily: fonts.semibold }}>
          {it.label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.navWrap, { paddingBottom: insets.bottom || spacing(1.5) }]}>
      <View style={styles.navBar}>
        {left.map(renderItem)}
        <View style={{ width: 64 }} />
        {right.map(renderItem)}
      </View>
      <Pressable onPress={center.onPress} style={styles.fabWrap}>
        <LinearGradient
          colors={theme.gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Icon name={center.icon} size={24} color="#fff" />
        </LinearGradient>
        <Text style={{ fontSize: 11, color: colors.accent, fontFamily: fonts.semibold, marginTop: 2 }}>
          {center.label}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles({ mode, colors, shadow }: Theme) {
  return StyleSheet.create({
    glass: {
      backgroundColor: mode === 'dark' ? colors.glass : colors.card,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: mode === 'dark' ? colors.glassBorder : colors.cardBorder,
      padding: spacing(2.25),
      overflow: 'hidden',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radii.pill,
      paddingVertical: spacing(0.75),
      paddingHorizontal: spacing(1.5),
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    badge: {
      position: 'absolute',
      top: 9,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    tile: {
      backgroundColor: colors.glassStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radii.lg,
      paddingVertical: spacing(1.5),
      alignItems: 'center',
    },
    circleAction: {
      width: 50,
      height: 50,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: mode === 'dark' ? colors.glass : colors.card,
      borderWidth: 1,
      borderColor: mode === 'dark' ? colors.glassBorder : colors.cardBorder,
      borderRadius: radii.pill,
      paddingHorizontal: spacing(2),
      paddingVertical: spacing(1.25),
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1.5),
      paddingVertical: spacing(1.5),
    },
    divider: { borderTopWidth: 1, borderTopColor: colors.glassBorder },
    segWrap: {
      flexDirection: 'row',
      backgroundColor: colors.glass,
      borderRadius: radii.pill,
      padding: 4,
      gap: 4,
    },
    segItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing(1),
      borderRadius: radii.pill,
    },
    segItemActive: { backgroundColor: colors.accent },
    navWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing(2),
      paddingTop: spacing(1),
      alignItems: 'center',
    },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      backgroundColor: mode === 'dark' ? 'rgba(16,20,30,0.94)' : 'rgba(255,255,255,0.96)',
      borderWidth: 1,
      borderColor: mode === 'dark' ? colors.glassBorder : colors.cardBorder,
      borderRadius: radii.xl,
      paddingVertical: spacing(1.25),
      paddingHorizontal: spacing(1),
      ...shadow.card,
    },
    fabWrap: {
      position: 'absolute',
      top: -14,
      alignItems: 'center',
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      ...shadow.card,
    },
  });
}
