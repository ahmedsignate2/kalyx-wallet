/**
 * Tuile de dApp uniforme (rond 58, logo 32) + label d'une ligne.
 *
 * LOGO SANS REQUÊTE TIERCE : l'ancien favicon passait par Google s2, qui
 * apprenait ainsi chaque hôte visité. Dorénavant : monogramme coloré intégré
 * pour les dApps du catalogue, monogramme neutre pour les autres.
 */
import { View } from 'react-native';
import { Pressable, Text } from '../kit';
import { useTheme } from '../theme';
import { space, radii } from '../tokens';
import { catalogEntry } from '../../src/domain/web/dappCatalog';

/** Lettre affichée pour un hôte hors catalogue : 1re lettre du nom de domaine (« app.foo.xyz » → F). */
export function monogramOf(host: string): string {
  const name = siteName(host || '?');
  const c = name.replace(/^[^a-z0-9]+/i, '').charAt(0);
  return (c || '?').toUpperCase();
}

export function DappLogo({ host, size = 32 }: { host: string; size?: number }) {
  const { colors } = useTheme();
  const entry = catalogEntry(host);
  const label = entry ? entry.icon.monogram : monogramOf(host);
  const fontSize = Math.max(8, Math.round(size * (label.length > 1 ? 0.36 : 0.46)));
  return (
    <View style={{ width: size, height: size, borderRadius: radii.full, backgroundColor: entry ? entry.icon.color : colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="caption" style={{ fontSize, lineHeight: Math.round(fontSize * 1.2), color: entry ? '#FFFFFF' : colors.text, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function DappTile({ host, label, onPress, width = 88, badge }: { host: string; label: string; onPress: () => void; width?: number | `${number}%`; /** Pastille de compatibilité (« EVM », « TON », « via WalletConnect »). */ badge?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={badge ? `${label}, ${badge}` : label} style={{ width, alignItems: 'center', gap: space[1] }}>
      <View style={{ width: 58, height: 58, borderRadius: radii.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <DappLogo host={host} />
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
