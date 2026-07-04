/**
 * Inviter des amis : code de parrainage dérivé de l'adresse du compte (stable,
 * sans backend), partage natif + copie. Le programme de récompenses n'existe
 * pas encore — le texte est HONNÊTE là-dessus (pas de fausse promesse de gains).
 */
import React from 'react';
import { View, Text, Pressable, Share, Alert } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

/** Code court, stable et lisible dérivé de l'adresse (majuscules hex, 8 car.). */
function referralCode(address?: string): string {
  if (!address) return 'NOVA';
  const hex = address.replace(/^0x/i, '').toUpperCase();
  return `NOVA-${hex.slice(0, 4)}${hex.slice(-4)}`;
}

const INVITE_LINK = 'https://nova.wallet/invite'; // page marketing (à publier)

export default function Invite() {
  const { colors, typography } = useTheme();
  const account = useWallet((s) => s.account);
  const code = referralCode(account?.address);
  const message = `Rejoins-moi sur Nova Wallet 🚀 — un wallet crypto non-custodial, simple et premium.\n\nMon code : ${code}\n${INVITE_LINK}`;

  const onShare = async () => {
    try {
      await Share.share({ message });
    } catch {
      // annulé par l'utilisateur — rien à faire
    }
  };
  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copié', `${label} copié dans le presse-papier.`);
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
          <Text style={[typography.title, { textAlign: 'center' }]}>Partage Nova</Text>
          <Text style={[typography.muted, { textAlign: 'center' }]}>
            Fais découvrir Nova à tes amis. Un programme de récompenses arrive — ton code est déjà prêt.
          </Text>
        </View>
      </GlassCard>

      {/* Code de parrainage */}
      <GlassCard>
        <Text style={typography.muted}>Ton code de parrainage</Text>
        <Pressable onPress={() => copy(code, 'Ton code')} style={{ marginTop: spacing(1) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderWidth: 1,
              borderColor: colors.glassBorder,
              borderStyle: 'dashed',
              borderRadius: radii.md,
              paddingVertical: spacing(1.5),
              paddingHorizontal: spacing(2),
            }}
          >
            <Text style={{ color: colors.text, fontSize: 20, fontFamily: fonts.bold, letterSpacing: 1 }}>{code}</Text>
            <Icon name="copy" size={18} tone="muted" />
          </View>
        </Pressable>
        <Pressable onPress={() => copy(INVITE_LINK, 'Le lien')} style={{ marginTop: spacing(1.25) }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Copier le lien d'invitation</Text>
        </Pressable>
      </GlassCard>

      {/* Étapes */}
      <GlassCard>
        {[
          { n: '1', text: 'Partage ton code ou ton lien' },
          { n: '2', text: 'Ton ami installe Nova et crée son wallet' },
          { n: '3', text: 'Vous serez éligibles aux futures récompenses' },
        ].map((s, i) => (
          <View
            key={s.n}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing(1.5),
              paddingVertical: spacing(1.25),
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: colors.glassBorder,
            }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.accent, fontFamily: fonts.bold }}>{s.n}</Text>
            </View>
            <Text style={[typography.body, { flex: 1 }]}>{s.text}</Text>
          </View>
        ))}
      </GlassCard>

      <View style={{ flex: 1 }} />
      <Button label="Partager mon invitation" onPress={onShare} />
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
  );
}
