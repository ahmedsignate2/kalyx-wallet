import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
  const profileName = useSettings((s) => s.profileName);
  const pinLength = useSettings((s) => s.pinLength);
  const setPinLength = useSettings((s) => s.setPinLength);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [errSignal, setErrSignal] = useState(0);
  const screenOp = useRef(new Animated.Value(1)).current;
  // Le bouton « Déverrouiller » (mode longueur inconnue) apparaît en fondu à ≥ 6.
  const btnOp = useRef(new Animated.Value(0)).current;

  const lockedMs = lockRemainingMs(failedAttempts, lastFailedAt, Date.now());
  const locked = lockedMs > 0;
  const known = pinLength >= 6 ? pinLength : undefined; // option 3 si connue

  // Déverrouillage fluide : léger fondu de sortie avant de basculer sur l'accueil.
  const goHome = useCallback(() => {
    Animated.timing(screenOp, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      router.replace('/home');
    });
  }, [screenOp]);

  // UNE seule demande d'empreinte : la lecture du coffre biométrique
  // (SecureStore requireAuthentication) EST déjà le prompt de l'OS. On
  // n'appelle donc PAS authenticate() en plus (c'était la double empreinte).
  const tryBiometrics = useCallback(async () => {
    try {
      await unlockWithBiometrics();
      goHome();
    } catch {
      /* annulé ou échec → l'utilisateur saisit son PIN */
    }
  }, [unlockWithBiometrics, goHome]);

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
        goHome();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Code incorrect');
        setPin('');
        setErrSignal((n) => n + 1); // secousse + vibration
        setBusy(false);
      }
    },
    [unlockWithPin, setPinLength, goHome],
  );

  const onChange = (v: string) => {
    if (busy || locked) return;
    setError(null);
    setPin(v);
    // Mode longueur inconnue : fait apparaître le bouton à 6 chiffres.
    if (!known) Animated.timing(btnOp, { toValue: v.length >= 6 ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  };

  const title = profileName ? `Bon retour, ${profileName}` : 'Déverrouiller Nova';
  const subtitle = locked
    ? `Trop de tentatives. Réessaie dans ${Math.ceil(lockedMs / 1000)} s`
    : error ?? 'Entre ton code pour continuer';

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.bgDeep, opacity: screenOp }}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top + spacing(4), paddingBottom: insets.bottom + spacing(3), alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo + titre */}
        <View style={{ alignItems: 'center', gap: spacing(2) }}>
          <NovaLogo size={88} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: 23, fontFamily: fonts.bold }}>{title}</Text>
            <Text style={{ color: error && !locked ? colors.danger : colors.textMuted, fontSize: 15 }}>{subtitle}</Text>
          </View>
        </View>

        {/* Bouton biométrie (visible = l'utilisateur sait qu'il peut l'utiliser) */}
        {bioAvailable ? (
          <Pressable
            onPress={tryBiometrics}
            disabled={busy || locked}
            style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="security" size={26} color={colors.accent} />
            </View>
            <Text style={{ color: colors.accent, fontSize: 12, fontFamily: fonts.semibold }}>Déverrouiller avec la biométrie</Text>
          </Pressable>
        ) : (
          <View />
        )}

        {/* Pavé PIN */}
        <PinPad
          value={pin}
          onChange={onChange}
          disabled={busy || locked}
          errorSignal={errSignal}
          expectedLength={known}
          onComplete={submit}
        />

        {/* Bouton de validation : uniquement en mode longueur inconnue */}
        {known ? (
          <View style={{ height: 22 }} />
        ) : (
          <Animated.View style={{ opacity: btnOp }}>
            <Pressable onPress={() => submit(pin)} disabled={pin.length < 6 || busy || locked} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>
                {busy ? 'Vérification…' : 'Déverrouiller'}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}
