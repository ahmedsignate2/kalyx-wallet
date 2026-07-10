import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { getAdapter } from '../src';

export default function Receive() {
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  if (!account) return null;

  return (
    <Screen>
      <Title>{t('receive')}</Title>
      <Muted>
        {chain.family === 'bitcoin'
          ? t('receiveBtcHint')
          : chain.family === 'solana'
            ? t('receiveSolHint')
            : t('receiveEvmHint')}
      </Muted>
      <Card style={{ alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', padding: spacing(2), borderRadius: 16 }}>
          <QRCode value={account.address} size={200} />
        </View>
        <Text selectable style={[typography.mono, { marginTop: spacing(2), textAlign: 'center' }]}>
          {account.address}
        </Text>
      </Card>
      <View style={{ flex: 1 }} />
      <Button
        label={t("copyAddress")}
        onPress={async () => {
          await Clipboard.setStringAsync(account.address);
          toast.success(t('copied'), t('addressCopied'));
        }}
      />
      <Pressable
        onPress={() => router.push('/scan')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing(1.5) }}
        hitSlop={8}
      >
        <Icon name="scan" size={18} color={colors.accent} />
        <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('scanToSend')}</Text>
      </Pressable>
    </Screen>
  );
}
