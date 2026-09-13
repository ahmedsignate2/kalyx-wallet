import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Switch, Pressable, TouchableOpacity, Animated, Platform, StatusBar } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from '../ui/PinPad';
import { KalyxRing } from '../ui/KalyxRing';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { checkPin, PIN_MIN } from '../src';
import { isBiometricAvailable } from '../lib/biometrics';
import { haptic } from '../lib/haptics';

/**
 * Création du PIN en 2 étapes sur le PinPad premium.
 *
 * LAYOUT FIXE (aucun défilement, jamais) :
 *  - haut    : header 48 px (retour) + titre/sous-titre à marges réduites ;
 *  - milieu  : anneau de progression dans un conteneur `flex: 1` centré — il
 *              absorbe TOUT l'espace restant, quel que soit l'écran ;
 *  - bas     : pavé 4 rangées (0 et ⌫ inclus) + ligne d'action, ancrés au-dessus
 *              de la barre de navigation via `insets.bottom`.
 * Étape 1 « create » : saisie libre (≥ PIN_MIN) + option biométrie, bouton
 * Continuer. Étape 2 « confirm » : longueur connue → auto-validation ; en cas
 * de non-correspondance, secousse et retour à l'étape 1.
 */
export default function SetPin() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const shake = useRef(new Animated.Value(0)).current;
  const confirmDraft = useWallet((s) => s.confirmDraft);
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [useBio, setUseBio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errSignal, setErrSignal] = useState(0);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const fail = (msg: string) => {
    setError(msg);
    setErrSignal((x) => x + 1);
    haptic.error();
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const onContinue = () => {
    setError(null);
    const c = checkPin(pin);
    if (!c.ok) {
      fail(
        c.reason === 'LENGTH'
          ? t('pinMinDigits').replace('{n}', String(PIN_MIN))
          : c.reason === 'NON_DIGIT'
            ? t('digitsOnly')
            : t('pinTooSimple'),
      );
      return;
    }
    setFirstPin(pin);
    setPin('');
    setStep('confirm');
  };

  const onConfirm = async (val: string) => {
    if (val !== firstPin) {
      fail(t('pinMismatch'));
      setPin('');
      setFirstPin('');
      setStep('create');
      return;
    }
    setBusy(true);
    try {
      await confirmDraft(firstPin, { enableBiometric: useBio });
      useSettings.getState().setPinLength(firstPin.length); // ronds exacts au déverrouillage
      router.replace('/home');
    } catch {
      fail(t('cannotSecure'));
      setBusy(false);
    }
  };

  const restart = () => {
    setStep('create');
    setPin('');
    setFirstPin('');
    setError(null);
  };

  const onChange = (v: string) => {
    setError(null);
    setPin(v);
  };
  // Bouton dès que la longueur suffit ; la faiblesse (123456…) est signalée
  // par onContinue (message + secousse), pas en masquant le bouton.
  const canContinue = pin.length >= PIN_MIN;

  const topPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const expected = step === 'confirm' ? firstPin.length : undefined;
  const progress = pin.length === 0 ? 0.001 : pin.length / (expected ?? 12);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: topPadding, justifyContent: 'space-between' }}>
      {/* Pas de barre d'en-tête native (elle affichait une flèche ← en doublon). */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── HAUT : header unique (retour à gauche, langue à droite) + titre ── */}
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 48 }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassStrong }}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevron" size={20} color={colors.text} />
            </View>
          </TouchableOpacity>
          {/* Seul réglage pertinent avant la création du wallet : la langue. */}
          <TouchableOpacity onPress={() => router.push('/language')} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassStrong }}>
            <Icon name="language" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.3, marginBottom: 8 }}>
            {step === 'create' ? t('choosePinTitle') : t('confirmPinTitle')}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: 12 }}>
            {step === 'create' ? t('choosePinSub') : t('confirmPinSub')}
          </Text>
        </View>

        {/* Ligne biométrie : conteneur dédié + marge basse nette → jamais sur l'anneau. */}
        {step === 'create' && bioAvailable ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 24, marginBottom: 24 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontFamily: fonts.medium }}>{t('biometricUnlock')}</Text>
            <Switch value={useBio} onValueChange={setUseBio} />
          </View>
        ) : null}
      </View>

      {/* ── MILIEU : anneau centré, prend tout l'espace restant ── */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <KalyxRing size={104} progress={progress} error={!!errSignal} />
        </Animated.View>
        <View style={{ height: 22, justifyContent: 'center', marginTop: 8 }}>
          {error ? <Text style={{ color: colors.danger, textAlign: 'center', fontFamily: fonts.medium, fontSize: 13 }}>{error}</Text> : null}
        </View>
      </View>

      {/* ── BAS : pavé ancré au-dessus de la barre de navigation ── */}
      <View style={{ alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(3), paddingBottom: insets.bottom + 12 }}>
        {step === 'create' ? (
          <PinPad hideRing value={pin} onChange={onChange} errorSignal={errSignal} />
        ) : (
          <PinPad hideRing value={pin} onChange={onChange} expectedLength={firstPin.length} onComplete={onConfirm} errorSignal={errSignal} disabled={busy} />
        )}
        <View style={{ height: 28, justifyContent: 'center' }}>
          {step === 'create' && canContinue ? (
            <Pressable onPress={onContinue} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>{t('continueWord')}</Text>
            </Pressable>
          ) : step === 'confirm' ? (
            <Pressable onPress={restart} hitSlop={8} disabled={busy}>
              <Text style={{ color: colors.textMuted, fontSize: 15, fontFamily: fonts.medium }}>‹ {t('startOver')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
