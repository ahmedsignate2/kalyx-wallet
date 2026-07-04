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

const INVITE_LINK = 'https://nova.wallet'; // site public (à publier)
const SHARE_MESSAGE = `Rejoins-moi sur Nova Wallet 🚀\n\nUn wallet crypto non-custodial, simple et vraiment premium : tes clés restent chez toi, swap intégré, dApps, NFT.\n\n${INVITE_LINK}`;

const REASONS: { icon: IconName; text: string }[] = [
  { icon: 'security', text: 'Non-custodial : les clés restent sur le téléphone' },
  { icon: 'exchange', text: 'Swap & bridge intégrés' },
  { icon: 'dapps', text: 'Navigateur dApps + WalletConnect' },
  { icon: 'nft', text: 'Tokens, NFT et historique réels' },
];

export default function Invite() {
  const { colors, typography } = useTheme();

  const onShare = async () => {
    try {
      await Share.share({ message: SHARE_MESSAGE });
    } catch {
      // annulé par l'utilisateur — rien à faire
    }
  };
  const copyLink = async () => {
    await Clipboard.setStringAsync(INVITE_LINK);
    toast.success('Copié', 'Le lien est dans le presse-papier.');
  };

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Inviter des amis' }} />

      {/* Bandeau visuel */}
      <GlassCard glow>
        <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gift" size={30} color={colors.accent} />
          </View>
          <Text style={[typography.title, { textAlign: 'center' }]}>Fais découvrir Nova</Text>
          <Text style={[typography.muted, { textAlign: 'center' }]}>
            Partage l'app avec tes amis — simplement, parce qu'elle est bien.
          </Text>
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
        <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Copier le lien</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Button label="Partager Nova" onPress={onShare} />
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
  );
}
