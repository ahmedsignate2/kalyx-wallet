/**
 * Bandeau hors-ligne.
 *
 * Il ne sonde plus le réseau pour son compte : l'information vit dans
 * `lib/networkStore.ts`, parce que l'Aura (docs/08 §3.2, ambiance Veille) et les
 * états vides (§11) en dépendent aussi. Deux sondages concurrents, c'était deux
 * vérités possibles au même instant.
 *
 * Ton (§16.2) : perdre le réseau ne met pas les fonds en danger, donc le
 * bandeau ne crie pas. Plus de rouge « danger » ni de « Connexion réseau
 * requise » : une surface neutre, et une phrase qui dit l'essentiel — l'argent
 * est toujours là. C'est aussi la fin d'un texte codé en dur en français sur
 * une app qui parle 15 langues.
 */
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './kit';
import { useTheme } from './theme';
import { space } from './tokens';
import { Icon } from './icon';
import { useNetwork } from '../lib/networkStore';
import { useT } from '../lib/settingsStore';

export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const online = useNetwork((s) => s.online);

  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.surface2,
        paddingHorizontal: space[4],
        // Le bandeau est la toute première chose de l'écran : il doit dégager
        // la barre de statut lui-même (l'ancien `paddingTop: spacing(5)` codé en
        // dur ne tenait pas sur les écrans à encoche).
        paddingTop: insets.top + space[2],
        paddingBottom: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
      }}
    >
      <Icon name="warning" size={14} color={colors.textSecondary} />
      <Text variant="caption" tone="secondary" numberOfLines={2} style={{ flexShrink: 1 }}>
        {t('offlineBanner')}
      </Text>
    </View>
  );
}
