import React from 'react';
import { View, Text, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter } from '../src';

export default function Receive() {
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  if (!account) return null;

  return (
    <Screen>
      <Title>Recevoir</Title>
      <Muted>
        Adresse {chain.name} — même adresse sur tous les réseaux EVM.
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
          Alert.alert('Copié', 'Adresse copiée.');
        }}
      />
    </Screen>
  );
}
