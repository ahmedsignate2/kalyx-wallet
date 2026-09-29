/**
 * « Soutenez-nous » : Kalyx est un wallet non-custodial, gratuit, sans pub ni
 * revente de données, développé en indépendant. Cette page explique POURQUOI
 * soutenir et propose des dons en crypto (BTC/ETH/SOL/TON). Aucune adresse ne quitte
 * l'app : ce sont des adresses de RÉCEPTION publiques codées ici.
 *
 * TON : le nom `kalyxwallet.ton` est MONTRÉ, l'adresse se copie (elle marche
 * dans tous les wallets, même ceux qui ne résolvent pas les noms). Vérifié le
 * 28/09 : `kalyxwallet.ton` résout exactement vers cette adresse.
 */
import { IconDisc, NovaCard, NovaHero, SectionLabel, SettingRow } from '../ui/nova';
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
  // Propriétaire de kalyxwallet.ton (W5, forme non rebondissante, réseau principal).
  { key: 'ton', name: 'TON', symbol: 'TON', address: 'UQBapKtQghRx5Wh1WpscDbNNH9kLIpdd89rSxMU5EJCmVBrU', domain: 'kalyxwallet.ton' },
] as const satisfies readonly { key: string; name: string; symbol: string; address: string; domain?: string }[];

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
      <NovaHero title={t('supportKalyxHero')} subtitle={t('supportIntro')}>
        <KalyxLogo size={72} />
      </NovaHero>

      {/* Pourquoi nous soutenir */}
      <NovaCard delay={140}>
        {REASONS.map((r, i) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: spacing(1.5), alignItems: 'flex-start', paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
            <IconDisc name={r.icon} tone="gold" />
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{r.title}</Text>
              <Text style={typography.muted}>{r.text}</Text>
            </View>
          </View>
        ))}
      </NovaCard>

      {/* Crypto */}
      <SectionLabel>{t('inCrypto')}</SectionLabel>
      {CRYPTO.map((c, ci) => {
        const open = openQr === c.key;
        return (
          <NovaCard key={c.key} delay={200 + ci * 50} style={{ gap: spacing(1.25) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <RemoteIcon uri={chainIconUrl(c.key)} label={c.symbol} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong}>{c.name}</Text>
                <Text style={typography.muted}>{'domain' in c ? `${c.symbol} · ${c.domain}` : c.symbol}</Text>
              </View>
              <KPressable onPress={() => setOpenQr(open ? null : c.key)} hitSlop={8} accessibilityLabel="QR">
                <IconDisc name="scan" tone={open ? 'gold' : undefined} size={36} />
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
          </NovaCard>
        );
      })}

      <NovaCard delay={320}>
        <SettingRow icon="support" title={t('supportHistoryTitle')} hint={t('supportDiagnosticSubtitle')} onPress={() => router.push('/support-history')} />
      </NovaCard>

      <Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(1), marginBottom: spacing(2) }]}>
        {t('thanksHeartfelt')}
      </Text>
    </PremiumScreen>
  );
}
