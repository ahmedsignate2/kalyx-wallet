import { FlowDots, NovaHero } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Screen } from '../ui/kit';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
import { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { PinPad, PIN_GAP, PIN_KEY } from '../ui/PinPad';
import { KalyxRing } from '../ui/KalyxRing';
import { fonts, fontSize, space, spacing, useTheme } from '../ui/theme';
import { Icon } from '../ui/icon';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { friendlyTxError } from '../lib/txError';
import { checkPin, isWalletError, PIN_MAX, PIN_MIN } from '../src';
import { goBack } from '../lib/nav';

/**
 * Changement de PIN en 3 étapes : ancien code → nouveau → confirmation.
 *
 * THÈME NOVA, comme les autres écrans secondaires : en-tête, héros (disque dans
 * son orbite, titre, phrase). Le disque EST l'anneau de saisie — c'est ce qui
 * laisse au pavé la place de tenir sans défilement.
 *
 * MÊME LOGIQUE QUE LA CRÉATION DU CODE (set-pin) :
 *  - saisir un code (l'ancien, puis le nouveau) : saisie libre de 6 à 12
 *    chiffres, l'anneau se remplit au fil des chiffres, « Continuer » valide ;
 *  - confirmer : la longueur est connue, l'anneau se remplit sur elle et l'étape
 *    se valide seule.
 * Aucune étape ne se valide d'elle-même pendant qu'on choisit sa longueur : les
 * appuis suivants ne débordent jamais sur l'étape d'après.
 *
 * L'ancien code est vérifié dès « Continuer » (compteur et blocage compris) : un
 * code faux n'est plus découvert après avoir saisi deux fois le nouveau.
 */
type Step = 'old' | 'new' | 'confirm';

/** Hauteur de la ligne « Continuer / Recommencer / Vérification » sous le pavé. */
const ACTION_ROW = 24;
const GAP = spacing(2);

/** Touches à la taille de la hauteur DISPONIBLE (mesurée) : elles rapetissent plutôt que de sortir de l'écran. */
function keySizeFor(avail: number): number {
  const key = Math.floor((avail - GAP - PIN_GAP * 3 - ACTION_ROW) / 4);
  return Math.max(46, Math.min(PIN_KEY, key));
}

export default function ChangePin() {
  // Codes saisis ici : aucune capture d'écran.
  useNoScreenCapture('change-pin');
  const { colors } = useTheme();
  const t = useT();
  const changePin = useWallet((s) => s.changePin);
  const verifyPin = useWallet((s) => s.verifyPin);
  const [step, setStep] = useState<Step>('old');
  const storedLength = useSettings((s) => s.pinLength);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState(''); // saisie de l'étape courante
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);
  // Hauteur réelle laissée au pavé, mesurée : dépend de l'appareil et des barres système.
  const [padArea, setPadArea] = useState(0);
  const keySize = padArea ? keySizeFor(padArea) : PIN_KEY;

  const fail = (msg: string) => {
    setError(msg);
    setErrSignal((x) => x + 1);
  };
  const onChange = (v: string) => {
    setError(null);
    setPin(v);
  };

  /** Ancien code : vérifié avant d'avancer (au dernier chiffre si sa longueur est connue). */
  const onOldNext = async (val: string = pin) => {
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
      goBack('/menu');
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
        fail(friendlyTxError(e, t));
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
  /*
   * L'ANNEAU SUIT LA LONGUEUR DU CODE :
   *  - ancien code : sa longueur connue (6 à 12, retenue à la création) — plein
   *    au dernier chiffre, qui valide tout seul ; inconnue : calé sur 12 ;
   *  - nouveau code : calé sur 12 — à moitié à 6 chiffres, le minimum, puis
   *    chaque chiffre de plus le remplit davantage ;
   *  - confirmation : la longueur du nouveau code, plein au dernier chiffre.
   */
  const knownOld = storedLength >= PIN_MIN && storedLength <= PIN_MAX ? storedLength : 0;
  const ringOf = step === 'confirm' ? newPin.length : step === 'old' ? knownOld || PIN_MAX : PIN_MAX;
  const progress = pin.length === 0 ? 0.001 : Math.min(1, pin.length / ringOf);
  // Nouveau code trop simple (123456, 000000…) : dit tout de suite, pas après « Continuer ».
  const tooSimple = step === 'new' && pin.length >= PIN_MIN && !checkPin(pin).ok;
  const canNext = !busy && step !== 'confirm' && !(step === 'old' && knownOld) && pin.length >= PIN_MIN && !tooSimple;

  return (
    <Screen scene="top" layout="form">
      <ScreenHeader fallback="/menu" right={<FlowDots step={step === 'old' ? 1 : step === 'new' ? 2 : 3} />} />
      {/* Héros Nova : le disque dans son orbite est l'anneau de saisie. Le titre remonte à chaque étape. */}
      <NovaHero key={step} title={title} subtitle={hint}>
        <KalyxRing size={84} progress={progress} error={!!error || tooSimple} />
      </NovaHero>

      {/* Hauteur réservée : le message d'erreur ne décale pas le pavé en apparaissant. */}
      <Text numberOfLines={2} style={{ minHeight: 20, color: colors.danger, textAlign: 'center', fontFamily: fonts.medium }}>{error ?? (tooSimple ? t('newPinWeak') : '')}</Text>

      {/* Pavé ancré en bas, dans l'espace restant mesuré. */}
      <View
        style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', gap: GAP }}
        onLayout={(e) => setPadArea(Math.round(e.nativeEvent.layout.height))}
      >
        {step === 'confirm' ? (
          <PinPad hideRing value={pin} onChange={onChange} expectedLength={newPin.length} onComplete={onConfirm} errorSignal={errSignal} disabled={busy} keySize={keySize} />
        ) : step === 'old' && knownOld ? (
          <PinPad hideRing value={pin} onChange={onChange} expectedLength={knownOld} onComplete={(v) => void onOldNext(v)} errorSignal={errSignal} disabled={busy} keySize={keySize} />
        ) : (
          <PinPad hideRing value={pin} onChange={onChange} errorSignal={errSignal} disabled={busy} keySize={keySize} />
        )}
        {/* Vérification et rechiffrement (scrypt) prennent quelques secondes : on le dit. */}
        <View style={{ height: ACTION_ROW, justifyContent: 'center' }}>
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.base, fontFamily: fonts.medium }}>{t('verifying')}</Text>
            </View>
          ) : canNext ? (
            <KPressable onPress={step === 'old' ? () => void onOldNext(pin) : onNewNext} hitSlop={8} haptic="light" accessibilityLabel={t('continueWord')}>
              <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontFamily: fonts.semibold }}>{t('continueWord')}</Text>
            </KPressable>
          ) : step === 'confirm' ? (
            <KPressable onPress={restart} hitSlop={8} accessibilityLabel={t('startOver')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
                <Icon name="caretLeft" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.base, fontFamily: fonts.medium }}>{t('startOver')}</Text>
              </View>
            </KPressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
