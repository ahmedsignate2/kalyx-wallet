import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { lockRemainingMs } from '../src';
import { isBiometricAvailable, authenticate } from '../lib/biometrics';

export default function Unlock() {
  const { colors } = useTheme();
  const unlockWithPin = useWallet((s) => s.unlockWithPin);
  const unlockWithBiometrics = useWallet((s) => s.unlockWithBiometrics);
  const failedAttempts = useWallet((s) => s.failedAttempts);
  const lastFailedAt = useWallet((s) => s.lastFailedAt);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lockedMs = lockRemainingMs(failedAttempts, lastFailedAt, Date.now());

  useEffect(() => {
    // Tente la biométrie d'emblée si disponible.
    (async () => {
      if (await isBiometricAvailable()) {
        try {
          if (await authenticate()) {
            await unlockWithBiometrics();
            router.replace('/home');
          }
        } catch {
          /* fallback PIN */
        }
      }
    })();
  }, [unlockWithBiometrics]);

  const onUnlock = async () => {
    setError(null);
    setBusy(true);
    try {
      await unlockWithPin(pin);
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN incorrect');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing(2) }}>
        <Title>Déverrouiller</Title>
        <Muted>Entre ton code PIN pour accéder à ton wallet.</Muted>
        <Card>
          <TextInput
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={12}
            editable={lockedMs === 0}
            placeholder="••••••"
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 28, letterSpacing: 10, textAlign: 'center' }}
          />
        </Card>
        {lockedMs > 0 ? (
          <Text style={{ color: colors.warning }}>
            Trop de tentatives. Réessaie dans {Math.ceil(lockedMs / 1000)} s.
          </Text>
        ) : null}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </View>
      <Button
        label={busy ? 'Vérification…' : 'Déverrouiller'}
        loading={busy}
        disabled={lockedMs > 0}
        onPress={onUnlock}
      />
    </Screen>
  );
}
