/**
 * « Soutenez-nous » : Kalyx est un wallet non-custodial, gratuit, sans pub ni
 * revente de données, développé en indépendant. Cette page explique POURQUOI
 * soutenir et propose des dons en crypto (BTC/SOL/ETH). Aucune adresse ne quitte
 * l'app : ce sont des adresses de RÉCEPTION publiques codées ici.
 */
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { PremiumScreen, GlassCard, RemoteIcon } from '../ui/premium';
import { KalyxLogo } from '../ui/KalyxLogo';
import { Icon, type IconName } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';
import { chainIconUrl } from '../src';

const CRYPTO = [
  { key: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', address: 'bc1qkalyxyueng23j7elpqrk4pcp3thp94u6cs5rkn' },
  { key: 'ethereum', name: 'Ethereum (EVM)', symbol: 'ETH', address: '0x7411b6a0b4df0f3a0bab9fe2c5d5cb47ddbdb69b' },
  { key: 'solana', name: 'Solana', symbol: 'SOL', address: 'KALYXiXBdhzuEyFuPx9EdoqyaiUcrBTT9k66v4C13jz' },
] as const;

export default function Support() {
  const { colors, typography } = useTheme();
  const t = useT();
  const [openQr, setOpenQr] = useState<string | null>(null);
  const REASONS: { icon: IconName; title: string; text: string }[] = [
    { icon: 'security', title: t('supReason1Title'), text: t('supReason1Text') },
    { icon: 'eyeOff', title: t('supReason2Title'), text: t('supReason2Text') },
    { icon: 'flash', title: t('supReason3Title'), text: t('supReason3Text') },
    { icon: 'developer', title: t('supReason4Title'), text: t('supReason4Text') },
  ];

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    toast.success(t('copied'), t('copiedToClipboard').replace('{label}', label));
  };

  return (
    <PremiumScreen>
      <ScreenHeader />
      {/* En-tête masqué → le dégradé remonte jusqu'en haut (pas de bandeau noir) */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Hero */}
      <View style={{ alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1) }}>
        <KalyxLogo size={72} />
        <Text style={{ color: colors.text, fontSize: 24, fontFamily: fonts.extrabold, textAlign: 'center' }}>{t('supportKalyxHero')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>{t('supportIntro')}</Text>
      </View>

      {/* Pourquoi nous soutenir */}
      <GlassCard>
        {REASONS.map((r, i) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: spacing(1.5), alignItems: 'flex-start', paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{r.title}</Text>
              <Text style={typography.muted}>{r.text}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      {/* Crypto */}
      <Text style={[typography.section, { marginTop: spacing(1.5) }]}>{t('inCrypto')}</Text>
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
              <KPressable onPress={() => setOpenQr(open ? null : c.key)} hitSlop={8} style={{ padding: 6 }}>
                <Icon name="scan" size={20} color={open ? colors.primary : colors.textSecondary} />
              </KPressable>
            </View>

            <KPressable onPress={() => copy(c.address, `${t('addressLabel')} ${c.symbol}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.surface2, borderRadius: radii.md, padding: spacing(1.25), overflow: 'hidden' }}>
              <Text selectable style={[typography.mono, { flex: 1, minWidth: 0, fontSize: 12.5 }]} numberOfLines={1} ellipsizeMode="middle">{c.address}</Text>
              <Icon name="copy" size={16} color={colors.primary} />
            </KPressable>

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

      <GlassCard style={{ padding: spacing(1.5), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), flex: 1 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="support" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontFamily: fonts.semibold }}>{t('supportHistoryTitle')}</Text>
            <Text style={[typography.micro, { color: colors.textSecondary }]}>{t('supportDiagnosticSubtitle')}</Text>
          </View>
        </View>
        <KPressable
          onPress={() => router.push('/support-history')}
          style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.75), borderRadius: radii.sm, backgroundColor: colors.primary }}
        >
          <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 12 }}>{t('supportHistoryDetails')}</Text>
        </KPressable>
      </GlassCard>

      <Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(1), marginBottom: spacing(2) }]}>
        {t('thanksHeartfelt')}
      </Text>
    </PremiumScreen>
  );
}
