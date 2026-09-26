/**
 * ActivityRow — une transaction humanisée (§4.6) : glyphe de la contrepartie
 * (ou icône d'action), phrase, avec qui, montant signé + valeur en devise,
 * heure. Le statut n'est affiché QUE s'il y a un problème (échec).
 */
import React from 'react';
import { View } from 'react-native';
import { ListRow } from './ListRow';
import { Text } from './Text';
import { AddressGlyph } from './AddressGlyph';
import { TokenIcon } from './TokenIcon';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius } from '../tokens';
import type { HumanTx } from '../../src';

export function ActivityRow({
  h,
  time,
  network,
  networkIcon,
  pendingLabel,
  onPress,
}: {
  h: HumanTx;
  time: string;
  /**
   * Réseau de la transaction, sur une liste qui en MÊLE plusieurs.
   *
   * Sans lui, deux lignes identiques — « Envoyé 0,00001 » sur Base et sur
   * Bitcoin — sont indiscernables. L'accueil agrège tous les réseaux ; l'écran
   * Historique n'en montre qu'un et n'a donc rien à répéter.
   */
  network?: string;
  /**
   * Logo du réseau. Le NOM seul ne suffit pas.
   *
   * Sur une liste qui mêle les réseaux, du texte au milieu d'un sous-titre se
   * lit mal et ne se repère pas au survol de l'œil. Une pastille se reconnaît
   * avant d'être lue — c'est ce qui permet de distinguer une ligne Base d'une
   * ligne Bitcoin sans lire un mot.
   */
  networkIcon?: string | null;
  /**
   * Libellé de l'état « en attente », fourni traduit par l'écran.
   *
   * Le texte ne peut pas être écrit ici : ce composant n'a pas de langue, et une
   * phrase en dur en ressortirait une seule quel que soit le réglage.
   */
  pendingLabel?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const color = h.tone === 'up' ? colors.up : h.tone === 'danger' ? colors.danger : h.spam ? colors.textTertiary : colors.text;
  /*
   * Deux pastilles à des COINS OPPOSÉS de l'avatar : l'action en bas à droite,
   * le réseau en haut à gauche. Les superposer au même coin rendrait l'une des
   * deux illisible, et c'est la seule place libre sur 40 px.
   */
  const networkBadge =
    network || networkIcon ? (
      <View
        style={{
          position: 'absolute',
          left: -3,
          top: -3,
          width: 18,
          height: 18,
          borderRadius: radius.round,
          backgroundColor: colors.surface1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TokenIcon symbol={network ?? '?'} logo={networkIcon ?? undefined} seed={network} size={14} />
      </View>
    ) : null;

  const left =
    h.counterparty && !h.failed && !h.spam ? (
      <View>
        <AddressGlyph address={h.counterparty} size={40} />
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: radius.round, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={h.icon} size={11} color={h.tone === 'up' ? colors.up : colors.textSecondary} />
        </View>
        {networkBadge}
      </View>
    ) : (
      <View>
        <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={h.icon} size={18} color={h.tone === 'danger' ? colors.danger : h.spam ? colors.textTertiary : colors.text} />
        </View>
        {networkBadge}
      </View>
    );
  return (
    <ListRow
      onPress={onPress}
      left={left}
      title={h.title}
      subtitle={[h.subtitle, network, h.pending && pendingLabel ? pendingLabel : null].filter(Boolean).join(' · ') || undefined}
      right={
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          {h.amount ? (
            <Text variant="body" tabular style={{ color, opacity: h.pending ? 0.6 : 1 }}>
              {h.amount}
            </Text>
          ) : null}
          <Text variant="micro" tone="tertiary">{h.fiat ? `${h.fiat} · ` : ''}{time}</Text>
        </View>
      }
    />
  );
}
