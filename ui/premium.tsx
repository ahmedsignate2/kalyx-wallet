/**
 * Composants UI premium V2 (glassmorphism, dark bleuté, accents violet/bleu).
 * Purement présentationnels — aucune logique crypto. Calés sur la maquette de
 * référence (carte solde à dégradé + sparkline, tuiles d'action, listes en
 * cartes, bottom nav à bouton central). Icônes : emoji/glyphes en attendant un
 * set dédié.
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Path, Defs, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { colors, gradients, radii, spacing, typography, shadow } from './theme';
import { Icon, type IconName } from './icon';

export function PremiumScreen({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <LinearGradient colors={gradients.screen as unknown as string[]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing(1.5),
          paddingHorizontal: spacing(2.5),
          paddingBottom: insets.bottom + spacing(13),
          gap: spacing(2.5),
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
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
      onPressIn={() => animate(scaleTo)}
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
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.glassStrong, opacity }, style]} />;
}

/** Ligne squelette (avatar + 2 lignes + valeur) pour listes en chargement. */
export function SkeletonRow({ divider }: { divider?: boolean }) {
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
  return (
    <View style={[styles.glass, shadow.card, style]}>
      {glow ? (
        <LinearGradient
          colors={gradients.card as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* Reflet supérieur (glassmorphism) */}
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'] as unknown as string[]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48 }}
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
  const color =
    tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : colors.text;
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={styles.chip}>
        <Text style={{ color, fontWeight: '600' }}>{label}</Text>
        {onPress ? <Text style={{ color: colors.textMuted }}>▾</Text> : null}
      </View>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, badge }: { icon: IconName; onPress?: () => void; badge?: boolean }) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.iconBtn}>
        <Icon name={icon} size={19} color={colors.text} />
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
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1 }}>
      <View style={[styles.tile, disabled ? { opacity: 0.4 } : null]}>
        <Text style={{ fontSize: 20, color: colors.text }}>{icon}</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6 }}>{label}</Text>
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
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ alignItems: 'center', gap: 8, flex: 1, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <View style={styles.circleAction}>
        <Icon name={icon} size={22} color={colors.text} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Petit badge (ex. TESTNET). */
export function Badge({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'accent' }) {
  const c = tone === 'accent' ? colors.accent : colors.warning;
  return (
    <View style={{ backgroundColor: c + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: c, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>{label}</Text>
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
  const c = tone === 'warning' ? colors.warning : colors.danger;
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
      <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{message}</Text>
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
  return (
    <View style={styles.rowBetween}>
      <Text style={typography.section}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({ label, color = colors.accent }: { label: string; color?: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color }]}>
      <Text style={{ fontSize: 18, color: '#fff' }}>{label}</Text>
    </View>
  );
}

export function GradientAvatar({ label }: { label: string }) {
  return (
    <LinearGradient
      colors={gradients.accent as unknown as string[]}
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
  const content = (
    <View style={[styles.listItem, divider ? styles.divider : null]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={typography.bodyStrong}>{title}</Text>
        {subtitle ? <Text style={typography.muted}>{subtitle}</Text> : null}
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
  return (
    <View style={styles.segWrap}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={[styles.segItem, on ? styles.segItemActive : null]}>
            <Text style={{ color: on ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{it.label}</Text>
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
  const up = change >= 0;
  const c = up ? colors.up : colors.down;
  const content = (
    <View style={[styles.listItem, divider ? styles.divider : null]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: 42, height: 42, borderRadius: 21 }} />
      ) : (
        <Avatar label={icon} color={color} />
      )}
      <View style={{ width: 88 }}>
        <Text style={typography.bodyStrong}>{name}</Text>
        <Text style={typography.muted}>{symbol}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Sparkline data={spark} color={c} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{price}</Text>
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
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  const renderItem = (it: NavItem) => {
    const on = it.key === active;
    return (
      <Pressable key={it.key} onPress={it.onPress} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
        <Icon name={it.icon} size={22} color={on ? colors.accent : colors.textFaint} />
        <Text style={{ fontSize: 11, color: on ? colors.accent : colors.textFaint, fontWeight: '600' }}>
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
          colors={gradients.accent as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Icon name={center.icon} size={24} color="#fff" />
        </LinearGradient>
        <Text style={{ fontSize: 11, color: colors.accent, fontWeight: '600', marginTop: 2 }}>
          {center.label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: colors.glass,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
    backgroundColor: 'rgba(16,20,30,0.94)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
    ...shadow.card,
  },
});
