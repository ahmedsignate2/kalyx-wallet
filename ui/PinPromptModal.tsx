import { useT } from "../lib/settingsStore";
/**
 * Pop-up de saisie du PIN (bottom-sheet) : lion, titre, PinPad. Utilisé quand
 * une action sensible demande le code (ex. activer la biométrie) — remplace un
 * champ inline peu visible. Gère sa propre saisie ; le parent vérifie le PIN et
 * signale une erreur via `errorSignal` (secousse + reset).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KalyxLogo } from './KalyxLogo';
import { PinPad } from './PinPad';
import { fonts, radii, spacing, useTheme } from './theme';
import { Pressable as KPressable } from './kit';

export function PinPromptModal({
  visible,
  title,
  subtitle,
  expectedLength,
  busy,
  errorSignal,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Longueur connue du PIN → ronds exacts + auto-validation. */
  expectedLength?: number;
  busy?: boolean;
  /** Incrémenter pour signaler un PIN refusé (secousse + reset). */
  errorSignal?: number;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');

  // Reset à l'ouverture et à chaque erreur signalée.
  useEffect(() => {
    setPin('');
  }, [visible, errorSignal]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        {/* Padding bas = inset système : la rangée « 0 » reste au-dessus de la barre de navigation. */}
        <ScrollView
          style={{ maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}
          contentContainerStyle={{
            paddingTop: spacing(3),
            paddingBottom: insets.bottom + spacing(3),
            alignItems: 'center',
            gap: spacing(2.5),
          }}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <KalyxLogo size={56} />
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing(3) }}>
            <Text style={[typography.title, { textAlign: 'center' }]}>{title}</Text>
            {subtitle ? <Text style={[typography.muted, { textAlign: 'center' }]}>{subtitle}</Text> : null}
          </View>

          <PinPad
            value={pin}
            onChange={setPin}
            disabled={busy}
            expectedLength={expectedLength}
            errorSignal={errorSignal}
            onComplete={onSubmit}
          />

          {/*
            INDICATEUR DE CHARGEMENT — corrigé ici, donc pour tous les écrans qui
            passent par cette pop-up : autorisations, révélation de phrase, clé
            privée, sécurité, réglages, suivi, WalletConnect, imports.

            `busy` ne servait qu'à désactiver le pavé, et le texte « vérification »
            n'existait QUE dans la branche « longueur inconnue ». Or le cas
            courant est l'auto-validation (`expectedLength` fourni) : l'utilisateur
            tapait le dernier chiffre, le pavé devenait inerte, et plus rien ne
            bougeait pendant les secondes que prend la dérivation scrypt. On ne
            sait alors pas si le code a été refusé, si l'app réfléchit, ou si elle
            a planté.

            La hauteur est RÉSERVÉE en permanence : sans ça, l'apparition de la
            ligne ferait sauter tout le contenu de la feuille (§6.2).
          */}
          <View style={{ height: 26, justifyContent: 'center' }}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: 15, fontFamily: fonts.medium }}>{t('pinVerifying')}</Text>
              </View>
            ) : expectedLength ? null : (
              // Longueur inconnue : validation manuelle à partir de 6 chiffres.
              <KPressable onPress={() => pin.length >= 6 && onSubmit(pin)} disabled={pin.length < 6} hitSlop={8} haptic="light" accessibilityLabel={t('pinValidate')}>
                <Text style={{ color: colors.primary, fontSize: 16, fontFamily: fonts.semibold, opacity: pin.length < 6 ? 0.35 : 1 }}>
                  {t('pinValidate')}
                </Text>
              </KPressable>
            )}
          </View>

          <KPressable onPress={onCancel} disabled={busy} hitSlop={8} accessibilityLabel={t('cancel')}>
            <Text style={{ color: colors.textSecondary, fontSize: 15, opacity: busy ? 0.4 : 1 }}>{t('cancel')}</Text>
          </KPressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
