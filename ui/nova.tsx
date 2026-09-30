/**
 * NOVA — les pièces de la direction visuelle « une seule lumière, tout en
 * mouvement ». Elles ne remplacent pas le kit : elles s'appuient sur lui
 * (tokens, Pressable, Text, Icon) et n'ajoutent que ce qui manquait pour que
 * l'accueil et l'onboarding respirent de la même façon.
 *
 * Règles tenues ici comme ailleurs (Bible §3) : pas d'ombre, pas de dégradé
 * décoratif — l'or n'est qu'un point, le blanc n'est que le halo — et
 * « Réduire les animations » coupe tout mouvement autonome sans rien cacher.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from './theme';
import { Icon, type IconName } from './icon';
import { Text, Pressable as KPressable } from './kit';
import { BRAND_GOLD, springs, fontFamily } from './tokens';
import { useReduceMotion } from '../lib/reduceMotion';

export const GOLD = BRAND_GOLD.light;

/* ------------------------------------------------------------------ */
/* Orbite : deux anneaux autour du halo, un point d'or qui les parcourt */
/* ------------------------------------------------------------------ */

/**
 * Les anneaux sont centrés sur (cx, cy) dans un calque de `width` × `height`.
 * Le calque entier tourne très lentement (40 s par tour) : on ne voit pas les
 * cercles bouger, on voit le point d'or voyager.
 */
export function Orbit({ cx, cy, r = 150, style }: { cx: number; cy: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { mode } = useTheme();
  const reduce = useReduceMotion();
  const rot = useSharedValue(0);
  useEffect(() => {
    if (reduce) { rot.value = 0; return; }
    rot.value = withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [reduce, rot]);
  const size = (r + 70) * 2;
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const ink = mode === 'dark' ? '242,244,250' : '6,7,13';
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size }, spin, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgba(${ink},0.06)`} strokeWidth={1} />
        <Circle cx={size / 2} cy={size / 2} r={r + 60} fill="none" stroke={`rgba(${ink},0.045)`} strokeWidth={1} strokeDasharray="2 10" />
        <Circle cx={size / 2 + r} cy={size / 2} r={2.5} fill={GOLD} />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Poussière d'étoiles : particules qui montent lentement (onboarding)  */
/* ------------------------------------------------------------------ */

function Mote({ x, size, delay, dur, h, color }: { x: number; size: number; delay: number; dur: number; h: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [delay, dur, p]);
  const s = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 * 0.8 : p.value > 0.8 ? (1 - p.value) / 0.2 * 0.8 : 0.8,
    transform: [{ translateY: h - p.value * h * 1.1 }, { translateX: Math.sin(p.value * Math.PI * 2) * 8 }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, s]} />;
}

/** Quelques points de lumière qui dérivent vers le haut. Rien si « réduire les animations ». */
export function Stardust({ width, height, count = 18 }: { width: number; height: number; count?: number }) {
  const reduce = useReduceMotion();
  const motes = useMemo(() => {
    const palette = ['#FFFFFF', '#CFE3FF', '#FFD9B8', GOLD];
    return Array.from({ length: count }, (_, i) => ({
      x: ((i * 73) % 97) / 97 * width,
      size: 1.5 + (i % 3),
      delay: (i * 530) % 6000,
      dur: 7000 + ((i * 911) % 6000),
      color: palette[i % palette.length],
    }));
  }, [count, width]);
  if (reduce || !width || !height) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {motes.map((m, i) => <Mote key={i} {...m} h={height} />)}
    </View>
  );
}

export { SparkBurst } from './kit/SparkBurst';

/* ------------------------------------------------------------------ */
/* Fin d'entrée : le style animé est retiré une fois l'animation jouée   */
/* ------------------------------------------------------------------ */

/**
 * `true` une fois l'animation d'entrée terminée (`ms` après le montage).
 *
 * ÉCRAN NOIR DU MENU. Les onglets sont gelés quand on les quitte
 * (`freezeOnBlur`). À leur retour, React réapplique les props de son dernier
 * rendu — et pour un style animé, ce rendu porte la valeur du montage :
 * opacité 0. L'animation, finie, ne se rejoue pas : l'écran entier, ou le haut
 * du Menu (profil et quatre disques), restait noir. Une fois l'entrée jouée, le
 * composant se redessine SANS style animé : ce que React réapplique alors est
 * l'état visible.
 */
function useEntranceDone(ms: number, reduce: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (reduce) {
      setDone(true);
      return;
    }
    const id = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(id);
  }, [ms, reduce]);
  return done;
}

/* ------------------------------------------------------------------ */
/* Disque d'action                                                     */
/* ------------------------------------------------------------------ */

/**
 * `primary` : disque Lumière, icône encre — l'action principale, une seule par
 * rangée. `gold` : icône or — ce qui rapporte. Sinon : disque Orbite.
 */
export function ActionDisc({ icon, label, onPress, tone = 'default', index = 0, disabled }: { icon: IconName; label: string; onPress: () => void; tone?: 'primary' | 'gold' | 'default'; index?: number; disabled?: boolean }) {
  const { colors, mode } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(120 + index * 60, withSpring(1, springs.standard));
  }, [index, reduce, p]);
  const rise = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }, { scale: 0.9 + 0.1 * p.value }] }));
  const done = useEntranceDone(120 + index * 60 + 1200, reduce);
  const bg = tone === 'primary' ? colors.primary : colors.surface2;
  const ink = tone === 'primary' ? colors.onPrimary : tone === 'gold' ? (mode === 'dark' ? GOLD : BRAND_GOLD.deep) : colors.text;
  return (
    <Animated.View style={[{ flex: 1, opacity: disabled ? 0.4 : 1 }, done ? null : rise]}>
      <KPressable onPress={onPress} disabled={disabled} haptic="light" overshoot accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: bg, borderWidth: tone === 'primary' ? 0 : 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={23} color={ink} />
        </View>
        <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: fontFamily.semibold }}>{label}</Text>
      </KPressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Pilules de période et onglets texte                                 */
/* ------------------------------------------------------------------ */

export function Pills<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <KPressable
            key={it.key}
            onPress={() => onChange(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ height: 34, minWidth: 46, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface2 : 'transparent', borderWidth: 1, borderColor: on ? colors.border : 'transparent' }}
          >
            <Text variant="caption" tone={on ? 'primary' : 'tertiary'} style={{ fontFamily: fontFamily.semibold }}>{it.label}</Text>
          </KPressable>
        );
      })}
    </View>
  );
}

function TabLabel({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withSpring(on ? 1 : 0, springs.snappy);
  }, [on, reduce, p]);
  const dot = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: p.value }] }));
  return (
    <KPressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <Text variant="title2" style={{ color: on ? colors.text : colors.textTertiary }}>{label}</Text>
      <Animated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD }, dot]} />
    </KPressable>
  );
}

/** Onglets en texte, alignés à gauche, un point d'or sous l'actif. */
export function TextTabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 22 }} accessibilityRole="tablist">
      {items.map((it) => <TabLabel key={it.key} label={it.label} on={it.key === value} onPress={() => onChange(it.key)} />)}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Montée à l'entrée                                                   */
/* ------------------------------------------------------------------ */

/** Monte de 18 px en apparaissant, ressort « Standard ». Utilisable sans liste. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { p.value = 1; return; }
    p.value = withDelay(delay, withSpring(1, springs.gentle));
  }, [delay, reduce, p]);
  const s = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 18 }] }));
  const done = useEntranceDone(delay + 1400, reduce);
  return <Animated.View style={[done ? null : s, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ */
/* Pulsation : un point qui émet un anneau (en direct, en attente)      */
/* ------------------------------------------------------------------ */

export function Pulse({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 2.4 }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Étapes du parcours de création                                      */
/* ------------------------------------------------------------------ */

function FlowDot({ on, done }: { on: boolean; done: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withSpring(on ? 1 : 0, springs.standard);
  }, [on, reduce, p]);
  const s = useAnimatedStyle(() => ({ width: 6 + p.value * 16 }));
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: on || done ? GOLD : colors.surface3 }, s]} />;
}

/** Trois points, l'étape en cours s'allonge en or. */
export function FlowDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => <FlowDot key={i} on={i + 1 === step} done={i + 1 < step} />)}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Titre de section et icône en disque (listes de réglages)            */
/* ------------------------------------------------------------------ */

/** Petit titre de section en capitales espacées, au-dessus d'une carte. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="micro" tone="tertiary" style={{ letterSpacing: 1.2, textTransform: 'uppercase', marginLeft: 4, marginBottom: -4 }}>{children}</Text>
  );
}

/** Icône de ligne posée dans un disque Orbite — la même forme que les disques d'action. */
export function IconDisc({ name, tone = 'default', size = 36 }: { name: IconName; tone?: 'default' | 'gold' | 'danger'; size?: number }) {
  const { colors, mode } = useTheme();
  const ink = tone === 'gold' ? (mode === 'dark' ? GOLD : BRAND_GOLD.deep) : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={ink} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Décor et entrée communs à tous les écrans secondaires               */
/* ------------------------------------------------------------------ */

/**
 * La petite orbite en haut à droite, sans halo : la signature de l'accueil,
 * rappelée discrètement sur chaque écran secondaire. `top` = haut du contenu.
 */
export function ScreenOrbit({ top }: { top: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 220, height: top + 140, overflow: 'hidden' }}>
      <Orbit cx={190} cy={top + 22} r={64} />
    </View>
  );
}

/**
 * Entrée d'écran : le contenu monte de 14 px en apparaissant, une seule fois.
 * Rend `undefined` une fois l'entrée jouée (voir `useEntranceDone`).
 */
export function useScreenEntrance() {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { p.value = 1; return; }
    p.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
  const done = useEntranceDone(900, reduce);
  return done ? undefined : style;
}

/* ------------------------------------------------------------------ */
/* Trois points qui respirent : quelqu'un écrit                        */
/* ------------------------------------------------------------------ */

function TypingDot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false));
    return () => cancelAnimation(p);
  }, [delay, reduce, p]);
  const s = useAnimatedStyle(() => ({ opacity: 0.35 + p.value * 0.65, transform: [{ translateY: -3 * p.value }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textSecondary }, s]} />;
}

export function TypingDots() {
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', height: 14 }}>
      <TypingDot delay={0} />
      <TypingDot delay={140} />
      <TypingDot delay={280} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Écrans secondaires : héros, lignes de réglage, interrupteur, options */
/* ------------------------------------------------------------------ */

/**
 * En-tête d'écran Nova : un grand disque dans son orbite, le titre, une phrase.
 * Remplace le « Titre + texte gris » des écrans secondaires — c'est ce qui les
 * fait appartenir au même monde que l'accueil.
 */
export function NovaHero({ icon, title, subtitle, tone = 'default', children }: { icon?: IconName; title: string; subtitle?: string; tone?: 'default' | 'gold' | 'danger'; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 46, top: 46 }}><Orbit cx={0} cy={0} r={62} /></View>
        {children ?? (icon ? <IconDisc name={icon} tone={tone} size={80} /> : null)}
      </View>
      <Rise delay={60}><Text variant="title1" style={{ textAlign: 'center' }}>{title}</Text></Rise>
      {subtitle ? <Rise delay={120}><Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center', maxWidth: 330, lineHeight: 21 }}>{subtitle}</Text></Rise> : null}
    </View>
  );
}

/** Carte Nova : Nuit, arrondi 24, trait fin. `delay` la fait monter en cascade. */
export function NovaCard({ children, delay = 0, style, padded = true }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <Rise delay={delay} style={[{ borderRadius: 24, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, padding: padded ? 16 : 0, overflow: 'hidden' }, style]}>
      {children}
    </Rise>
  );
}

/** Interrupteur aux couleurs Nova : piste or quand il est allumé. */
export function NovaSwitch({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: colors.surface3, true: 'rgba(221,181,101,0.55)' }} thumbColor={value ? GOLD : '#C9CCD6'} ios_backgroundColor={colors.surface3} />;
}

/**
 * Ligne de réglage : disque d'icône, titre, indication, puis ce qu'on veut à
 * droite (interrupteur, chevron, valeur). `divider` trace le trait au-dessus.
 */
export function SettingRow({ icon, title, hint, right, onPress, divider, tone }: { icon: IconName; title: string; hint?: string; right?: React.ReactNode; onPress?: () => void; divider?: boolean; tone?: 'gold' | 'danger' }) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      <IconDisc name={icon} tone={tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" style={tone === 'danger' ? { color: colors.danger } : undefined}>{title}</Text>
        {hint ? <Text variant="caption" tone="secondary">{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null)}
    </View>
  );
  return onPress ? <KPressable onPress={onPress} noScale accessibilityRole="button" accessibilityLabel={title}>{body}</KPressable> : body;
}

/** Option à choisir parmi d'autres : pilule, point d'or sur la choisie. */
export function OptionPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <KPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: selected ? 'rgba(221,181,101,0.55)' : colors.border, backgroundColor: selected ? colors.surface2 : 'transparent' }}
    >
      {selected ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD }} /> : null}
      <Text variant="caption" style={{ fontFamily: fontFamily.semibold, color: selected ? colors.text : colors.textSecondary }}>{label}</Text>
    </KPressable>
  );
}
