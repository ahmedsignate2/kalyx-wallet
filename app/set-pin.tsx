import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { checkPin, PIN_MIN } from '../src';
import { isBiometricAvailable } from '../lib/biometrics';

export default function SetPin() {
  const { colors, typography } = useTheme();
  const confirmDraft = useWallet((s) => s.confirmDraft);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [useBio, setUseBio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const onSubmit = async () => {
    setError(null);
    const c = checkPin(pin);
    if (!c.ok) {
      setError(
        c.reason === 'LENGTH'
          ? `Le PIN doit faire au moins ${PIN_MIN} chiffres.`
          : c.reason === 'NON_DIGIT'
            ? 'Uniquement des chiffres.'
            : 'PIN trop simple (évite 123456, 000000…).',
      );
      return;
    }
    if (pin !== confirm) {
      setError('Les deux PIN ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await confirmDraft(pin, { enableBiometric: useBio });
      useSettings.getState().setPinLength(pin.length); // ronds exacts au déverrouillage
      router.replace('/home');
    } catch {
      setError('Impossible de sécuriser le wallet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Choisis un code PIN</Title>
      <Muted>Il chiffre ta phrase sur cet appareil. Ne l'oublie pas.</Muted>

      <Card>
        <Text style={typography.muted}>Nouveau PIN</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          style={{ color: colors.text, fontSize: 24, letterSpacing: 8, paddingVertical: spacing(1) }}
        />
      </Card>
      <Card>
        <Text style={typography.muted}>Confirme le PIN</Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          style={{ color: colors.text, fontSize: 24, letterSpacing: 8, paddingVertical: spacing(1) }}
        />
      </Card>

      {bioAvailable ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Muted>Déverrouillage biométrique</Muted>
          <Switch value={useBio} onValueChange={setUseBio} />
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Sécurisation…' : 'Sécuriser mon wallet'} loading={busy} onPress={onSubmit} />
    </Screen>
  );
}
