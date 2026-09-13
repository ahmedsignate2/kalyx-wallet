import { useT } from "../lib/settingsStore";
/**
 * Pop-up de saisie du PIN (bottom-sheet) : lion, titre, PinPad. Utilisé quand
 * une action sensible demande le code (ex. activer la biométrie) — remplace un
 * champ inline peu visible. Gère sa propre saisie ; le parent vérifie le PIN et
 * signale une erreur via `errorSignal` (secousse + reset).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KalyxLogo } from './KalyxLogo';
import { PinPad } from './PinPad';
import { fonts, radii, spacing, useTheme } from './theme';

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
          style={{ maxHeight: '92%', backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}
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

          {/* En mode longueur inconnue : valider à ≥ 6 ; sinon auto-validation. */}
          {expectedLength ? null : (
            <Pressable onPress={() => pin.length >= 6 && onSubmit(pin)} disabled={pin.length < 6 || busy} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold, opacity: pin.length < 6 || busy ? 0.35 : 1 }}>
                {busy ? t("pinVerifying") : t("pinValidate")}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onCancel} disabled={busy} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>{t("cancel")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
