import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Title, Muted } from '../ui/components';
import { PinPad } from '../ui/PinPad';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
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
  const t = useT();
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
    if (pin.length < PIN_MIN) return fail(t('atLeastNDigits').replace('{n}', String(PIN_MIN)));
    setOldPin(pin);
    setPin('');
    setStep('new');
  };

  const onNewNext = () => {
    if (!checkPin(pin).ok) return fail(t('newPinWeak'));
    if (pin === oldPin) return fail(t('newPinDiffer'));
    setNewPin(pin);
    setPin('');
    setStep('confirm');
  };

  const onConfirm = async (val: string) => {
    if (val !== newPin) {
      fail(t('newPinsMismatch'));
      setPin('');
      setNewPin('');
      setStep('new');
      return;
    }
    setBusy(true);
    try {
      await changePin(oldPin, newPin);
      useSettings.getState().setPinLength(newPin.length); // ronds exacts au déverrouillage
      toast.success(t('pinChanged'), t('pinChangedBody'));
      router.back();
    } catch (e) {
      setBusy(false);
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        // Ancien PIN faux : on repart de l'étape 1.
        setOldPin('');
        setNewPin('');
        setPin('');
        setStep('old');
        fail(t('oldPinIncorrect'));
      } else {
        fail(t('changeFailed'));
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

  const title = step === 'old' ? t('oldPinTitle') : step === 'new' ? t('newPinTitle') : t('confirmNewPin');
  const hint =
    step === 'old'
      ? t('enterCurrentCode')
      : step === 'new'
        ? t('chooseNewCode')
        : t('reenterNewCode');
  const canNext = pin.length >= PIN_MIN;

  return (
    <Screen>
      <ScreenHeader />
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
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>{t('continueWord')}</Text>
            </Pressable>
          ) : step === 'new' && canNext ? (
            <Pressable onPress={onNewNext} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>{t('continueWord')}</Text>
            </Pressable>
          ) : step === 'confirm' ? (
            <Pressable onPress={restart} hitSlop={8} disabled={busy}>
              <Text style={{ color: colors.textMuted, fontSize: 15, fontFamily: fonts.medium }}>‹ {t('startOver')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
