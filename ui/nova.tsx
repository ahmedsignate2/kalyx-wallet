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
import React, { useEffect, useMemo } from 'react';
import { useLoopActive } from './useLoopActive';
import { View, type StyleProp, type ViewStyle } from 'react-native';
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
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme, useAppTheme, radii } from './theme';
import { Icon, type IconName } from './icon';
import { Text, Pressable as KPressable } from './kit';
import { Rise, useEntranceDone } from './kit/entrance';
import { BRAND_GOLD, springs, fontFamily, skies, skyPhaseAt, type ActionTint } from './tokens';
import { useReduceMotion } from '../lib/reduceMotion';
import { withAlpha } from '../lib/tokenColors';

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
  const active = useLoopActive();
  const rot = useSharedValue(0);
  useEffect(() => {
    if (reduce) { rot.value = 0; return; }
    if (!active) { cancelAnimation(rot); return; }
    // Reprise à l'angle affiché : on finit le tour en cours, puis les tours repartent de 0 (même position visuelle que 360).
    const from = rot.value % 360;
    rot.value = withSequence(
      withTiming(360, { duration: ((360 - from) / 360) * 40000, easing: Easing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(360, { duration: 40000, easing: Easing.linear })), -1, false),
    );
    return () => cancelAnimation(rot);
  }, [reduce, active, rot]);
  const size = (r + 70) * 2;
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const { colors } = useTheme();
  const ink = mode === 'dark' ? '255,244,230' : '70,48,24';
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size }, spin, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgba(${ink},0.06)`} strokeWidth={1} />
        <Circle cx={size / 2} cy={size / 2} r={r + 60} fill="none" stroke={`rgba(${ink},0.045)`} strokeWidth={1} strokeDasharray="2 10" />
        <Circle cx={size / 2 + r} cy={size / 2} r={2.5} fill={colors.warm} />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Poussière d'étoiles : particules qui montent lentement (onboarding)  */
/* ------------------------------------------------------------------ */

function Mote({ x, size, delay, dur, h, color, active }: { x: number; size: number; delay: number; dur: number; h: number; color: string; active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) { cancelAnimation(p); return; }
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [delay, dur, p, active]);
  const s = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 * 0.8 : p.value > 0.8 ? (1 - p.value) / 0.2 * 0.8 : 0.8,
    transform: [{ translateY: h - p.value * h * 1.1 }, { translateX: Math.sin(p.value * Math.PI * 2) * 8 }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, s]} />;
}

/** Quelques points de lumière qui dérivent vers le haut. Rien si « réduire les animations ». */
export function Stardust({ width, height, count = 18 }: { width: number; height: number; count?: number }) {
  const reduce = useReduceMotion();
  // Jusqu'à 22 boucles par écran : arrêtées dès que l'écran est recouvert ou l'app en arrière-plan.
  const active = useLoopActive();
  const motes = useMemo(() => {
    const palette = ['#FFFFFF', '#FFE6D2', '#FFD9B8', '#F2A274'];
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
      {motes.map((m, i) => <Mote key={i} {...m} h={height} active={active} />)}
    </View>
  );
}

export { SparkBurst } from './kit/SparkBurst';
export { Rise, useScreenEntrance } from './kit/entrance';

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
  /*
   * AUCUNE OPACITÉ dans l'entrée : seulement montée et échelle. Une entrée
   * interrompue (onglet gelé, accueil occupé) ne peut donc plus laisser les
   * disques à demi transparents — au pire légèrement décalés, jamais « grisés ».
   */
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * 14 }, { scale: 0.9 + 0.1 * p.value }] }));
  const done = useEntranceDone(120 + index * 60 + 1200, reduce, p);
  // Disques secondaires sur la surface la plus claire : actifs, pas éteints.
  // Disque teinté du sujet (comme les tuiles de l'accueil) ; `primary` reste l'encre, `gold` le sable.
  const { tints } = useTheme();
  const tone_ = tone === 'gold' ? tints.earn : tints[tintForIcon(icon)];
  const bg = tone === 'primary' ? colors.primary : mode === 'dark' ? colors.surface2 : tone_.bg;
  const ink = tone === 'primary' ? colors.onPrimary : tone_.ink;
  return (
    <Animated.View style={[{ flex: 1, opacity: disabled ? 0.4 : 1 }, done ? null : rise]}>
      <KPressable onPress={onPress} disabled={disabled} haptic="light" overshoot accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 58, height: 58, borderRadius: radii.full, backgroundColor: bg, borderWidth: tone === 'primary' ? 0 : 1, borderColor: colors.border, overflow: 'hidden' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tone !== 'primary' && mode === 'dark' ? tone_.bg : 'transparent' }}>
            <Icon name={icon} size={23} color={ink} />
          </View>
        </View>
        <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: fontFamily.semibold }}>{label}</Text>
      </KPressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Tuile d'action (accueil)                                            */
/* ------------------------------------------------------------------ */

/**
 * Une tuile par geste de l'argent, à SA teinte (tokens `tints`) : pastel posé
 * en Crème avec une ombre douce, lueur translucide en Nuit. L'icône et le mot
 * sont DANS la tuile — une cible de 76 px de haut, on ne la rate pas du pouce.
 */
export function ActionTile({ icon, label, tint, onPress, index = 0, disabled }: { icon: IconName; label: string; tint: ActionTint; onPress: () => void; index?: number; disabled?: boolean }) {
  const { tints, elevation, mode, colors } = useAppTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(80 + index * 50, withSpring(1, springs.standard));
  }, [index, reduce, p]);
  // Même règle que les disques : aucune opacité dans l'entrée, une entrée interrompue ne « grise » rien.
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * 16 }, { scale: 0.92 + 0.08 * p.value }] }));
  const done = useEntranceDone(80 + index * 50 + 1200, reduce, p);
  const tone = tints[tint];
  // En Nuit la teinte est translucide : posée sur la surface, pas sur le ciel qui transparaîtrait.
  const bg = mode === 'dark' ? colors.surface1 : tone.bg;
  return (
    <Animated.View style={[{ flex: 1, opacity: disabled ? 0.4 : 1 }, done ? null : rise]}>
      <KPressable onPress={onPress} disabled={disabled} haptic="light" overshoot accessibilityRole="button" accessibilityLabel={label} style={[{ height: 78, borderRadius: radii.lg, backgroundColor: bg, borderWidth: 1, borderColor: mode === 'dark' ? colors.border : 'rgba(255,255,255,0.7)', borderTopColor: mode === 'dark' ? colors.rim : 'rgba(255,255,255,0.95)' }, elevation]}>
        <View style={{ flex: 1, borderRadius: radii.lg, backgroundColor: mode === 'dark' ? tone.bg : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name={icon} size={22} color={tone.ink} />
          <Text variant="small" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3} style={{ fontFamily: fontFamily.semibold, color: mode === 'dark' ? colors.text : '#2A241C' }}>{label}</Text>
        </View>
      </KPressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Pilules de période et onglets texte                                 */
/* ------------------------------------------------------------------ */

export function Pills<K extends string>({ items, value, onChange, accent }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; /** Couleur de l'actif : la pilule active en prend une lueur (fiche token). */ accent?: string | null }) {
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
            style={{ height: 34, minWidth: 46, paddingHorizontal: 12, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (accent ? withAlpha(accent, 0.2) : colors.surface2) : 'transparent', borderWidth: 1, borderColor: on ? (accent ? withAlpha(accent, 0.45) : colors.border) : 'transparent' }}
          >
            <Text variant="caption" tone={on ? 'primary' : 'tertiary'} style={{ fontFamily: fontFamily.semibold }}>{it.label}</Text>
          </KPressable>
        );
      })}
    </View>
  );
}

/**
 * Onglets en PILULES, comme la maquette : un rail discret, l'onglet actif posé
 * dessus en relief (surface claire et ombre douce en Crème, surface plus haute
 * en Nuit). La pilule active GLISSE d'un onglet à l'autre au ressort.
 */
export function TextTabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { colors, mode, elevation } = useTheme();
  const reduce = useReduceMotion();
  /*
   * Chaque onglet est MESURÉ : la pilule prend sa position et sa largeur. Les
   * onglets se partagent la largeur quand il y a la place (accueil), et gardent
   * leur largeur naturelle dans un rail qui défile (Explorer, cinq onglets).
   */
  const [lay, setLay] = React.useState<Record<string, { x: number; w: number }>>({});
  const cur = lay[value];
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  useEffect(() => {
    if (!cur) return;
    const first = w.value === 0;
    x.value = reduce || first ? cur.x : withSpring(cur.x, springs.snappy);
    w.value = reduce || first ? cur.w : withSpring(cur.w, springs.snappy);
  }, [cur, reduce, x, w]);
  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: 'stretch', padding: 4, borderRadius: radii.full, backgroundColor: colors.surface2 }}>
      {cur ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 4, left: 0, bottom: 4, borderRadius: radii.full, backgroundColor: mode === 'dark' ? colors.surface3 : colors.surface1 }, mode === 'dark' ? null : elevation, pill]} />
      ) : null}
      {items.map((it) => {
        const on = it.key === value;
        return (
          <KPressable
            key={it.key}
            onPress={() => onChange(it.key)}
            onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setLay((m) => (m[it.key]?.x === lx && m[it.key]?.w === width ? m : { ...m, [it.key]: { x: lx, w: width } })); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flexGrow: 1, height: 38, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="caption" numberOfLines={1} style={{ fontFamily: on ? fontFamily.semibold : fontFamily.medium, color: on ? colors.text : colors.textSecondary }}>{it.label}</Text>
          </KPressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pulsation : un point qui émet un anneau (en direct, en attente)      */
/* ------------------------------------------------------------------ */

export function Pulse({ size = 10, color }: { size?: number; color?: string }) {
  const warm = useTheme().colors.warm;
  color = color ?? warm;
  const reduce = useReduceMotion();
  const active = useLoopActive();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(p); p.value = 0; return; }
    p.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, active, p]);
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
  return <Animated.View style={[{ height: 6, borderRadius: radii.full, backgroundColor: on || done ? colors.warm : colors.surface3 }, s]} />;
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

/** Titre de section au-dessus d'une carte : en casse de phrase, affirmé (plus de capitales espacées). */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="bodyStrong" style={{ marginLeft: 4, marginBottom: -2 }}>{children}</Text>
  );
}

/**
 * Teinte d'une icône d'écran : chaque famille de sujets a la sienne, tirée des
 * teintes des gestes (`tints`) — la sécurité en bleu, l'argent qui rentre en
 * menthe, les comptes en lavande… Ce qui n'est pas listé prend le sable.
 */
const TINT_BY_ICON: Partial<Record<IconName, ActionTint>> = {
  send: 'send', share: 'send', gift: 'send', invite: 'send',
  receive: 'receive', import: 'receive', check: 'receive', eye: 'receive', walletconnect: 'receive', dapps: 'receive',
  exchange: 'swap', convert: 'swap', accounts: 'swap', wallets: 'swap', wallet: 'swap', contacts: 'swap', profile: 'swap', sparkles: 'swap', create: 'swap', extensions: 'swap', networks: 'swap',
  security: 'buy', lock: 'buy', pin: 'buy', phrase: 'buy', incognito: 'buy', developer: 'buy', language: 'buy', about: 'buy', faq: 'buy', support: 'buy', notifications: 'buy', bell: 'buy',
  staking: 'earn', star: 'earn', starFilled: 'earn', history: 'earn', clock: 'earn', currency: 'earn', appearance: 'earn',
} as Partial<Record<IconName, ActionTint>>;
export const tintForIcon = (icon?: IconName): ActionTint => (icon && TINT_BY_ICON[icon]) || 'earn';

/**
 * Icône de ligne posée dans un disque teinté — la teinte vient du sujet
 * (`tintForIcon`), comme les tuiles de l'accueil. `gold` = ce qui rapporte,
 * `danger` = destructeur ; `neutral` garde la surface (listes très denses).
 */
export function IconDisc({ name, tone = 'default', size = 36, tint }: { name: IconName; tone?: 'default' | 'gold' | 'danger' | 'neutral'; size?: number; tint?: ActionTint }) {
  const { colors, tints, mode } = useTheme();
  const t = tone === 'gold' ? tints.earn : tone === 'neutral' ? null : tints[tint ?? tintForIcon(name)];
  const bg = tone === 'danger' ? (mode === 'dark' ? 'rgba(255,77,94,0.14)' : '#F9DCDC') : t ? t.bg : colors.surface2;
  const ink = tone === 'danger' ? colors.danger : t ? t.ink : colors.text;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={ink} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Décor et entrée communs à tous les écrans secondaires               */
/* ------------------------------------------------------------------ */

/**
 * LE CIEL EN ÉCHO : en haut des écrans secondaires, une lueur venue du ciel de
 * l'accueil (même heure, même couleur d'horizon) qui se fond dans le fond.
 * Discrète — c'est un rappel, pas un décor. `top` = haut du contenu.
 */
export function ScreenOrbit({ top }: { top: number }) {
  const { mode } = useTheme();
  const phase = skyPhaseAt(new Date().getHours());
  const horizon = skies[phase].sky[2];
  const h = top + 180;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h }}>
      <Svg width="100%" height={h}>
        <Defs>
          <SvgLinearGradient id="echo" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={horizon} stopOpacity={mode === 'dark' ? 0.16 : 0.26} />
            <Stop offset="1" stopColor={horizon} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={h} fill="url(#echo)" />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Trois points qui respirent : quelqu'un écrit                        */
/* ------------------------------------------------------------------ */

function TypingDot({ delay, active }: { delay: number; active: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(p); return; }
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false));
    return () => cancelAnimation(p);
  }, [delay, reduce, p, active]);
  const s = useAnimatedStyle(() => ({ opacity: 0.35 + p.value * 0.65, transform: [{ translateY: -3 * p.value }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: radii.full, backgroundColor: colors.textSecondary }, s]} />;
}

export function TypingDots() {
  const active = useLoopActive();
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', height: 14 }}>
      <TypingDot delay={0} active={active} />
      <TypingDot delay={140} active={active} />
      <TypingDot delay={280} active={active} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Écrans secondaires : héros, lignes de réglage, interrupteur, options */
/* ------------------------------------------------------------------ */

/**
 * En-tête d'écran : une TUILE teintée (la teinte du sujet, comme les tuiles de
 * l'accueil), le titre, une phrase. Plus d'orbite ni de disque gris : la même
 * matière que l'accueil, sur chaque écran secondaire. `children` remplace la
 * tuile (anneau de score, avatar, logo).
 */
export function NovaHero({ icon, title, subtitle, tone = 'default', children, compact }: { icon?: IconName; title: string; subtitle?: string; tone?: 'default' | 'gold' | 'danger'; children?: React.ReactNode; /** Tuile réduite, pour un écran fixe qui manque de hauteur. */ compact?: boolean }) {
  const { tints, elevation, mode, colors } = useTheme();
  const box = compact ? 60 : 84;
  const t = tone === 'gold' ? tints.earn : tints[tintForIcon(icon)];
  const bg = tone === 'danger' ? (mode === 'dark' ? 'rgba(255,77,94,0.14)' : '#F9DCDC') : t.bg;
  const ink = tone === 'danger' ? colors.danger : t.ink;
  return (
    <View style={{ alignItems: 'center', gap: compact ? 6 : 10, paddingTop: compact ? 0 : 4, paddingBottom: compact ? 4 : 8 }}>
      {children ? (
        <View style={{ minHeight: box, alignItems: 'center', justifyContent: 'center', marginBottom: compact ? 0 : 4 }}>{children}</View>
      ) : icon ? (
        <Rise style={[{ width: box, height: box, borderRadius: compact ? 20 : 26, marginBottom: compact ? 0 : 4, backgroundColor: mode === 'dark' ? colors.surface1 : bg, borderWidth: 1, borderColor: mode === 'dark' ? colors.border : 'rgba(255,255,255,0.8)', borderTopColor: mode === 'dark' ? colors.rim : 'rgba(255,255,255,0.95)' }, elevation]}>
          <View style={{ flex: 1, borderRadius: compact ? 20 : 26, backgroundColor: mode === 'dark' ? bg : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={compact ? 26 : 36} color={ink} />
          </View>
        </Rise>
      ) : null}
      <Rise delay={60}><Text variant="title1" style={{ textAlign: 'center' }}>{title}</Text></Rise>
      {subtitle ? <Rise delay={120}><Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center', maxWidth: 330, lineHeight: 21 }}>{subtitle}</Text></Rise> : null}
    </View>
  );
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

/** Option à choisir parmi d'autres : pilule ; la choisie passe à l'encre (comme les filtres de la maquette). */
export function OptionPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <KPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 14, borderRadius: radii.full, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface1 }}
    >
      <Text variant="caption" style={{ fontFamily: fontFamily.semibold, color: selected ? colors.onPrimary : colors.textSecondary }}>{label}</Text>
    </KPressable>
  );
}
