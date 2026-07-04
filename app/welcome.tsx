import React from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

export default function Welcome() {
  const { typography } = useTheme();
  const newDraft = useWallet((s) => s.newDraft);

  const onCreate = () => {
    newDraft(128); // 12 mots
    router.push('/backup');
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing(2) }}>
        <Text style={typography.display}>Nova</Text>
        <Text style={[typography.muted, { fontSize: 16 }]}>
          Le wallet qui te protège et que tu comprends.
        </Text>
        <Card style={{ marginTop: spacing(2) }}>
          <Text style={typography.body}>Tes cryptos, tes clés.</Text>
          <Text style={typography.muted}>
            Non-custodial : personne d'autre que toi n'a accès à tes fonds. Tes clés
            ne quittent jamais ce téléphone.
          </Text>
        </Card>
      </View>
      <View style={{ gap: spacing(1.5) }}>
        <Button label="Créer un wallet" onPress={onCreate} />
        <Button label="J'ai déjà une phrase" variant="ghost" onPress={() => router.push('/import')} />
      </View>
    </Screen>
  );
}
