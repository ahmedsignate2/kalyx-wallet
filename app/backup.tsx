import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform, Pressable, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';

/**
 * Affiche la phrase de récupération.
 * SÉCURITÉ : capture d'écran bloquée pendant l'affichage de la seed
 * (FLAG_SECURE Android ; sur iOS, expo-screen-capture notifie/masque). La seed
 * reste FLOUTÉE jusqu'à ce que l'utilisateur appuie (évite les regards).
 */
export default function Backup() {
  const { colors, typography } = useTheme();
  const t = useT();
  const draft = useWallet((s) => s.draftMnemonic);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('seed').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('seed').catch(() => {});
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('backupTitle') }} />
      {(() => {
  if (!draft) {
    return (
      <PremiumScreen>
        
        <GlassCard>
          <Text style={typography.bodyStrong}>{t('noPhraseToShow')}</Text>
          <Text onPress={() => router.replace('/welcome')} style={{ color: colors.accent, fontFamily: fonts.semibold, marginTop: spacing(1) }}>
            {t('backToHome')}
          </Text>
        </GlassCard>
      </PremiumScreen>
    );
  }

  const words = draft.split(' ');

  return (
    <PremiumScreen>
      

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="phrase" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>{t('yourRecoveryPhrase')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          {words.length} {t('wordsInOrderHint')}
        </Text>
      </View>

      <ErrorBox
        tone="warning"
        message={`${t('backupWarning')}${Platform.OS === 'android' ? t('screenshotBlocked') : ''}`}
      />

      {/* Grille des mots + voile « appuie pour révéler » */}
      <GlassCard>
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {words.map((w, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.bgElevated,
                  borderWidth: 1,
                  borderColor: colors.glassBorder,
                  borderRadius: radii.md,
                  paddingVertical: spacing(1),
                  paddingHorizontal: spacing(1.5),
                  width: '31%',
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.textFaint, fontSize: 12, fontFamily: fonts.semibold, width: 18 }}>{i + 1}</Text>
                <Text style={{ color: colors.text, fontFamily: fonts.medium }} numberOfLines={1}>{w}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {!revealed ? (
          <Pressable onPress={() => setRevealed(true)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card + 'F2', borderRadius: radii.xl, gap: spacing(1) }]}>
            <Icon name="eye" size={28} color={colors.accent} />
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{t('tapToReveal')}</Text>
            <Text style={typography.muted}>{t('makeSureNobody')}</Text>
          </Pressable>
        ) : null}
      </GlassCard>

      <Button label={t('notedPhrase')} onPress={() => router.push('/verify')} />
      <View style={{ height: spacing(1) }} />
    </PremiumScreen>
  );
      })()}
    </>
  );
}
