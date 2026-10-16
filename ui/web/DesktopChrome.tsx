/**
 * Chrome ordinateur du tableau de bord : la colonne de gauche (marque et
 * réseau, menu, téléphone connecté) et les tuiles des gestes. Même système
 * visuel que le mobile (webTheme.ts) — présentationnel, piloté par props.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { KalyxLogo } from '../KalyxLogo';
import { Icon, type IconName } from '../icon';
import { WEB_FONTS, useWebPalette } from './webTheme';
import { KalyxSpinner } from './motion';
import type { DockTab } from './MobileChrome';
import { fontSize, radii } from '../tokens';

const NAV: { key: DockTab; icon: IconName }[] = [
  { key: 'home', icon: 'home' },
  { key: 'market', icon: 'market' },
  { key: 'agent', icon: 'sparkles' },
  { key: 'settings', icon: 'gear' },
];

/* ------------------------------------------------------------------ */
/* Colonne de gauche : menu et état, en cartes                         */
/* ------------------------------------------------------------------ */

/** Carte blanche de la colonne de gauche (même rayon que les listes du tableau de bord). */
function SideCard({ children }: { children: React.ReactNode }) {
  const P = useWebPalette();
  return <View style={{ backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 24, overflow: 'hidden' }}>{children}</View>;
}

/** Le menu : une liste dans une carte, l'onglet actif en couleur, des filets entre les lignes. */
export function NavCard({ tab, onChange, labels }: { tab: DockTab; onChange: (t: DockTab) => void; labels: Record<DockTab, string> }) {
  const P = useWebPalette();
  return (
    <SideCard>
      {NAV.map((it, i) => {
        const on = it.key === tab;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 18, backgroundColor: pressed || hovered ? P.surfaceHi : 'transparent' })}
          >
            <Icon name={it.icon} size={20} color={on ? P.accent : P.text} weight={on ? 'fill' : 'regular'} />
            <View style={{ flex: 1, paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: P.divider }}>
              <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: fontSize.md, color: on ? P.accent : P.text }}>{labels[it.key]}</Text>
            </View>
          </Pressable>
        );
      })}
    </SideCard>
  );
}

/** Le téléphone connecté : nom, dernière activité, et de quoi couper la connexion. */
export function StatusCard({ title, detail, disconnectLabel, onDisconnect }: { title: string; detail: string; disconnectLabel: string; onDisconnect: () => void }) {
  const P = useWebPalette();
  return (
    <SideCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: P.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={18} color={P.accent} />
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: P.up, borderWidth: 2, borderColor: P.surface }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: fontSize.sm, color: P.text }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: fontSize.xs, color: P.muted }} numberOfLines={1}>{detail}</Text>
        </View>
      </View>
      <Pressable onPress={onDisconnect} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 18, backgroundColor: pressed || hovered ? P.surfaceHi : 'transparent' })}>
        <Icon name="close" size={18} color={P.down} />
        <View style={{ flex: 1, paddingVertical: 13, borderTopWidth: 1, borderTopColor: P.divider }}>
          <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: fontSize.sm, color: P.down }}>{disconnectLabel}</Text>
        </View>
      </Pressable>
    </SideCard>
  );
}

/** En-tête de la colonne de gauche : la marque, le réseau, rafraîchir. */
export function SideHeader({ network, onNetwork, onRefresh, refreshing }: { network: { avatar: React.ReactNode; name: string }; onNetwork: () => void; onRefresh: () => void; refreshing?: boolean }) {
  const P = useWebPalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' }}>
        <KalyxLogo size={22} />
      </View>
      <Pressable onPress={onNetwork} style={({ pressed }) => ({ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: radii.full, paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}>
        {network.avatar}
        <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: fontSize.md, color: P.text }} numberOfLines={1}>{network.name}</Text>
        <Icon name="caretDown" size={14} color={P.muted} />
      </Pressable>
      <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        {refreshing ? <KalyxSpinner size={16} /> : <Icon name="refresh" size={17} color={P.muted} />}
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Les gestes : tuiles compactes                                       */
/* ------------------------------------------------------------------ */

const ACTION_TINT = { send: '#C4552A', receive: '#257F5A', swap: '#6450BE' } as const;

/**
 * Envoyer / Recevoir / Échanger en tuiles blanches compactes, l'icône dans la
 * teinte de son geste. `fill` : elles se partagent la largeur (téléphone).
 */
export function ActionTiles({ onSend, onReceive, onSwap, labels, fill }: { onSend: () => void; onReceive: () => void; onSwap: () => void; labels: { send: string; receive: string; swap: string }; fill?: boolean }) {
  const P = useWebPalette();
  const items: { k: keyof typeof ACTION_TINT; icon: IconName; label: string; onPress: () => void }[] = [
    { k: 'send', icon: 'send', label: labels.send, onPress: onSend },
    { k: 'receive', icon: 'receive', label: labels.receive, onPress: onReceive },
    { k: 'swap', icon: 'exchange', label: labels.swap, onPress: onSwap },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: fill ? 8 : 12 }}>
      {items.map((it) => (
        <Pressable
          key={it.k}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
            flex: fill ? 1 : undefined,
            width: fill ? undefined : 112,
            height: fill ? 70 : 96,
            borderRadius: 20,
            padding: fill ? 0 : 14,
            alignItems: fill ? 'center' : 'flex-start',
            justifyContent: fill ? 'center' : 'space-between',
            gap: fill ? 6 : 0,
            backgroundColor: hovered ? P.surfaceHi : P.surface,
            borderWidth: 1,
            borderColor: P.border,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <Icon name={it.icon} size={fill ? 22 : 24} color={ACTION_TINT[it.k]} weight="bold" />
          <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: fontSize.sm, color: P.text }} numberOfLines={1}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
