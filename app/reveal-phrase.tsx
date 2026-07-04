import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { isWalletError } from '../src';

export default function RevealPhrase() {
  const { colors, typography } = useTheme();
  const revealPhrase = useWallet((s) => s.revealPhrase);
  const [pin, setPin] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('reveal').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('reveal').catch(() => {});
    };
  }, []);

  const onReveal = async () => {
    setError(null);
    setBusy(true);
    try {
      const m = await revealPhrase({ pin });
      setWords(m.split(' '));
      setPin('');
    } catch (e) {
      setError(isWalletError(e) && e.code === 'WRONG_PIN' ? 'PIN incorrect.' : 'Échec.');
    } finally {
      setBusy(false);
    }
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
      <Muted>Confirme ton PIN pour révéler ta phrase de récupération.</Muted>
      <Card>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          placeholder="PIN"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 22, letterSpacing: 6, paddingVertical: spacing(1) }}
        />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? '…' : 'Afficher'} loading={busy} onPress={onReveal} />
    </Screen>
  );
}
