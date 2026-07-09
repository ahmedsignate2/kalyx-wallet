/**
 * « Soutenez-nous » : Nova est un wallet non-custodial, gratuit, sans pub ni
 * revente de données, développé en indépendant. Cette page explique POURQUOI
 * soutenir et propose des dons (PayPal + BTC/SOL/ETH). Aucune adresse ne quitte
 * l'app : ce sont des adresses de RÉCEPTION publiques codées ici.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { PremiumScreen, GlassCard, RemoteIcon } from '../ui/premium';
import { NovaLogo } from '../ui/NovaLogo';
import { Icon, type IconName } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { chainIconUrl } from '../src';

const PAYPAL_EMAIL = 'amsssr400@gmail.com';

const CRYPTO = [
  { key: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', address: 'bc1qwdqesyfzja4585f09ylvp4rc2lyqhvmvlvytx4' },
  { key: 'ethereum', name: 'Ethereum (EVM)', symbol: 'ETH', address: '0x7411b6a0b4df0f3a0bab9fe2c5d5cb47ddbdb69b' },
  { key: 'solana', name: 'Solana', symbol: 'SOL', address: '46L3QPmk7daHeDgegZCPCTkXegotaoRpwoVpDMnxhpVP' },
] as const;

const REASONS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'security', title: 'Non-custodial, pour de vrai', text: 'Tes clés restent chez toi. On ne touche jamais à tes fonds.' },
  { icon: 'eyeOff', title: 'Zéro pub, zéro revente de données', text: 'On ne vend rien, on ne piste personne. Ton wallet t’appartient.' },
  { icon: 'flash', title: 'Développé en indépendant', text: 'Une petite équipe passionnée, pas un géant. Chaque don compte.' },
  { icon: 'developer', title: 'Où va ton don', text: 'Serveurs, clés d’API (RPC, prix, NFT), et de nouvelles fonctionnalités.' },
];

export default function Support() {
  const { colors, typography } = useTheme();
  const [openQr, setOpenQr] = useState<string | null>(null);

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    toast.success('Copié', `${label} copié dans le presse-papier.`);
  };

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Soutenez-nous' }} />

      {/* Hero */}
      <View style={{ alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1) }}>
        <NovaLogo size={72} />
        <Text style={{ color: colors.text, fontSize: 24, fontFamily: fonts.extrabold, textAlign: 'center' }}>Soutiens Nova 💜</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          Nova est gratuit et le restera. Si l’app t’est utile, un don nous aide à la faire vivre et grandir.
        </Text>
      </View>

      {/* Pourquoi nous soutenir */}
      <GlassCard>
        {REASONS.map((r, i) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: spacing(1.5), alignItems: 'flex-start', paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.icon} size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{r.title}</Text>
              <Text style={typography.muted}>{r.text}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      {/* PayPal */}
      <Text style={[typography.section, { marginTop: spacing(1) }]}>Par PayPal</Text>
      <Pressable onPress={() => copy(PAYPAL_EMAIL, 'E-mail PayPal')}>
        <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#003087', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontFamily: fonts.extrabold, fontSize: 18 }}>P</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.bodyStrong}>{PAYPAL_EMAIL}</Text>
            <Text style={typography.muted}>Envoie un don à cet e-mail · appuie pour copier</Text>
          </View>
          <Icon name="copy" size={18} tone="muted" />
        </GlassCard>
      </Pressable>
      <Pressable onPress={() => Linking.openURL('https://www.paypal.com/myaccount/transfer/homepage').catch(() => {})} style={{ alignSelf: 'center', paddingVertical: spacing(1) }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Ouvrir PayPal ↗</Text>
      </Pressable>

      {/* Crypto */}
      <Text style={[typography.section, { marginTop: spacing(0.5) }]}>En crypto</Text>
      {CRYPTO.map((c) => {
        const open = openQr === c.key;
        return (
          <GlassCard key={c.key} style={{ gap: spacing(1.25) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <RemoteIcon uri={chainIconUrl(c.key)} label={c.symbol} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong}>{c.name}</Text>
                <Text style={typography.muted}>{c.symbol}</Text>
              </View>
              <Pressable onPress={() => setOpenQr(open ? null : c.key)} hitSlop={8} style={{ padding: 6 }}>
                <Icon name="scan" size={20} color={open ? colors.accent : colors.textMuted} />
              </Pressable>
            </View>

            <Pressable onPress={() => copy(c.address, `Adresse ${c.symbol}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25) }}>
              <Text selectable style={[typography.mono, { flex: 1, fontSize: 12.5 }]} numberOfLines={1}>{c.address}</Text>
              <Icon name="copy" size={16} color={colors.accent} />
            </Pressable>

            {open ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing(1) }}>
                <View style={{ backgroundColor: '#fff', padding: spacing(1.5), borderRadius: 14 }}>
                  <QRCode value={c.address} size={168} />
                </View>
              </View>
            ) : null}
          </GlassCard>
        );
      })}

      <Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(1), marginBottom: spacing(2) }]}>
        Merci du fond du cœur 🙏 — chaque contribution nous aide à rester indépendants.
      </Text>
    </PremiumScreen>
  );
}
