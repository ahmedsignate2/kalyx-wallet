import React, { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { checkPin, isWalletError } from '../src';

export default function ChangePin() {
  const changePin = useWallet((s) => s.changePin);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (label: string, value: string, set: (v: string) => void) => (
    <Card>
      <Text style={typography.muted}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={12}
        style={{ color: colors.text, fontSize: 22, letterSpacing: 6, paddingVertical: spacing(1) }}
      />
    </Card>
  );

  const onSubmit = async () => {
    setError(null);
    if (!checkPin(newPin).ok) {
      setError('Nouveau PIN trop faible (min 6 chiffres, évite 123456).');
      return;
    }
    if (newPin !== confirm) {
      setError('Les nouveaux PIN ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await changePin(oldPin, newPin);
      Alert.alert('PIN modifié', 'Ton nouveau code est actif.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(isWalletError(e) && e.code === 'WRONG_PIN' ? 'Ancien PIN incorrect.' : 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Changer le PIN</Title>
      <Muted>Ton coffre sera re-chiffré avec le nouveau code.</Muted>
      {field('Ancien PIN', oldPin, setOldPin)}
      {field('Nouveau PIN', newPin, setNewPin)}
      {field('Confirmer le nouveau PIN', confirm, setConfirm)}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Modification…' : 'Valider'} loading={busy} onPress={onSubmit} />
    </Screen>
  );
}
