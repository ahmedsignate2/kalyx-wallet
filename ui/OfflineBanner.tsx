/**
 * Bandeau hors-ligne.
 *
 * Il ne sonde plus le réseau pour son compte : l'information vit dans
 * `lib/networkStore.ts`, parce que l'Aura (docs/08 §3.2, ambiance Veille) et
 * les états vides (§11) en dépendent aussi. Deux sondages concurrents, c'était
 * deux vérités possibles au même instant.
 *
 * DETTE CONNUE : le texte est codé en dur en français alors que l'app supporte
 * 15 langues, et il ne dit pas l'essentiel. La voix cible (§16.2) est « Tu es
 * hors ligne. Tes fonds sont là où tu les as laissés. » — ce qui rassure au
 * lieu d'alarmer. Repris à l'étape 5 (états vides et voix), avec les notes de
 * contexte pour les traducteurs qu'exige le §16.3.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, spacing, fonts } from './theme';
import { Icon } from './icon';
import { useNetwork } from '../lib/networkStore';

export function OfflineBanner() {
  const { colors } = useTheme();
  const online = useNetwork((s) => s.online);

  if (online) return null;

  return (
    <View style={{
      backgroundColor: colors.danger,
      padding: spacing(1),
      paddingTop: spacing(5),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing(1)
    }}>
      <Icon name="warning" size={14} color="#fff" />
      <Text style={{ color: '#fff', fontFamily: fonts.medium, fontSize: 12 }}>
        Vous êtes hors-ligne. Connexion réseau requise.
      </Text>
    </View>
  );
}
