import { useT } from "../../lib/settingsStore";
/**
 * Barre d'adresse Kalyx (§ navigateur) — pilule de 48, fond Orbite, EN BAS.
 *  - Domaine principal en Lueur, sous-domaine en Brume : app.**uniswap.org**.
 *    C'est beau ET c'est de la sécurité : l'œil lit le vrai site.
 *  - À droite : le glyphe du compte connecté avec le logo de la chaîne.
 *  - Au scroll vers le bas elle se COMPACTE (domaine seul, 13 pt, sans fond),
 *    et revient avec le ressort Standard.
 *  - Jamais teintée par le site. Seul état spécial : Danger (rouge + alerte).
 *  - Onglet privé : fond Encre, fine bordure Brume, icône Detective.
 */
import React from 'react';
import { View, Pressable, Image } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Text, AddressGlyph } from '../kit';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { chainIconUrl } from '../../src';

/** Sépare « app.uniswap.org » → { sub: 'app.', root: 'uniswap.org' }. */
export function splitHost(host: string): { sub: string; root: string } {
  const parts = host.split('.');
  if (parts.length <= 2) return { sub: '', root: host };
  const two = ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  const keep = two ? 3 : 2;
  return { sub: parts.slice(0, -keep).join('.') + '.', root: parts.slice(-keep).join('.') };
}

export function AddressBar({
  host, secure, danger, incognito, address, chainId, compact, loading, onPress, onLongPress, onAccount, placeholder,
}: {
  host: string;
  secure: boolean;
  danger: boolean;
  incognito: boolean;
  address?: string;
  chainId: string;
  /** 0 = pleine, 1 = compacte (shared value pilotée par le scroll). */
  compact: SharedValue<number>;
  loading: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAccount: () => void;
  placeholder: string;
}) {
  const t = useT();
  const { colors } = useTheme();
  const { sub, root } = splitHost(host);
  const wrap = useAnimatedStyle(() => ({ height: 48 - compact.value * 20 }));
  const full = useAnimatedStyle(() => ({ opacity: 1 - compact.value, transform: [{ scale: 1 - compact.value * 0.08 }] }));
  const mini = useAnimatedStyle(() => ({ opacity: compact.value }));
  const bg = danger ? colors.danger : incognito ? colors.bg : colors.surface2;
  const fg = danger ? '#FFFFFF' : colors.text;
  const dim = danger ? 'rgba(255,255,255,0.75)' : colors.textSecondary;

  return (
    <Animated.View style={[{ flex: 1, justifyContent: 'center' }, wrap]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, full]}>
        <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="button" accessibilityLabel={host ? `Adresse : ${host}` : placeholder} style={{ height: 48, borderRadius: radius.round, backgroundColor: bg, borderWidth: 1, borderColor: incognito ? colors.textSecondary : danger ? colors.danger : colors.border, flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: 6, gap: space[2] }}>
          {host ? <Icon name={danger ? 'alert' : incognito ? 'incognito' : secure ? 'lock' : 'dapps'} size={15} color={danger ? fg : dim} /> : <Icon name="search" size={15} color={dim} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            {host ? (
              <Text variant="body" numberOfLines={1} style={{ color: fg }}>
                <Text variant="body" style={{ color: dim }}>{sub}</Text>
                {root}
              </Text>
            ) : (
              <Text variant="body" style={{ color: dim }} numberOfLines={1}>{placeholder}</Text>
            )}
          </View>
          {loading ? <Icon name="clock" size={14} color={dim} /> : null}
          {address ? (
            <Pressable onPress={onAccount} hitSlop={8} accessibilityLabel={t("addressBarConnect")} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <AddressGlyph address={address} size={26} background={!danger} />
              {chainIconUrl(chainId) ? (
                <View style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.surface1, borderWidth: 1.5, borderColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Image source={{ uri: chainIconUrl(chainId) }} style={{ width: 10, height: 10, borderRadius: 5, opacity: 0.9 }} />
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, mini]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {host ? <Icon name={danger ? 'alert' : incognito ? 'incognito' : 'lock'} size={11} color={danger ? colors.danger : colors.textSecondary} /> : null}
          <Text variant="caption" numberOfLines={1} style={{ color: danger ? colors.danger : colors.text }}>
            <Text variant="caption" tone="secondary">{sub}</Text>{root || placeholder}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
