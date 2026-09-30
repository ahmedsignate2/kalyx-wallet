import { FlowDots } from '../ui/nova';
import { IconButton, Pressable as KPressable } from '../ui/kit';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad, PIN_GAP, PIN_KEY } from '../ui/PinPad';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { friendlyTxError } from '../lib/txError';
import { checkPin, isWalletError, PIN_MIN } from '../src';

/**
 * Changement de PIN en 3 étapes : ancien code → nouveau → confirmation.
 *
 * MÊME MISE EN PAGE QUE LE DÉVERROUILLAGE, qui s'affiche bien partout : titre
 * compact en haut, pavé ancré en bas, rien ne défile. L'en-tête héros (grand
 * disque, orbite) prenait ~190 px et poussait le pavé hors de l'écran.
 *
 * L'ANCIEN CODE EST VÉRIFIÉ TOUT DE SUITE. Il ne l'était qu'à la fin : un code
 * faux obligeait à saisir deux fois le nouveau avant de l'apprendre. Sa longueur
 * est connue (celle du déverrouillage) : l'anneau se remplit sur elle et l'étape
 * se valide seule, comme à l'ouverture de l'app.
 */
type Step = 'old' | 'new' | 'confirm';

/** Hauteur de la ligne « Continuer / Recommencer / Vérification » sous le pavé. */
const ACTION_ROW = 24;
const GAP = spacing(2);

/** Touches et anneau à la taille de la hauteur DISPONIBLE : ils rapetissent plutôt que de sortir de l'écran. */
function padSizes(avail: number): { key: number; ring: number } {
  const fit = (ring: number) => Math.floor((avail - ring - GAP * 2 - PIN_GAP * 3 - ACTION_ROW) / 4);
  let ring = 104;
  let key = fit(ring);
  if (key < 62) {
    ring = 72;
    key = fit(ring);
  }
  return { ring, key: Math.max(46, Math.min(PIN_KEY, key)) };
}

export default function ChangePin() {
  // Codes saisis ici : aucune capture d'écran.
  useNoScreenCapture('change-pin');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const changePin = useWallet((s) => s.changePin);
  const verifyPin = useWallet((s) => s.verifyPin);
  const pinLength = useSettings((s) => s.pinLength);
  // Longueur du code actuel, si connue (enregistrée au dernier déverrouillage réussi).
  const knownOld = pinLength >= PIN_MIN ? pinLength : undefined;

  const [step, setStep] = useState<Step>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState(''); // saisie de l'étape courante
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);
  // Hauteur réelle laissée au pavé, mesurée : dépend de l'appareil et des barres système.
  const [padArea, setPadArea] = useState(0);
  const sizes = padSizes(padArea || 460);

  const fail = (msg: string) => {
    setError(msg);
    setErrSignal((x) => x + 1);
  };
  const onChange = (v: string) => {
    setError(null);
    setPin(v);
  };

  /** Ancien code : vérifié AVANT d'avancer (compteur de tentatives et blocage compris). */
  const onOldNext = async (val = pin) => {
    if (val.length < PIN_MIN) return fail(t('atLeastNDigits').replace('{n}', String(PIN_MIN)));
    setBusy(true);
    try {
      await verifyPin(val);
      setOldPin(val);
      setPin('');
      setStep('new');
    } catch (e) {
      setPin('');
      fail(isWalletError(e) && e.code === 'WRONG_PIN' ? t('oldPinIncorrect') : friendlyTxError(e, t));
    } finally {
      setBusy(false);
    }
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
        // Ancien code refusé entre-temps : on repart de l'étape 1.
        setOldPin('');
        setNewPin('');
        setPin('');
        setStep('old');
        fail(t('oldPinIncorrect'));
      } else {
        fail(friendlyTxError(e, t) || t('changeFailed'));
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
  const hint = step === 'old' ? t('enterCurrentCode') : step === 'new' ? t('chooseNewCode') : t('reenterNewCode');
  // « Continuer » : nouveau code (longueur libre), ou ancien code de longueur inconnue.
  const canNext = !busy && pin.length >= PIN_MIN && (step === 'new' || (step === 'old' && !knownOld));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + spacing(2), paddingHorizontal: spacing(3) }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* En-tête : retour et étapes. */}
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label={t('back')} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/menu'))} />
        <FlowDots step={step === 'old' ? 1 : step === 'new' ? 2 : 3} />
      </View>

      {/* Titre compact, comme au déverrouillage. */}
      <View style={{ alignItems: 'center', gap: spacing(1), marginTop: spacing(1) }}>
        <Text style={{ color: colors.text, fontSize: 22, fontFamily: fonts.bold, textAlign: 'center' }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>{hint}</Text>
        {/* Hauteur réservée : le message d'erreur ne décale pas le pavé en apparaissant. */}
        <Text numberOfLines={2} style={{ minHeight: 20, color: colors.danger, fontSize: 14, textAlign: 'center', fontFamily: fonts.medium }}>{error ?? ''}</Text>
      </View>

      {/* Pavé ancré en bas, dans l'espace restant mesuré. */}
      <View
        style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', gap: GAP }}
        onLayout={(e) => setPadArea(Math.round(e.nativeEvent.layout.height))}
      >
        {step === 'old' ? (
          <PinPad
            key="old"
            value={pin}
            onChange={onChange}
            expectedLength={knownOld}
            onComplete={(v) => void onOldNext(v)}
            ringLength={PIN_MIN}
            errorSignal={errSignal}
            disabled={busy}
            keySize={sizes.key}
            ringSize={sizes.ring}
          />
        ) : step === 'new' ? (
          <PinPad key="new" value={pin} onChange={onChange} ringLength={PIN_MIN} errorSignal={errSignal} disabled={busy} keySize={sizes.key} ringSize={sizes.ring} />
        ) : (
          <PinPad key="confirm" value={pin} onChange={onChange} expectedLength={newPin.length} onComplete={onConfirm} errorSignal={errSignal} disabled={busy} keySize={sizes.key} ringSize={sizes.ring} />
        )}
        {/* Le rechiffrement (scrypt) prend quelques secondes : on le dit. */}
        <View style={{ height: ACTION_ROW, justifyContent: 'center' }}>
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: fonts.medium }}>{t('verifying')}</Text>
            </View>
          ) : canNext ? (
            <KPressable onPress={step === 'old' ? () => void onOldNext() : onNewNext} hitSlop={8} haptic="light" accessibilityLabel={t('continueWord')}>
              <Text style={{ color: colors.primary, fontSize: 16, fontFamily: fonts.semibold }}>{t('continueWord')}</Text>
            </KPressable>
          ) : step === 'confirm' ? (
            <KPressable onPress={restart} hitSlop={8} accessibilityLabel={t('startOver')}>
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: fonts.medium }}>{'‹'} {t('startOver')}</Text>
            </KPressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
