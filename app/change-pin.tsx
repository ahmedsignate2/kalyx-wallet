import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Title, Muted } from '../ui/components';
import { PinPad } from '../ui/PinPad';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { checkPin, isWalletError, PIN_MIN } from '../src';

/**
 * Changement de PIN en 3 étapes sur le PinPad premium (au lieu de 3 champs
 * texte). « old » (ancien code, vérifié à la fin par changePin) → « new »
 * (nouveau, validé par checkPin) → « confirm » (longueur connue, auto-validation).
 * Un ancien PIN incorrect renvoie proprement à l'étape 1 avec secousse.
 */
type Step = 'old' | 'new' | 'confirm';

export default function ChangePin() {
  const { colors } = useTheme();
  const changePin = useWallet((s) => s.changePin);
  const [step, setStep] = useState<Step>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState(''); // saisie de l'étape courante
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);

  const fail = (msg: string) => {
    setError(msg);
    setErrSignal((x) => x + 1);
  };
  const onChange = (v: string) => {
    setError(null);
    setPin(v);
  };

  const onOldNext = () => {
    if (pin.length < PIN_MIN) return fail(`Au moins ${PIN_MIN} chiffres.`);
    setOldPin(pin);
    setPin('');
    setStep('new');
  };

  const onNewNext = () => {
    if (!checkPin(pin).ok) return fail('Nouveau PIN trop faible (min 6 chiffres, évite 123456).');
    if (pin === oldPin) return fail('Le nouveau PIN doit différer de l’ancien.');
    setNewPin(pin);
    setPin('');
    setStep('confirm');
  };

  const onConfirm = async (val: string) => {
    if (val !== newPin) {
      fail('Les nouveaux PIN ne correspondent pas.');
      setPin('');
      setNewPin('');
      setStep('new');
      return;
    }
    setBusy(true);
    try {
      await changePin(oldPin, newPin);
      useSettings.getState().setPinLength(newPin.length); // ronds exacts au déverrouillage
      toast.success('PIN modifié', 'Ton nouveau code est actif.');
      router.back();
    } catch (e) {
      setBusy(false);
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        // Ancien PIN faux : on repart de l'étape 1.
        setOldPin('');
        setNewPin('');
        setPin('');
        setStep('old');
        fail('Ancien PIN incorrect.');
      } else {
        fail('Échec de la modification.');
      }
    }
  };

  const restart = () => {
    setStep('old');
    setOldPin('');
    setNewPin('');
    setPin('');
    setError(null);
  };

  const title = step === 'old' ? 'Ancien PIN' : step === 'new' ? 'Nouveau PIN' : 'Confirme le nouveau PIN';
  const hint =
    step === 'old'
      ? 'Saisis ton code actuel.'
      : step === 'new'
        ? 'Choisis ton nouveau code.'
        : 'Saisis à nouveau le nouveau code.';
  const canNext = pin.length >= PIN_MIN;

  return (
    <Screen>
      <Title>{title}</Title>
      <Muted>{hint}</Muted>

      <View style={{ flex: 1, minHeight: spacing(2) }} />

      {error ? (
        <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: spacing(1), fontFamily: fonts.medium }}>{error}</Text>
      ) : null}

      <View style={{ alignItems: 'center', gap: spacing(2) }}>
        {step === 'confirm' ? (
          <PinPad value={pin} onChange={onChange} expectedLength={newPin.length} onComplete={onConfirm} errorSignal={errSignal} disabled={busy} />
        ) : (
          <PinPad value={pin} onChange={onChange} errorSignal={errSignal} />
        )}
        <View style={{ height: 24, justifyContent: 'center' }}>
          {step === 'old' && canNext ? (
            <Pressable onPress={onOldNext} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Continuer</Text>
            </Pressable>
          ) : step === 'new' && canNext ? (
            <Pressable onPress={onNewNext} hitSlop={8}>
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
