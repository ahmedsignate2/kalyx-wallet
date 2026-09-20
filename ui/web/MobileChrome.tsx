/**
 * Éléments de « chrome » de l'accueil mobile du tableau de bord web (en-tête,
 * pilule réseau, rangée d'actions, onglets soulignés, dock flottant) — purement
 * présentationnels, pilotés par props, aux valeurs exactes de la maquette
 * validée (cf. webTheme.ts). Aucune donnée réseau ici.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { KalyxSpinner } from './motion';
import { KalyxLogo } from '../KalyxLogo';
import { Icon, type IconName } from '../icon';
import { WEB_FONTS, useWebPalette } from './webTheme';

/* ------------------------------------------------------------------ En-tête */

export function MobileHeader({ onRefresh, subtitle, refreshing }: { onRefresh: () => void; subtitle: string; refreshing?: boolean }) {
  const P = useWebPalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' }}>
          <KalyxLogo size={18} />
          <View style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: P.up, borderWidth: 2, borderColor: P.bg }} />
        </View>
        <View>
          <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 15, color: P.text, lineHeight: 17 }}>Kalyx</Text>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 11, color: P.muted, lineHeight: 13 }}>{subtitle}</Text>
        </View>
      </View>
      <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        {refreshing ? <KalyxSpinner size={18} /> : <Icon name="refresh" size={18} color={P.muted} />}
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------ Pilule réseau */

export function NetworkPill({ avatar, name, onPress }: { avatar: React.ReactNode; name: string; onPress: () => void }) {
  const P = useWebPalette();
  return (
    <View style={{ flexDirection: 'row' }}>
      <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}>
        {avatar}
        <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.text2 }} numberOfLines={1}>{name}</Text>
        <Icon name="caretDown" size={14} color={P.muted} />
      </Pressable>
    </View>
  );
}

/* --------------------------------------------------------- Rangée d'actions */

function ActionButton({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  const P = useWebPalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16,
        backgroundColor: primary ? P.accent : P.surface, borderWidth: 1, borderColor: primary ? P.accent : P.border,
        opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Icon name={icon} size={20} color={primary ? P.onAccent : P.text2} />
      <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: primary ? '600' : '500', fontSize: 12, color: primary ? P.onAccent : P.text2 }}>{label}</Text>
    </Pressable>
  );
}

export function ActionRow({ onReceive, onSend, onSwap, labels }: { onReceive: () => void; onSend: () => void; onSwap: () => void; labels: { receive: string; send: string; swap: string } }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <ActionButton icon="receive" label={labels.receive} onPress={onReceive} />
      <ActionButton icon="send" label={labels.send} onPress={onSend} primary />
      <ActionButton icon="exchange" label={labels.swap} onPress={onSwap} />
    </View>
  );
}

/* --------------------------------------------------------- Chips de période */

export function PeriodChips<T extends string>({ options, value, onChange }: { options: { k: T; l: string }[]; value: T; onChange: (k: T) => void }) {
  const P = useWebPalette();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} onPress={() => onChange(o.k)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? P.surfaceHi : 'transparent' }}>
            <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: on ? '600' : '500', fontSize: 13, color: on ? P.text : P.muted }}>{o.l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------- Onglets soulignés */

export function SegmentTabs<T extends string>({ tabs, value, onChange }: { tabs: { k: T; l: string }[]; value: T; onChange: (k: T) => void }) {
  const P = useWebPalette();
  // Soulignement qui GLISSE vers l'onglet actif (translateX + largeur animés)
  // au lieu de sauter — mesure de chaque onglet au layout.
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    if (!placed.current) { x.setValue(l.x); w.setValue(l.w); placed.current = true; return; }
    Animated.parallel([
      Animated.spring(x, { toValue: l.x, speed: 22, bounciness: 4, useNativeDriver: false }),
      Animated.spring(w, { toValue: l.w, speed: 22, bounciness: 4, useNativeDriver: false }),
    ]).start();
  }, [layouts, value, x, w]);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: P.divider }}>
      <View style={{ flexDirection: 'row', gap: 22 }}>
        {tabs.map((tb) => {
          const on = tb.k === value;
          return (
            <Pressable
              key={tb.k}
              onPress={() => onChange(tb.k)}
              onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setLayouts((cur) => (cur[tb.k]?.x === lx && cur[tb.k]?.w === width ? cur : { ...cur, [tb.k]: { x: lx, w: width } })); }}
              style={{ paddingBottom: 10 }}
            >
              <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: on ? '600' : '500', fontSize: 14, color: on ? P.text : P.muted }}>{tb.l}</Text>
            </Pressable>
          );
        })}
      </View>
      {placed.current || layouts[value] ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: -1, left: 0, height: 2, backgroundColor: P.accent, width: w, transform: [{ translateX: x }] }} />
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- État vide */

export function MobileEmptyState({ icon, title, subtitle, action }: { icon: IconName; title: string; subtitle: string; action?: { label: string; onPress: () => void } }) {
  const P = useWebPalette();
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 20, paddingBottom: 10, paddingHorizontal: 20 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={P.faint} />
      </View>
      <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 15, color: P.text2 }}>{title}</Text>
      <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.muted, lineHeight: 19.5, textAlign: 'center', maxWidth: 260 }}>{subtitle}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={6}>
          <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: 13, color: P.accent, textDecorationLine: 'underline' }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ Dock flottant */

export type DockTab = 'home' | 'market' | 'agent' | 'settings';

/** Hauteur à réserver sous le contenu pour ne rien cacher derrière le dock. */
export const DOCK_CLEARANCE = 110;

export function FloatingDock({ tab, onChange, onSwapPress, labels }: { tab: DockTab; onChange: (t: DockTab) => void; onSwapPress: () => void; labels: Record<DockTab, string> }) {
  const P = useWebPalette();
  const item = (key: DockTab, icon: IconName) => {
    const on = key === tab;
    return (
      <Pressable key={key} onPress={() => onChange(key)} style={({ pressed }) => ({ alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, minWidth: 56, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
        <View style={{ transform: [{ scale: on ? 1.08 : 1 }] }}>
          <Icon name={icon} size={20} color={on ? P.text : P.muted} weight={on ? 'fill' : 'regular'} />
        </View>
        <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: on ? '600' : '500', fontSize: 10, color: on ? P.text : P.muted }} numberOfLines={1}>{labels[key]}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? P.accent : 'transparent', marginTop: -2 }} />
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', paddingHorizontal: 20, zIndex: 10 }}>
      <View style={{ width: '100%', maxWidth: 390, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 6 }}>
        {item('home', 'home')}
        {item('market', 'market')}
        <Pressable
          onPress={onSwapPress}
          style={({ pressed }) => ({
            width: 52, height: 52, borderRadius: 26, marginTop: -30,
            backgroundColor: P.accent, borderWidth: 3, borderColor: P.bg,
            alignItems: 'center', justifyContent: 'center',
            // Ombre portée + léger halo laiton : le bouton « flotte » au-dessus du dock.
            shadowColor: pressed ? '#000' : P.accent, shadowOpacity: pressed ? 0.45 : 0.35, shadowRadius: pressed ? 16 : 14, shadowOffset: { width: 0, height: 6 },
            opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Icon name="exchange" size={20} color={P.onAccent} />
        </Pressable>
        {item('agent', 'sparkles')}
        {item('settings', 'gear')}
      </View>
    </View>
  );
}
