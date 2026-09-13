import { router } from 'expo-router';
import { ScreenHeader } from '../ui/kit';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';

export default function RevealPhrase() {
  const { colors, typography } = useTheme();
  const t = useT();
  const revealPhrase = useWallet((s) => s.revealPhrase);
  const setImportedDraft = useWallet((s) => s.setImportedDraft);
  const backupVerified = useSettings((s) => s.backupVerified);
  const [confirming, setConfirming] = useState(false);
  const [words, setWords] = useState<string[] | null>(null);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('reveal').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('reveal').catch(() => {});
    };
  }, []);

  // Révèle via biométrie ou PIN (ConfirmUnlock) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    const m = await revealPhrase(unlock);
    setWords(m.split(' '));
  };

  if (words) {
    return (
      <Screen>
      <ScreenHeader />
        <Title>{t('yourRecoveryPhrase')}</Title>
        <Muted>{t('dontShareScreenshotBlocked')}</Muted>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {words.map((w, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.bgElevated,
                  borderRadius: radii.sm,
                  paddingVertical: spacing(1),
                  paddingHorizontal: spacing(1.5),
                  minWidth: '30%',
                  gap: 6,
                }}
              >
                <Text style={[typography.muted, { width: 20 }]}>{i + 1}</Text>
                <Text style={typography.body}>{w}</Text>
              </View>
            ))}
          </View>
        </Card>
        </ScrollView>
        {/* Vérification différée (sauvegarde sautée à l'onboarding) : 3 mots à retrouver. */}
        {!backupVerified ? (
          <Button
            label={t('verifyBackup')}
            onPress={() => {
              setImportedDraft(words.join(' '));
              router.push({ pathname: '/verify', params: { then: 'security' } });
            }}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('revealPhraseTitle')}</Title>
      <Muted>{t('confirmIdentityPhrase')}</Muted>
      <View style={{ flex: 1 }} />
      <Button label={t('revealAction')} onPress={() => setConfirming(true)} />

      <ConfirmUnlock
        visible={confirming}
        title={t('revealSecretPhrase')}
        subtitle={t('nobodyElseSee')}
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
