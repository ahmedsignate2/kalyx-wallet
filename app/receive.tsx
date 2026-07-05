import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { toast } from '../lib/toast';
import { getAdapter } from '../src';

export default function Receive() {
  const { colors, typography } = useTheme();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  if (!account) return null;

  return (
    <Screen>
      <Title>Recevoir</Title>
      <Muted>
        {chain.family === 'bitcoin'
          ? `Adresse Bitcoin (${chain.name}) — n'envoie que du BTC ici.`
          : chain.family === 'solana'
            ? 'Adresse Solana — pour du SOL et des tokens SPL.'
            : 'Adresse EVM — la même sur Ethereum, Polygon, BNB, Base…'}
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
        label="Copier l'adresse"
        onPress={async () => {
          await Clipboard.setStringAsync(account.address);
          toast.success('Copié', 'Adresse copiée.');
        }}
      />
      <Pressable
        onPress={() => router.push('/scan')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing(1.5) }}
        hitSlop={8}
      >
        <Icon name="scan" size={18} color={colors.accent} />
        <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Scanner une adresse pour envoyer</Text>
      </Pressable>
    </Screen>
  );
}
