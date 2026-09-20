/**
 * Éléments de « chrome » de l'accueil mobile du tableau de bord web (en-tête,
 * pilule réseau, rangée d'actions, onglets soulignés, dock flottant) — purement
 * présentationnels, pilotés par props, aux valeurs exactes de la maquette
 * validée (cf. webTheme.ts). Aucune donnée réseau ici.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { KalyxLogo } from '../KalyxLogo';
import { Icon, type IconName } from '../icon';
import { WEB_FONTS, useWebPalette } from './webTheme';

/* ------------------------------------------------------------------ En-tête */

export function MobileHeader({ onRefresh, subtitle }: { onRefresh: () => void; subtitle: string }) {
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
      <Pressable onPress={onRefresh} hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Icon name="refresh" size={18} color={P.muted} />
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
  return (
    <View style={{ flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: P.divider }}>
      {tabs.map((tb) => {
        const on = tb.k === value;
        return (
          <Pressable key={tb.k} onPress={() => onChange(tb.k)} style={{ paddingBottom: 10, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: on ? P.accent : 'transparent' }}>
            <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: on ? '600' : '500', fontSize: 14, color: on ? P.text : P.muted }}>{tb.l}</Text>
          </Pressable>
        );
      })}
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
      <Pressable key={key} onPress={() => onChange(key)} style={{ alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, minWidth: 56 }}>
        <Icon name={icon} size={20} color={on ? P.text : P.muted} weight={on ? 'fill' : 'regular'} />
        <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '500', fontSize: 10, color: on ? P.text : P.muted }} numberOfLines={1}>{labels[key]}</Text>
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
