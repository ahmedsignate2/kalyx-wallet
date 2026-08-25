import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { createBackupChallenge, verifyBackupChallenge } from '../src';

/**
 * Confirme que l'utilisateur a bien noté sa phrase : il doit re-sélectionner
 * quelques mots aux bonnes positions (logique fournie par le moteur testé).
 */
export default function Verify() {
  const { colors, typography } = useTheme();
  const t = useT();
  const draft = useWallet((s) => s.draftMnemonic);
  const challenge = useMemo(
    () => (draft ? createBackupChallenge(draft, { count: 3, optionsPerWord: 4 }) : []),
    [draft],
  );
  const [answers, setAnswers] = useState<Record<number, string>>({});

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('verifyTitle') }} />
      {(() => {
  if (!draft) {
    return (
      <PremiumScreen>
        
        <GlassCard>
          <Text style={typography.bodyStrong}>{t('sessionExpired')}</Text>
          <Text onPress={() => router.replace('/welcome')} style={{ color: colors.accent, fontFamily: fonts.semibold, marginTop: spacing(1) }}>
            {t('startOver')}
          </Text>
        </GlassCard>
      </PremiumScreen>
    );
  }

  const allAnswered = challenge.every((c) => answers[c.position]);

  const onValidate = () => {
    const list = challenge.map((c) => ({ position: c.position, word: answers[c.position] }));
    if (verifyBackupChallenge(draft, list)) {
      router.push('/set-pin');
    } else {
      toast.error(t('almost'), t('wordMismatch'));
      setAnswers({});
    }
  };

  return (
    <PremiumScreen>
      

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>{t('verifyBackup')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>{t('selectRightWord')}</Text>
      </View>

      <View style={{ gap: spacing(1.5) }}>
        {challenge.map((c) => {
          const answered = !!answers[c.position];
          return (
            <GlassCard key={c.position}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing(1) }}>
                <Text style={typography.muted}>{t('wordNo')} {c.position}</Text>
                {answered ? <Icon name="check" size={15} color={colors.up} /> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
                {c.options.map((opt) => {
                  const selected = answers[c.position] === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setAnswers((a) => ({ ...a, [c.position]: opt }))}
                      style={{
                        paddingVertical: spacing(1),
                        paddingHorizontal: spacing(2),
                        borderRadius: radii.pill,
                        backgroundColor: selected ? colors.accent : colors.bgElevated,
                        borderWidth: 1,
                        borderColor: selected ? colors.accent : colors.glassBorder,
                      }}
                    >
                      <Text style={{ color: selected ? '#fff' : colors.text, fontFamily: selected ? fonts.semibold : fonts.regular }}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </GlassCard>
          );
        })}
      </View>

      <Button label={t('validate')} disabled={!allAnswered} onPress={onValidate} />
      <View style={{ height: spacing(1) }} />
    </PremiumScreen>
  );
      })()}
    </>
  );
}
