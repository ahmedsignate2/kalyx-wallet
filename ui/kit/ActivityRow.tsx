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
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius } from '../tokens';
import type { HumanTx } from '../../src';

export function ActivityRow({
  h,
  time,
  network,
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
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const color = h.tone === 'up' ? colors.up : h.tone === 'danger' ? colors.danger : h.spam ? colors.textTertiary : colors.text;
  const left =
    h.counterparty && !h.failed && !h.spam ? (
      <View>
        <AddressGlyph address={h.counterparty} size={40} />
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: radius.round, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={h.icon} size={11} color={h.tone === 'up' ? colors.up : colors.textSecondary} />
        </View>
      </View>
    ) : (
      <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={h.icon} size={18} color={h.tone === 'danger' ? colors.danger : h.spam ? colors.textTertiary : colors.text} />
      </View>
    );
  return (
    <ListRow
      onPress={onPress}
      left={left}
      title={h.title}
      subtitle={network ? (h.subtitle ? `${h.subtitle} · ${network}` : network) : h.subtitle}
      right={
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          {h.amount ? <Text variant="body" tabular style={{ color }}>{h.amount}</Text> : null}
          <Text variant="micro" tone="tertiary">{h.fiat ? `${h.fiat} · ` : ''}{time}</Text>
        </View>
      }
    />
  );
}
