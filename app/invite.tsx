/**
 * Inviter des amis : partage simple de Nova (message + lien), via le partage
 * natif. PAS de programme de parrainage ni de récompense — juste faire découvrir
 * l'app. On n'affiche donc aucun « code de parrainage » (ce serait un mécanisme
 * factice sans backend d'attribution).
 */
import React from 'react';
import { View, Text, Pressable, Share } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon, type IconName } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';
import { PLAY_STORE_URL } from '../lib/appLinks';

// Lien Play Store : ouvre le store pour installer, ou « Ouvrir » si déjà installée.
const INVITE_LINK = PLAY_STORE_URL;

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
      <Stack.Screen options={{ headerShown: true, title: t('inviteFriends') }} />
      <PremiumScreen>

      {/* Bandeau visuel */}
      <GlassCard glow>
        <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gift" size={30} color={colors.accent} />
          </View>
          <Text style={[typography.title, { textAlign: 'center' }]}>{t('discoverNova')}</Text>
          <Text style={[typography.muted, { textAlign: 'center' }]}>{t('shareWithFriends')}</Text>
        </View>
      </GlassCard>

      {/* Pourquoi ils vont aimer */}
      <GlassCard>
        {REASONS.map((r, i) => (
          <View
            key={r.text}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing(1.5),
              paddingVertical: spacing(1.25),
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: colors.glassBorder,
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.icon} size={17} color={colors.accent} />
            </View>
            <Text style={[typography.body, { flex: 1 }]}>{r.text}</Text>
          </View>
        ))}
      </GlassCard>

      <Pressable onPress={copyLink} style={{ alignSelf: 'center' }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('copyLink')}</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Button label={t('shareNova')} onPress={onShare} />
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
    </>
  );
}
