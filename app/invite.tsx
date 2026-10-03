/**
 * Inviter des amis : partage simple de Kalyx (message + lien), via le partage
 * natif. PAS de programme de parrainage ni de récompense — juste faire découvrir
 * l'app. On n'affiche donc aucun « code de parrainage » (ce serait un mécanisme
 * factice sans backend d'attribution).
 */
import { IconDisc, NovaCard, NovaHero } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React from 'react';
import { View, Text, Share } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon, type IconName } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';
import { DOWNLOAD_URL } from '../lib/appLinks';

// Lien évolutif (jamais un store précis en dur) : kalyxwallet.com/download
// détecte l'appareil et redirige vers le bon store, cf. web/lib/stores.ts.
const INVITE_LINK = DOWNLOAD_URL;

export default function Invite() {
  const { colors, typography } = useTheme();
  const t = useT();
  const REASONS: { icon: IconName; text: string }[] = [
    { icon: 'security', text: t('inviteReason1') },
    { icon: 'exchange', text: t('inviteReason2') },
    { icon: 'dapps', text: t('inviteReason3') },
    { icon: 'nft', text: t('inviteReason4') },
  ];

  const onShare = async () => {
    try {
      await Share.share({ message: t('shareMessage').replace('{link}', INVITE_LINK) });
    } catch {
      // annulé par l'utilisateur — rien à faire
    }
  };
  const copyLink = async () => {
    await Clipboard.setStringAsync(INVITE_LINK);
    toast.success(t('copied'), t('linkCopied'));
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="gift" tone="gold" title={t('discoverKalyx')} subtitle={t('shareWithFriends')} />

      {/* Pourquoi ils vont aimer */}
      <NovaCard delay={140}>
        {REASONS.map((r, i) => (
          <View
            key={r.text}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing(1.5),
              paddingVertical: spacing(1.25),
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: colors.border,
            }}
          >
            <IconDisc name={r.icon} />
            <Text style={[typography.body, { flex: 1 }]}>{r.text}</Text>
          </View>
        ))}
      </NovaCard>

      <KPressable onPress={copyLink} haptic="light" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 42, borderRadius: 21, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
        <Icon name="copy" size={15} color={colors.text} />
        <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{t('copyLink')}</Text>
      </KPressable>

      <View style={{ flex: 1 }} />
      <Button label={t('shareKalyx')} onPress={onShare} />
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
    </>
  );
}
