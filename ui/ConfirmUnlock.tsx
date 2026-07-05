/**
 * Feuille de confirmation d'une action sensible, avec déverrouillage unifié :
 * biométrie AUTO à l'ouverture (si activée) + repli sur le pavé PIN.
 *
 * Contrat : le parent fournit `perform(unlock)` qui exécute l'action (signer,
 * envoyer, révéler…) et LÈVE en cas d'échec. La feuille :
 *  - à l'ouverture, si la biométrie est activée, appelle `perform({biometric:true})`
 *    → le prompt OS s'affiche (lecture de la seed gated). Succès = terminé ;
 *    annulation / non configurée = bascule silencieuse vers le PIN ;
 *  - sinon (ou après bascule), affiche le PinPad ; à la validation, appelle
 *    `perform({pin})`. Un `WRONG_PIN` fait vibrer + réessayer ; toute autre
 *    erreur est affichée.
 *
 * IMPORTANT (piège historique) : on NE fait PAS `authenticate()` puis lecture
 * gated (= double prompt). Le prompt unique EST la lecture gated déclenchée par
 * `perform({biometric:true})`.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { NovaLogo } from './NovaLogo';
import { PinPad } from './PinPad';
import { Icon } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useSettings } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import type { Unlock } from '../lib/walletStore';
import { isWalletError } from '../src';

export function ConfirmUnlock({
  visible,
  title,
  subtitle,
  statusText,
  perform,
  onDone,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Progression réseau pilotée par le parent (ex. « Envoi du swap… »). */
  statusText?: string | null;
  /** Exécute l'action ; DOIT lever en cas d'échec (WRONG_PIN pour un PIN faux). */
  perform: (unlock: Unlock) => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { colors, typography } = useTheme();
  const bioEnabled = useSettings((s) => s.biometricEnabled);
  const pinLength = useSettings((s) => s.pinLength);
  const [phase, setPhase] = useState<'working' | 'pin'>('working');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);

  const run = async (unlock: Unlock) => {
    const viaBio = 'biometric' in unlock;
    setPhase('working');
    setError(null);
    try {
      await perform(unlock);
      onDone();
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        setPin('');
        setErrSignal((x) => x + 1);
        setError('Code incorrect.');
        setPhase('pin');
      } else if (viaBio) {
        // Biométrie annulée ou non configurée → repli silencieux sur le PIN.
        setPin('');
        setPhase('pin');
      } else {
        setPin('');
        setError(friendlyTxError(e));
        setPhase('pin');
      }
    }
  };

  // À l'ouverture : biométrie auto si activée, sinon PIN d'emblée.
  useEffect(() => {
    if (!visible) return;
    setPin('');
    setError(null);
    if (bioEnabled) {
      void run({ biometric: true });
    } else {
      setPhase('pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const working = phase === 'working';
  const canValidateManually = !pinLength && pin.length >= 6;

  return (
    <Modal transparent animationType="slide" onRequestClose={working ? undefined : onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.bgDeep,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingTop: spacing(3),
            paddingBottom: spacing(4),
            alignItems: 'center',
            gap: spacing(2.5),
          }}
        >
          <NovaLogo size={56} />
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing(3) }}>
            <Text style={[typography.title, { textAlign: 'center' }]}>{title}</Text>
            {subtitle ? <Text style={[typography.muted, { textAlign: 'center' }]}>{subtitle}</Text> : null}
          </View>

          {working ? (
            <View style={{ alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(2) }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textMuted, fontFamily: fonts.medium }}>
                {statusText ?? 'Authentification…'}
              </Text>
            </View>
          ) : (
            <>
              <PinPad
                value={pin}
                onChange={(v) => {
                  setError(null);
                  setPin(v);
                }}
                expectedLength={pinLength || undefined}
                errorSignal={errSignal}
                onComplete={(p) => run({ pin: p })}
              />

              {error ? (
                <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>{error}</Text>
              ) : null}

              {canValidateManually ? (
                <Pressable onPress={() => run({ pin })} hitSlop={8}>
                  <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>Valider</Text>
                </Pressable>
              ) : null}

              {bioEnabled ? (
                <Pressable
                  onPress={() => run({ biometric: true })}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}
                >
                  <Icon name="security" size={18} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>Utiliser la biométrie</Text>
                </Pressable>
              ) : null}
            </>
          )}

          <Pressable onPress={onCancel} disabled={working} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 15, opacity: working ? 0.4 : 1 }}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
