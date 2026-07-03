import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import { validateMnemonic } from '../src';

export default function ImportWallet() {
  const importWallet = useWallet((s) => s.importWallet);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onImport = async () => {
    setError(null);
    if (!validateMnemonic(text)) {
      setError('Phrase invalide : vérifie les mots et l’ordre.');
      return;
    }
    if (pin.length < 6) {
      setError('Entre ton PIN d’app pour chiffrer ce portefeuille.');
      return;
    }
    setBusy(true);
    try {
      await importWallet(text, pin, label);
      router.replace('/home');
    } catch (e) {
      setError(friendlyTxError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Importer un portefeuille</Title>
      <Muted>Colle une phrase BIP-39 (12 ou 24 mots). Elle sera chiffrée avec ton PIN.</Muted>
      <Card>
        <TextInput value={text} onChangeText={setText} placeholder="mot1 mot2 mot3 …" placeholderTextColor={colors.textMuted} multiline autoCapitalize="none" autoCorrect={false} style={{ minHeight: 100, color: colors.text, fontSize: 16, textAlignVertical: 'top' }} />
      </Card>
      <Card>
        <Text style={typography.muted}>Nom (optionnel)</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder="Ex. Ledger, Ancien wallet…" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
      </Card>
      <Card>
        <Text style={typography.muted}>PIN de l’app</Text>
        <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Import…' : 'Importer'} loading={busy} onPress={onImport} />
    </Screen>
  );
}
