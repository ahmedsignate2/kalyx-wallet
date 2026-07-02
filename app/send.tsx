import React, { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet, DEFAULT_CHAIN } from '../lib/walletStore';
import { getAdapter, isWalletError, SEPOLIA } from '../src';

export default function Send() {
  const sendNative = useWallet((s) => s.sendNative);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validateOffline = (): boolean => {
    setError(null);
    try {
      // Validation hors-ligne immédiate (adresse EIP-55 + montant).
      getAdapter(DEFAULT_CHAIN).buildTransfer({ to, amount });
      return true;
    } catch (e) {
      setError(isWalletError(e) ? e.message : 'Saisie invalide');
      return false;
    }
  };

  const onReview = () => {
    if (!validateOffline()) return;
    Alert.alert(
      'Confirmer l\'envoi',
      `Réseau : ${SEPOLIA.name}\nMontant : ${amount} ${SEPOLIA.nativeSymbol}\nÀ : ${to}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', style: 'default', onPress: submit },
      ],
    );
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const hash = await sendNative(to, amount);
      Alert.alert('Transaction envoyée', hash, [
        { text: 'OK', onPress: () => router.replace('/home') },
      ]);
    } catch (e) {
      setError(isWalletError(e) ? e.message : 'Échec de l\'envoi (solde/réseau ?)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Envoyer</Title>
      <Muted>Transfert natif sur {SEPOLIA.name} (testnet).</Muted>

      <Card>
        <Text style={typography.muted}>Adresse du destinataire</Text>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder="0x…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }}
        />
      </Card>

      <Card>
        <Text style={typography.muted}>Montant ({SEPOLIA.nativeSymbol})</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={{ color: colors.text, fontSize: 22, paddingVertical: spacing(1) }}
        />
      </Card>

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Envoi…' : 'Vérifier et envoyer'} loading={busy} onPress={onReview} />
    </Screen>
  );
}
