/**
 * ActivityRow — une transaction, lisible d'un coup d'œil.
 *
 *   [token]  Reçu                      +50 USDC
 *   [badge]  de vitalik.eth · Base     50,00 € · 14:02
 *
 * Deux colonnes, et chaque information à un seul endroit. L'ancienne ligne
 * mettait le montant DANS le titre (« Reçu 50 USDC ») puis le répétait à
 * droite : la liste se lisait deux fois plus lentement, et un long montant
 * tronquait le titre. Ici le titre n'est qu'un verbe, le montant a sa colonne.
 *
 * À gauche, le LOGO du token quand on le connaît — c'est ce que l'œil cherche
 * dans un historique —, la pastille d'action en bas à droite, le réseau en haut
 * à gauche. Une ligne suspecte (spam) est estompée et dit pourquoi.
 *
 * COULEUR DU GESTE : la pastille d'action prend la teinte de son geste (les
 * mêmes `tints` que les tuiles de l'accueil) — un envoi se reconnaît à sa
 * couleur avant d'être lu. Une transaction en attente porte une pastille
 * « En attente » ; une confirmée n'a RIEN de plus : c'est l'état normal, le
 * répéter sur chaque ligne ne ferait que du bruit.
 */
import { View } from 'react-native';
import { ListRow } from './ListRow';
import { Text } from './Text';
import { TokenIcon } from './TokenIcon';
import { nativeCoinLogo, useFallbackLogo } from './useFallbackLogo';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius } from '../tokens';
import type { HumanTx } from '../../src';
import type { ActionTint } from '../tokens';

/** Teinte du geste d'une ligne d'activité. */
const TINT_OF: Partial<Record<HumanTx['icon'], ActionTint>> = { send: 'send', receive: 'receive', alert: 'receive', exchange: 'swap', security: 'buy', dapps: 'swap', nft: 'earn' };

export function ActivityRow({
  h,
  time,
  network,
  networkIcon,
  tokenLogo,
  tokenSeed,
  chainId,
  pendingLabel,
  spamText,
  onPress,
}: {
  h: HumanTx;
  time: string;
  /** Nom du réseau, sur une liste qui en mêle plusieurs. */
  network?: string;
  /** Logo du réseau (pastille) : se reconnaît avant d'être lu. */
  networkIcon?: string | null;
  /** Logo du token principal, s'il est connu (portefeuille). */
  tokenLogo?: string | null;
  /** Contrat du token : couleur stable du monogramme quand le logo manque. */
  tokenSeed?: string;
  /** Réseau de la ligne : logo de repli (liste du réseau, ou pièce native). */
  chainId?: string;
  /** « En attente », traduit par l'écran (ce composant n'a pas de langue). */
  pendingLabel?: string;
  /** Raison du masquage, traduite, pour une ligne spam affichée. */
  spamText?: string;
  onPress?: () => void;
}) {
  const { colors, tints } = useTheme();
  const muted = h.spam;
  const tint = !h.failed && h.tone !== 'danger' ? TINT_OF[h.icon] : undefined;
  const tone = tint ? tints[tint] : null;
  const amountColor = h.tone === 'danger' ? colors.danger : h.tone === 'up' && !muted ? colors.up : muted ? colors.textTertiary : colors.text;
  const badgeColor = h.tone === 'danger' ? colors.danger : h.tone === 'up' ? colors.up : colors.textSecondary;
  // Logo connu, sinon celui de la liste du réseau (jeton) ou du réseau d'origine (pièce native) : la lettre en dernier.
  const listed = useFallbackLogo(chainId, tokenSeed, tokenLogo);
  const logo = listed ?? (!tokenSeed ? nativeCoinLogo(chainId) : undefined);
  const useToken = !!h.symbol && (h.icon === 'send' || h.icon === 'receive' || h.icon === 'exchange' || h.icon === 'alert');

  const left = (
    <View style={{ opacity: muted ? 0.5 : 1 }}>
      {useToken ? (
        <TokenIcon symbol={h.symbol!} logo={logo} seed={tokenSeed} size={40} />
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: tone ? tone.bg : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={h.icon} size={18} color={h.tone === 'danger' ? colors.danger : tone ? tone.ink : colors.text} />
        </View>
      )}
      {useToken ? (
        <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: radius.round, borderWidth: 2, borderColor: colors.surface1, backgroundColor: colors.surface1, overflow: 'hidden' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tone ? tone.bg : colors.surface1 }}>
            <Icon name={h.failed ? 'errorCircle' : h.icon === 'alert' ? 'receive' : h.icon} size={10} color={tone ? tone.ink : badgeColor} />
          </View>
        </View>
      ) : null}
      {network || networkIcon ? (
        <View style={{ position: 'absolute', left: -3, top: -3, width: 18, height: 18, borderRadius: radius.round, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' }}>
          <TokenIcon symbol={network ?? '?'} logo={networkIcon ?? undefined} seed={network} size={14} />
        </View>
      ) : null}
    </View>
  );

  const subtitle = [muted && spamText ? spamText : h.subtitle, network].filter(Boolean).join(' · ') || undefined;
  const pending = h.pending && !!pendingLabel;
  return (
    <ListRow
      onPress={onPress}
      left={left}
      title={h.label}
      subtitle={subtitle}
      right={
        <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: 170 }}>
          {h.amount ? (
            <Text variant="body" tabular numberOfLines={1} style={{ color: amountColor, opacity: h.pending ? 0.6 : 1 }}>
              {h.amount}
            </Text>
          ) : null}
          {h.amountAlt ? (
            <Text variant="micro" tabular numberOfLines={1} tone="secondary">{h.amountAlt}</Text>
          ) : null}
          {pending ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, paddingHorizontal: 7, height: 20, borderRadius: radius.round, backgroundColor: tints.earn.bg }}>
              <View style={{ width: 5, height: 5, borderRadius: radius.round, backgroundColor: tints.earn.ink }} />
              <Text variant="micro" numberOfLines={1} style={{ color: tints.earn.ink }}>{pendingLabel}</Text>
            </View>
          ) : (
            <Text variant="micro" tone="tertiary" numberOfLines={1}>{h.fiat ? `${h.fiat} · ` : ''}{time}</Text>
          )}
        </View>
      }
    />
  );
}
