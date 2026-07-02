import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { validateMnemonic } from '../src';

export default function Import() {
  const importMnemonic = useWallet((s) => s.importMnemonic);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onImport = async () => {
    setError(null);
    if (!validateMnemonic(text)) {
      setError('Phrase invalide : vérifie les mots et l\'ordre.');
      return;
    }
    setBusy(true);
    try {
      await importMnemonic(text);
      router.replace('/home');
    } catch {
      setError('Import impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Importer un wallet</Title>
      <Muted>Colle ta phrase de récupération BIP-39 (12 ou 24 mots).</Muted>
      <Card>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="mot1 mot2 mot3 …"
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            minHeight: 120,
            color: colors.text,
            fontSize: 16,
            textAlignVertical: 'top',
          }}
        />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label="Importer" loading={busy} onPress={onImport} />
    </Screen>
  );
}
