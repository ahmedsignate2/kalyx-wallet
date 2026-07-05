import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';

export default function RevealPhrase() {
  const { colors, typography } = useTheme();
  const revealPhrase = useWallet((s) => s.revealPhrase);
  const [confirming, setConfirming] = useState(false);
  const [words, setWords] = useState<string[] | null>(null);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('reveal').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('reveal').catch(() => {});
    };
  }, []);

  // Révèle via biométrie ou PIN (ConfirmUnlock) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    const m = await revealPhrase(unlock);
    setWords(m.split(' '));
  };

  if (words) {
    return (
      <Screen>
        <Title>Ta phrase de récupération</Title>
        <Muted>Ne la partage avec personne. Capture d’écran bloquée.</Muted>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
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
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Afficher la phrase</Title>
      <Muted>Confirme ton identité pour révéler ta phrase de récupération.</Muted>
      <View style={{ flex: 1 }} />
      <Button label="Afficher" onPress={() => setConfirming(true)} />

      <ConfirmUnlock
        visible={confirming}
        title="Révéler la phrase secrète"
        subtitle="Personne d'autre ne doit la voir."
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
