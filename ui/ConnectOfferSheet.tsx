/**
 * « Connecter Kalyx ? » : la feuille qui suit un lien de connexion repéré
 * (QR affiché par un site du navigateur, ou lien copié). Kalyx d'un côté,
 * le site (ou le protocole) de l'autre, ce qui se passe ensuite en deux
 * lignes, et les boutons de l'app. Ignorer reste le geste par défaut :
 * glisser, toucher le fond ou le bouton retour ignorent.
 */
import { View } from 'react-native';
import { Sheet, Text, Button, LogoImage } from './kit';
import { Icon } from './icon';
import { KalyxLogo } from './KalyxLogo';
import { DappLogo } from './browser/DappTile';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import { useT } from '../lib/settingsStore';
import { fill } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import { useConnectOffer, answerConnectOffer } from '../lib/connectOffer';
import { chainIconUrl } from '../src';

const DISC = 64;

function Disc({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {children}
    </View>
  );
}

/** Trois points entre les deux disques : le lien qui va se faire. */
function Link() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {[0.35, 0.6, 0.35].map((o, i) => (
        <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent, opacity: o }} />
      ))}
    </View>
  );
}

function Point({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Icon name="check" size={12} color={colors.accent} />
      </View>
      <Text variant="bodySecondary" tone="secondary" style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

export function ConnectOfferSheet() {
  const t = useT();
  const { colors } = useTheme();
  const offer = useConnectOffer((s) => s.offer);
  if (!offer) return null;
  const kind = offer.kind === 'tonconnect' ? 'TON Connect' : 'WalletConnect';
  const tonLogo = chainIconUrl('ton');
  return (
    <Sheet visible onClose={() => answerConnectOffer(false)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3], marginTop: space[2] }}>
        <Disc><KalyxLogo size={40} /></Disc>
        <Link />
        <Disc>
          {offer.site ? (
            <DappLogo host={offer.site} size={44} />
          ) : offer.kind === 'tonconnect' && tonLogo ? (
            <LogoImage uri={tonLogo} size={40} />
          ) : (
            <Icon name="walletconnect" size={30} color={colors.accent} />
          )}
        </Disc>
      </View>

      <View style={{ gap: space[2], alignItems: 'center' }}>
        <Text variant="title2" style={{ textAlign: 'center' }}>
          {offer.site ? fill(t('offerTitleSite'), { site: offer.site }) : t('offerTitleClip')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space[3], paddingVertical: 4, borderRadius: radius.input, backgroundColor: colors.surface2 }}>
          <Icon name={offer.site ? 'lock' : 'copy'} size={12} tone="muted" />
          <Text variant="caption" tone="secondary">{fill(t(offer.site ? 'offerSubSite' : 'offerSubClip'), { kind })}</Text>
        </View>
      </View>

      <View style={{ gap: space[3] }}>
        <Point text={t('offerPoint1')} />
        <Point text={t('offerPoint2')} />
      </View>

      <View style={{ gap: space[2] }}>
        <Button label={t('connect')} onPress={() => { haptic.selection(); answerConnectOffer(true); }} />
        <Button label={t('clipIgnore')} variant="secondary" onPress={() => answerConnectOffer(false)} />
      </View>
    </Sheet>
  );
}
