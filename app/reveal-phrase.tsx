import { IconDisc, NovaHero, Rise } from '../ui/nova';
import { router } from 'expo-router';
import { ScreenHeader, Button, Card, Screen } from '../ui/kit';
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
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

  useNoScreenCapture('reveal');

  // Révèle via biométrie ou PIN (ConfirmUnlock) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    const m = await revealPhrase(unlock);
    setWords(m.split(' '));
  };

  if (words) {
    return (
      <Screen layout="form">
      <ScreenHeader />
        <NovaHero icon="phrase" tone="gold" title={t('yourRecoveryPhrase')} subtitle={t('dontShareScreenshotBlocked')} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Card padding="xl" gap="md" style={{ borderRadius: radii.xl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {words.map((w, i) => (
              <Rise
                key={i}
                delay={80 + i * 40}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.surface2,
                  borderRadius: radii.sm,
                  paddingVertical: spacing(1),
                  paddingHorizontal: spacing(1.5),
                  minWidth: '31%',
                  gap: 6,
                }}
              >
                <Text style={[typography.muted, { width: 20 }]}>{i + 1}</Text>
                <Text style={typography.body}>{w}</Text>
              </Rise>
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
    <Screen layout="form">
      <ScreenHeader />
      <NovaHero icon="phrase" tone="gold" title={t('revealPhraseTitle')} subtitle={t('confirmIdentityPhrase')} />
      <Card rise delay={160} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
        <IconDisc name="eyeOff" />
        <Text style={[typography.muted, { flex: 1 }]}>{t('nobodyElseSee')}</Text>
      </Card>
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
