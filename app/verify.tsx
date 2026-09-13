/** Vérification (§4.9) — retrouver 3 mots au hasard, pas les 12. Succès → `backupVerified`. */
import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, IconButton, Surface, Chip, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { createBackupChallenge, verifyBackupChallenge } from '../src';

export default function Verify() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useWallet((s) => s.draftMnemonic);
  const { then } = useLocalSearchParams<{ then?: string }>();
  const challenge = useMemo(() => (draft ? createBackupChallenge(draft, { count: 3, optionsPerWord: 4 }) : []), [draft]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const allAnswered = challenge.every((c) => answers[c.position]);

  const onValidate = () => {
    if (!draft) return;
    const list = challenge.map((c) => ({ position: c.position, word: answers[c.position] }));
    if (verifyBackupChallenge(draft, list)) {
      haptic.success();
      useSettings.getState().setBackupVerified(true);
      if (then === 'security') {
        // Vérification différée depuis « Révéler la phrase » : on jette le brouillon.
        useWallet.setState({ draftMnemonic: null });
        toast.success(t('verifyBackup'), t('notedPhrase'));
        router.replace('/security');
      } else {
        router.push('/set-pin');
      }
    } else {
      haptic.error();
      toast.error(t('wordMismatch'));
      setAnswers({});
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => router.back()} />
        <Text variant="title2" style={{ flex: 1 }}>{t('verifyBackup')}</Text>
      </View>
      {!draft ? (
        <View style={{ padding: SCREEN_MARGIN }}><Surface><EmptyState icon="phrase" title={t('sessionExpired')} actionLabel={t('startOver')} onAction={() => router.replace('/welcome')} /></Surface></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[4], flexGrow: 1 }}>
          <Text variant="bodySecondary" tone="secondary">{t('selectRightWord')}</Text>
          {challenge.map((c) => (
            <Surface key={c.position} style={{ gap: space[3] }}>
              <Text variant="caption" tone="secondary">{t('wordNo')} {c.position}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {c.options.map((opt) => <Chip key={opt} label={opt} selected={answers[c.position] === opt} onPress={() => setAnswers((a) => ({ ...a, [c.position]: opt }))} />)}
              </View>
            </Surface>
          ))}
          <View style={{ flex: 1 }} />
          <Button label={t("pinValidate")} onPress={onValidate} disabled={!allAnswered} />
        </ScrollView>
      )}
    </View>
  );
}
