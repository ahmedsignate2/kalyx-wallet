import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';

export default function CreateWallet() {
  const { colors, typography } = useTheme();
  const createWallet = useWallet((s) => s.createWallet);
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string[] | null>(null);

  useEffect(() => {
    if (phrase) {
      ScreenCapture.preventScreenCaptureAsync('create').catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync('create').catch(() => {});
      };
    }
  }, [phrase]);

  const onCreate = async () => {
    setError(null);
    if (pin.length < 6) {
      setError('Entre ton PIN d’app pour chiffrer le nouveau portefeuille.');
      return;
    }
    setBusy(true);
    try {
      const mnemonic = await createWallet(pin, label);
      setPhrase(mnemonic.split(' '));
    } catch (e) {
      setError(friendlyTxError(e));
    } finally {
      setBusy(false);
    }
  };

  if (phrase) {
    return (
      <Screen>
        <Title>Sauvegarde ta phrase</Title>
        <Muted>Écris ces {phrase.length} mots dans l’ordre. C’est la seule façon de restaurer ce portefeuille. Capture d’écran bloquée.</Muted>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {phrase.map((w, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: radii.sm, paddingVertical: spacing(1), paddingHorizontal: spacing(1.5), minWidth: '30%', gap: 6 }}>
                <Text style={[typography.muted, { width: 20 }]}>{i + 1}</Text>
                <Text style={typography.body}>{w}</Text>
              </View>
            ))}
          </View>
        </Card>
        <View style={{ flex: 1 }} />
        <Button label="J’ai noté, terminer" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Créer un portefeuille</Title>
      <Muted>Une nouvelle phrase de récupération sera générée, chiffrée avec ton PIN.</Muted>
      <Card>
        <Text style={typography.muted}>Nom (optionnel)</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder="Ex. Trading, Épargne…" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
      </Card>
      <Card>
        <Text style={typography.muted}>PIN de l’app</Text>
        <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Création…' : 'Créer'} loading={busy} onPress={onCreate} />
    </Screen>
  );
}
