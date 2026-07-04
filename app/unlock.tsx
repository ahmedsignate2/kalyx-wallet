import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NovaLogo } from '../ui/NovaLogo';
import { PinPad } from '../ui/PinPad';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { lockRemainingMs } from '../src';
import { isBiometricAvailable } from '../lib/biometrics';

export default function Unlock() {
  const { colors, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const unlockWithPin = useWallet((s) => s.unlockWithPin);
  const unlockWithBiometrics = useWallet((s) => s.unlockWithBiometrics);
  const failedAttempts = useWallet((s) => s.failedAttempts);
  const lastFailedAt = useWallet((s) => s.lastFailedAt);
  const biometricEnabled = useSettings((s) => s.biometricEnabled);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [errSignal, setErrSignal] = useState(0);

  const lockedMs = lockRemainingMs(failedAttempts, lastFailedAt, Date.now());
  const locked = lockedMs > 0;

  // UNE seule demande d'empreinte : la lecture du coffre biométrique
  // (SecureStore requireAuthentication) EST déjà le prompt de l'OS. On
  // n'appelle donc PAS authenticate() en plus (c'était la double empreinte).
  const tryBiometrics = useCallback(async () => {
    try {
      await unlockWithBiometrics();
      router.replace('/home');
    } catch {
      /* annulé ou échec → l'utilisateur saisit son PIN */
    }
  }, [unlockWithBiometrics]);

  useEffect(() => {
    (async () => {
      const ok = biometricEnabled && (await isBiometricAvailable());
      setBioAvailable(ok);
      if (ok) tryBiometrics();
    })();
  }, [biometricEnabled, tryBiometrics]);

  const submit = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      try {
        await unlockWithPin(code);
        router.replace('/home');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'PIN incorrect');
        setPin('');
        setErrSignal((n) => n + 1); // déclenche la secousse
      } finally {
        setBusy(false);
      }
    },
    [unlockWithPin],
  );

  const onChange = (v: string) => {
    if (busy || locked) return;
    setError(null);
    setPin(v);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + spacing(4), paddingBottom: insets.bottom + spacing(3), alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo + titre */}
        <View style={{ alignItems: 'center', gap: spacing(2) }}>
          <NovaLogo size={92} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: 24, fontFamily: fonts.bold }}>Bon retour</Text>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              {locked ? `Réessaie dans ${Math.ceil(lockedMs / 1000)} s` : error ?? 'Entre ton code pour déverrouiller'}
            </Text>
          </View>
          {error && !locked ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
        </View>

        {/* Pavé PIN */}
        <PinPad
          value={pin}
          onChange={onChange}
          disabled={busy || locked}
          errorSignal={errSignal}
          bottomLeft={
            bioAvailable ? (
              <Pressable onPress={tryBiometrics} disabled={busy || locked} hitSlop={8} style={{ alignItems: 'center', justifyContent: 'center', width: 76, height: 76 }}>
                <Icon name="security" size={28} color={colors.accent} />
              </Pressable>
            ) : null
          }
        />

        {/* Valider (actif à ≥ 6 chiffres) */}
        <Pressable
          onPress={() => submit(pin)}
          disabled={pin.length < 6 || busy || locked}
          style={{ opacity: pin.length < 6 || busy || locked ? 0.35 : 1 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>
            {busy ? 'Vérification…' : 'Déverrouiller'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
