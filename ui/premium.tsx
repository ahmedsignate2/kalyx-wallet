/**
 * Composants UI premium V2 (glassmorphism, dark bleuté, accents violet/bleu).
 * Purement présentationnels — aucune logique crypto. Réutilisables sur tous les
 * écrans. Les icônes utilisent des emoji en attendant un set d'icônes dédié.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, radii, spacing, typography, shadow } from './theme';

/** Fond dégradé plein écran + zone scrollable + padding safe-area. */
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
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing(1),
          paddingHorizontal: spacing(2.5),
          paddingBottom: insets.bottom + spacing(12),
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

/** Bouton d'action circulaire (glass) + libellé dessous. */
export function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ alignItems: 'center', gap: 8, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, flex: 1 }]}
    >
      {primary ? (
        <LinearGradient
          colors={gradients.accent as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionCircle}
        >
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.actionCircle, styles.actionGlass]}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </View>
      )}
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress }: { icon: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.iconBtn}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
    </Pressable>
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
    <View style={[styles.avatar, { backgroundColor: color + '33', borderColor: color + '55' }]}>
      <Text style={{ fontSize: 18 }}>{label}</Text>
    </View>
  );
}

export function AccountRow({
  icon,
  title,
  subtitle,
  right,
  active,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View style={[styles.listRow, active ? { borderColor: colors.accent } : null]}>
        <Avatar label={icon} />
        <View style={{ flex: 1 }}>
          <Text style={typography.bodyStrong}>{title}</Text>
          <Text style={typography.muted}>{subtitle}</Text>
        </View>
        {right ?? <Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>}
      </View>
    </Pressable>
  );
}

export function MarketRow({
  icon,
  name,
  symbol,
  price,
  change,
}: {
  icon: string;
  name: string;
  symbol: string;
  price: string;
  change: number;
}) {
  const up = change >= 0;
  return (
    <View style={styles.listRow}>
      <Avatar label={icon} color={up ? colors.up : colors.down} />
      <View style={{ flex: 1 }}>
        <Text style={typography.bodyStrong}>{name}</Text>
        <Text style={typography.muted}>{symbol}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{price}</Text>
        <Text style={{ color: up ? colors.up : colors.down, fontSize: 13 }}>
          {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

export interface NavItem {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
}

export function BottomNav({ items, active }: { items: NavItem[]; active: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.navWrap, { paddingBottom: insets.bottom || spacing(1.5) }]}>
      <View style={styles.navBar}>
        {items.map((it) => {
          const on = it.key === active;
          return (
            <Pressable key={it.key} onPress={it.onPress} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 20, opacity: on ? 1 : 0.55 }}>{it.icon}</Text>
              <Text style={{ fontSize: 11, color: on ? colors.accent : colors.textFaint, fontWeight: '600' }}>
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: colors.glass,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing(2.5),
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
  actionCircle: {
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlass: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.lg,
    padding: spacing(1.75),
  },
  navWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(1),
  },
  navBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(18,23,34,0.92)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.xl,
    paddingVertical: spacing(1.25),
    paddingHorizontal: spacing(1),
    ...shadow.card,
  },
});
