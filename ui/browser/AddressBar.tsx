import { useT } from "../../lib/settingsStore";
/**
 * Barre d'adresse Kalyx (§ navigateur) — pilule de 48, fond Orbite, EN BAS.
 *  - Domaine principal en Lueur, sous-domaine en Brume : app.**uniswap.org**.
 *    C'est beau ET c'est de la sécurité : l'œil lit le vrai site.
 *  - À droite : le glyphe du compte connecté avec le logo de la chaîne.
 *  - Au scroll vers le bas elle se COMPACTE (domaine seul, 13 pt, sans fond),
 *    et revient avec le ressort Standard.
 *  - Jamais teintée par le site. Seul état spécial : Danger (rouge + alerte).
 *  - Onglet privé : fond Encre, fine bordure Brume.
 *  - BOUCLIER à gauche (appui → fiche « Sécurité du site ») : vérifié (catalogue,
 *    vert), inconnu (analysé, rien de signalé, hors catalogue), non analysé (gris :
 *    GoPlus injoignable ou analyse désactivée — jamais présenté comme vérifié),
 *    signalé (alerte, barre en Danger).
 */
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { LogoImage, Text, AddressGlyph, Pressable as KPressable } from '../kit';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius, space, radii } from '../tokens';
import { chainIconUrl } from '../../src';
import { splitHostRoot, type SiteShield } from '../../src/domain/web/dappCatalog';
import type { IconName } from '../icon';

/** Sépare « app.uniswap.org » → { sub: 'app.', root: 'uniswap.org' }. */
export const splitHost = splitHostRoot;

/** Icône, couleur et libellé (clé i18n) du bouclier. */
export function shieldLook(shield: SiteShield): { icon: IconName; labelKey: string } {
  switch (shield) {
    case 'verified': return { icon: 'security', labelKey: 'siteShieldVerified' };
    case 'flagged': return { icon: 'alert', labelKey: 'siteShieldFlagged' };
    case 'unscanned': return { icon: 'security', labelKey: 'siteShieldUnscanned' };
    default: return { icon: 'lock', labelKey: 'siteShieldUnknown' };
  }
}

export function AddressBar({
  host, secure, danger, incognito, address, chainId, compact, loading, onPress, onLongPress, onAccount, placeholder, shield, onShield,
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
  /** État de sécurité du site ouvert (bouclier). */
  shield?: SiteShield;
  /** Appui sur le bouclier : fiche « Sécurité du site ». */
  onShield?: () => void;
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
  const sh: SiteShield = danger ? 'flagged' : shield ?? 'unscanned';
  const look = shieldLook(sh);
  const shieldColor = sh === 'flagged' ? (danger ? fg : colors.danger) : sh === 'verified' ? colors.up : sh === 'unscanned' ? colors.textTertiary : dim;
  const shieldLabel = t(look.labelKey as never);

  return (
    <Animated.View style={[{ flex: 1, justifyContent: 'center' }, wrap]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, full]}>
        <KPressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} accessibilityRole="button" accessibilityLabel={host || placeholder} style={{ height: 48, borderRadius: radius.round, backgroundColor: bg, borderWidth: 1, borderColor: incognito ? colors.textSecondary : danger ? colors.danger : colors.border, flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: 6, gap: space[2] }}>
          {host ? (
            <KPressable onPress={onShield} disabled={!onShield} hitSlop={10} accessibilityRole="button" accessibilityLabel={shieldLabel} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={secure || sh === 'flagged' ? look.icon : 'dapps'} size={16} color={shieldColor} />
            </KPressable>
          ) : <Icon name="search" size={15} color={dim} />}
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
            <KPressable onPress={onAccount} hitSlop={8} accessibilityLabel={t("addressBarConnect")} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <AddressGlyph address={address} size={26} background={!danger} />
              {chainIconUrl(chainId) ? (
                <View style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: radii.full, backgroundColor: colors.surface1, borderWidth: 1.5, borderColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <LogoImage uri={chainIconUrl(chainId)!} size={10} style={{ opacity: 0.9 }} />
                </View>
              ) : null}
            </KPressable>
          ) : null}
        </KPressable>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, mini]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {host ? <Icon name={incognito && sh !== 'flagged' ? 'incognito' : look.icon} size={11} color={sh === 'flagged' ? colors.danger : sh === 'verified' ? colors.up : colors.textSecondary} /> : null}
          <Text variant="caption" numberOfLines={1} style={{ color: danger ? colors.danger : colors.text }}>
            <Text variant="caption" tone="secondary">{sub}</Text>{root || placeholder}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
