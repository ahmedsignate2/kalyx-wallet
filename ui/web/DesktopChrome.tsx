/**
 * Chrome ordinateur du tableau de bord : barre latérale de navigation
 * (logo, réseau, onglets, état de la connexion) et barre supérieure de la
 * colonne de contenu. Même système visuel que le mobile (webTheme.ts) —
 * présentationnel, piloté par props.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { KalyxLogo } from '../KalyxLogo';
import { Icon, type IconName } from '../icon';
import { WEB_FONTS, useWebPalette } from './webTheme';
import { KalyxSpinner } from './motion';
import type { DockTab } from './MobileChrome';

export const SIDEBAR_WIDTH = 248;
export const RAIL_WIDTH = 76;

const NAV: { key: DockTab; icon: IconName }[] = [
  { key: 'home', icon: 'home' },
  { key: 'market', icon: 'market' },
  { key: 'agent', icon: 'sparkles' },
  { key: 'settings', icon: 'gear' },
];

export function Sidebar({
  rail, tab, onChange, labels, subtitle, network, onNetwork, status, onDisconnect,
}: {
  /** Rail étroit (icônes seules) sur les largeurs intermédiaires. */
  rail: boolean;
  tab: DockTab;
  onChange: (t: DockTab) => void;
  labels: Record<DockTab, string>;
  subtitle: string;
  network: { avatar: React.ReactNode; name: string };
  onNetwork: () => void;
  status: { title: string; detail: string; disconnectLabel: string };
  onDisconnect: () => void;
}) {
  const P = useWebPalette();
  return (
    <View style={{ width: rail ? RAIL_WIDTH : SIDEBAR_WIDTH, borderRightWidth: 1, borderRightColor: P.divider, paddingVertical: 22, paddingHorizontal: rail ? 12 : 16, gap: 22, backgroundColor: P.bg }}>
      {/* Marque */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: rail ? 0 : 6, justifyContent: rail ? 'center' : 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center' }}>
          <KalyxLogo size={20} />
          <View style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: P.up, borderWidth: 2, borderColor: P.bg }} />
        </View>
        {rail ? null : (
          <View>
            <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 17, color: P.text, lineHeight: 20 }}>Kalyx</Text>
            <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 11, color: P.muted, lineHeight: 14 }}>{subtitle}</Text>
          </View>
        )}
      </View>

      {/* Réseau */}
      <Pressable onPress={onNetwork} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 8, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: rail ? 0 : 14, opacity: pressed ? 0.7 : 1 })}>
        {network.avatar}
        {rail ? null : (
          <>
            <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.text2, flex: 1 }} numberOfLines={1}>{network.name}</Text>
            <Icon name="caretDown" size={14} color={P.muted} />
          </>
        )}
      </Pressable>

      {/* Navigation */}
      <View style={{ gap: 4 }}>
        {NAV.map((it) => {
          const on = it.key === tab;
          return (
            <Pressable
              key={it.key}
              onPress={() => onChange(it.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: rail ? 0 : 12, borderRadius: 12, backgroundColor: on ? P.surface : pressed ? P.surface + '80' : 'transparent', borderWidth: 1, borderColor: on ? P.border : 'transparent' })}
            >
              <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: on ? P.accent : 'transparent', marginLeft: rail ? 0 : -6, position: rail ? 'absolute' : 'relative', left: rail ? 4 : undefined }} />
              <Icon name={it.icon} size={20} color={on ? P.text : P.muted} weight={on ? 'fill' : 'regular'} />
              {rail ? null : <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: on ? '600' : '500', fontSize: 14, color: on ? P.text : P.muted }}>{labels[it.key]}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {/* État de la connexion (téléphone = coffre) */}
      <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: P.divider, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: rail ? 'center' : 'flex-start' }}>
          <Icon name="security" size={16} color={P.accent} />
          {rail ? null : (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: 12, color: P.text }} numberOfLines={1}>{status.title}</Text>
              <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 11, color: P.muted }} numberOfLines={1}>{status.detail}</Text>
            </View>
          )}
        </View>
        {rail ? null : (
          <Pressable onPress={onDisconnect} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: P.down }}>{status.disconnectLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Barre supérieure de la colonne de contenu : titre de la page, rafraîchir, ligne de confiance. */
export function TopBar({ title, trust, onRefresh, refreshing }: { title: string; trust: string; onRefresh: () => void; refreshing?: boolean }) {
  const P = useWebPalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 6 }}>
      <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 22, color: P.text, letterSpacing: -0.2 }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="security" size={13} color={P.accent} />
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: P.muted }}>{trust}</Text>
        </View>
        <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={6} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          {refreshing ? <KalyxSpinner size={16} /> : <Icon name="refresh" size={16} color={P.muted} />}
        </Pressable>
      </View>
    </View>
  );
}

/** Titre de section discret (rail Marché, groupes des Réglages). */
export function SectionTitle({ children }: { children: string }) {
  const P = useWebPalette();
  return <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: P.faint }}>{children}</Text>;
}
