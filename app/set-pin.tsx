import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Title, Muted } from '../ui/components';
import { PinPad } from '../ui/PinPad';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { checkPin, PIN_MIN } from '../src';
import { isBiometricAvailable } from '../lib/biometrics';

/**
 * Création du PIN en 2 étapes sur le PinPad premium (ronds animés, haptique,
 * secousse à l'erreur) — au lieu de deux champs texte bruts.
 * Étape 1 « create » : saisie libre (≥ PIN_MIN) + option biométrie, bouton
 * Continuer. Étape 2 « confirm » : longueur connue → auto-validation ; en cas
 * de non-correspondance, secousse et retour à l'étape 1.
 */
export default function SetPin() {
  const { colors } = useTheme();
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
  };

  const onContinue = () => {
    setError(null);
    const c = checkPin(pin);
    if (!c.ok) {
      fail(
        c.reason === 'LENGTH'
          ? `Le PIN doit faire au moins ${PIN_MIN} chiffres.`
          : c.reason === 'NON_DIGIT'
            ? 'Uniquement des chiffres.'
            : 'PIN trop simple (évite 123456, 000000…).',
      );
      return;
    }
    setFirstPin(pin);
    setPin('');
    setStep('confirm');
  };

  const onConfirm = async (val: string) => {
    if (val !== firstPin) {
      fail('Les deux PIN ne correspondent pas. Recommence.');
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
      fail('Impossible de sécuriser le wallet.');
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

  return (
    <Screen>
      <Title>{step === 'create' ? 'Choisis un code PIN' : 'Confirme ton PIN'}</Title>
      <Muted>
        {step === 'create'
          ? "Il chiffre ta phrase sur cet appareil. Ne l'oublie pas."
          : 'Saisis-le une seconde fois pour confirmer.'}
      </Muted>

      {step === 'create' && bioAvailable ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1) }}>
          <Muted>Déverrouillage biométrique</Muted>
          <Switch value={useBio} onValueChange={setUseBio} />
        </View>
      ) : null}

      <View style={{ flex: 1, minHeight: spacing(2) }} />

      {error ? (
        <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: spacing(1), fontFamily: fonts.medium }}>{error}</Text>
      ) : null}

      <View style={{ alignItems: 'center', gap: spacing(2) }}>
        {step === 'create' ? (
          <PinPad value={pin} onChange={onChange} errorSignal={errSignal} />
        ) : (
          <PinPad value={pin} onChange={onChange} expectedLength={firstPin.length} onComplete={onConfirm} errorSignal={errSignal} disabled={busy} />
        )}
        <View style={{ height: 24, justifyContent: 'center' }}>
          {step === 'create' && canContinue ? (
            <Pressable onPress={onContinue} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Continuer</Text>
            </Pressable>
          ) : step === 'confirm' ? (
            <Pressable onPress={restart} hitSlop={8} disabled={busy}>
              <Text style={{ color: colors.textMuted, fontSize: 15, fontFamily: fonts.medium }}>‹ Recommencer</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
