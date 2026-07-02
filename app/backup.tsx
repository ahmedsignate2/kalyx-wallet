import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

/**
 * Affiche la phrase de récupération.
 * NOTE SÉCURITÉ : sur cet écran, activer la protection anti-capture d'écran
 * (FLAG_SECURE Android / masquage iOS) — à brancher avec expo-screen-capture.
 */
export default function Backup() {
  const draft = useWallet((s) => s.draftMnemonic);
  const confirmDraft = useWallet((s) => s.confirmDraft);
  const [saving, setSaving] = useState(false);

  if (!draft) {
    return (
      <Screen>
        <Muted>Aucune phrase à afficher. Reviens à l'accueil.</Muted>
        <Button label="Retour" variant="ghost" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }

  const words = draft.split(' ');

  const onConfirm = async () => {
    setSaving(true);
    try {
      await confirmDraft();
      router.replace('/home');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: spacing(2) }}>
        <Title>Ta phrase de récupération</Title>
        <Muted>
          Écris ces 12 mots dans l'ordre, sur papier. Ne les prends pas en photo, ne
          les copie pas dans le cloud. C'est la seule façon de restaurer ton wallet.
        </Muted>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {words.map((w, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.bgElevated,
                  borderRadius: radii.sm,
                  paddingVertical: spacing(1),
                  paddingHorizontal: spacing(1.5),
                  minWidth: '30%',
                  gap: 6,
                }}
              >
                <Text style={[typography.muted, { width: 20 }]}>{i + 1}</Text>
                <Text style={typography.body}>{w}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
      <Button
        label={saving ? 'Enregistrement…' : "J'ai noté ma phrase"}
        loading={saving}
        onPress={onConfirm}
      />
    </Screen>
  );
}
