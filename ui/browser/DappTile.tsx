/**
 * Tuile de dApp uniforme (rond 58, logo 32) + label d'une ligne.
 *
 * LOGO SANS REQUÊTE TIERCE : l'ancien favicon passait par Google s2, qui
 * apprenait ainsi chaque hôte visité. Dorénavant : le VRAI logo, embarqué dans
 * l'app (ui/browser/dappLogos), pour toutes les dApps du catalogue ; pour les
 * autres sites, une marque neutre (jamais de lettre, jamais un faux logo).
 */
import { Image, View } from 'react-native';
import { Pressable, Text } from '../kit';
import { FallbackMark } from '../kit/FallbackMark';
import { useTheme } from '../theme';
import { space, radii } from '../tokens';
import { catalogEntry } from '../../src/domain/web/dappCatalog';
import { DAPP_LOGOS } from './dappLogos';

/** Lettre affichée pour un hôte hors catalogue : 1re lettre du nom de domaine (« app.foo.xyz » → F). */
export function monogramOf(host: string): string {
  const name = siteName(host || '?');
  const c = name.replace(/^[^a-z0-9]+/i, '').charAt(0);
  return (c || '?').toUpperCase();
}

export function DappLogo({ host, size = 32 }: { host: string; size?: number }) {
  const entry = catalogEntry(host);
  const logo = entry ? DAPP_LOGOS[entry.host] : undefined;
  if (logo) return <Image source={logo} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  // Pas de lettre : un site sans logo embarqué garde une marque neutre (jamais un faux logo).
  return <FallbackMark seed={host} size={size} kind="site" />;
}

export function DappTile({ host, label, onPress, width = 88, badge }: { host: string; label: string; onPress: () => void; width?: number | `${number}%`; /** Pastille de compatibilité (« EVM », « TON », « via WalletConnect »). */ badge?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={badge ? `${label}, ${badge}` : label} style={{ width, alignItems: 'center', gap: space[1] }}>
      <View style={{ width: 58, height: 58, borderRadius: radii.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <DappLogo host={host} size={40} />
      </View>
      <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center', maxWidth: '100%', minHeight: badge ? 0 : 32, paddingHorizontal: 2 }}>{label}</Text>
      {badge ? (
        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.full, borderWidth: 1, borderColor: colors.border, maxWidth: '100%' }}>
          <Text variant="micro" tone="secondary" numberOfLines={1}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Nom lisible d'un site : « app.uniswap.org » → « Uniswap » (sans extension, capitalisé). */
export function siteName(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length === 0) return host;
  const two = parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  const root = parts[parts.length - (two ? 3 : 2)] ?? parts[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}
