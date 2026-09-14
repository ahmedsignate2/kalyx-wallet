import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from '../ui/PinPad';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useDriveFlow } from '../lib/googleDrive';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { lockRemainingMs } from '../src';
import { isBiometricAvailable } from '../lib/biometrics';

export default function Unlock() {
  const { colors, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const unlockWithPin = useWallet((s) => s.unlockWithPin);
  const unlockWithBiometrics = useWallet((s) => s.unlockWithBiometrics);
  const healBiometric = useWallet((s) => s.healBiometric);
  const failedAttempts = useWallet((s) => s.failedAttempts);
  const lastFailedAt = useWallet((s) => s.lastFailedAt);
  const biometricEnabled = useSettings((s) => s.biometricEnabled);
  const profileName = useSettings((s) => s.profileName);
  const pinLength = useSettings((s) => s.pinLength);
  const setPinLength = useSettings((s) => s.setPinLength);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [errSignal, setErrSignal] = useState(0);
  const screenOp = useRef(new Animated.Value(1)).current;

  const lockedMs = lockRemainingMs(failedAttempts, lastFailedAt, Date.now());
  const locked = lockedMs > 0;
  const known = pinLength >= 6 ? pinLength : undefined; // option 3 si connue
  const complete = known ? pin.length === known : pin.length >= 6;

  // Déverrouillage fluide : léger fondu de sortie avant de basculer sur l'accueil.
  const goHome = useCallback(() => {
    Animated.timing(screenOp, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      // Retour de Google pendant que l'app était verrouillée : on rouvre l'écran de sauvegarde.
      const back = useDriveFlow.getState().returnTo;
      if (back) {
        useDriveFlow.getState().setReturnTo(null);
        router.replace('/home');
        router.push(back);
        return;
      }
      router.replace('/home');
    });
  }, [screenOp]);

  // UNE seule demande d'empreinte : la lecture du coffre biométrique
  // (SecureStore requireAuthentication) EST déjà le prompt de l'OS. On
  // n'appelle donc PAS authenticate() en plus (c'était la double empreinte).
  const tryBiometrics = useCallback(
    async (manual = false) => {
      try {
        await unlockWithBiometrics();
        goHome();
      } catch (e) {
        // Refus/annulation → silencieux (l'utilisateur saisit son PIN).
        // Au TAP manuel, on affiche la vraie cause (ex. « à réactiver dans Réglages »).
        const msg = e instanceof Error ? e.message : '';
        if (manual && !/refus|annul|cancel/i.test(msg)) {
          setError(/configur/i.test(msg) ? t('bioReactivate') : msg || t('bioUnavailable'));
        }
      }
    },
    [unlockWithBiometrics, goHome],
  );

  useEffect(() => {
    (async () => {
      const ok = biometricEnabled && (await isBiometricAvailable());
      setBioAvailable(ok);
      if (ok) tryBiometrics();
    })();
  }, [biometricEnabled, tryBiometrics]);

  const submit = useCallback(
    async (code: string) => {
      if (code.length < 6) return;
      setBusy(true);
      setError(null);
      try {
        await unlockWithPin(code);
        setPinLength(code.length); // mémorise la longueur (option 3 au prochain coup)
        // Migration douce : si la biométrie est activée mais son secret manque (ancien
        // schéma gated illisible sur ce build), on le ré-enregistre au format fiable.
        if (biometricEnabled) void healBiometric(code).catch(() => {});
        goHome();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('incorrectCode'));
        setPin('');
        setErrSignal((n) => n + 1); // secousse + vibration
        setBusy(false);
      }
    },
    [unlockWithPin, setPinLength, goHome, biometricEnabled, healBiometric],
  );

  const onChange = (v: string) => {
    if (busy || locked) return;
    setError(null);
    setPin(v);
  };

  const title = profileName ? `${t('welcomeBack')}, ${profileName}` : t('unlockKalyx');
  const subtitle = locked
    ? t('tooManyAttempts').replace('{n}', String(Math.ceil(lockedMs / 1000)))
    : error ?? t('enterCodeToContinue');

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.bgDeep, opacity: screenOp }}>
      {/* Plein écran : pas de barre d'en-tête vide. */}
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + spacing(3), paddingBottom: insets.bottom + spacing(2), paddingHorizontal: spacing(3), alignItems: 'center' }}>
        {/* En-tête compact : titre, sous-titre, biométrie */}
        <View style={{ alignItems: 'center', gap: spacing(1.25) }}>
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: fonts.bold, textAlign: 'center' }}>{title}</Text>
          <Text style={{ color: error && !locked ? colors.danger : colors.textMuted, fontSize: 14, textAlign: 'center' }}>{subtitle}</Text>
          {bioAvailable ? (
            <Pressable
              onPress={() => tryBiometrics(true)}
              disabled={busy || locked}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(0.5), paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="security" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>{t('biometrics')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Espace flexible : pousse le clavier vers le bas sans l'étirer */}
        <View style={{ flex: 1, minHeight: spacing(2) }} />

        {/* Ronds + clavier + validation, groupés en bas */}
        <View style={{ alignItems: 'center', gap: spacing(2) }}>
          <PinPad
            value={pin}
            onChange={onChange}
            disabled={busy || locked}
            errorSignal={errSignal}
            expectedLength={known}
            onComplete={submit}
          />
          {/* Bouton visible uniquement quand le PIN est complet (auto-validation
              en mode longueur connue ; ici c'est le filet de sécurité). */}
          <View style={{ height: 24, justifyContent: 'center' }}>
            {complete ? (
              <Pressable onPress={() => submit(pin)} disabled={busy || locked} hitSlop={8}>
                <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>
                  {busy ? t('verifying') : t('unlockBtn')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
