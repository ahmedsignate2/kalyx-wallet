import React from 'react';
import { View, Text, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { SEPOLIA } from '../src';

export default function Receive() {
  const account = useWallet((s) => s.account);
  if (!account) return null;

  return (
    <Screen>
      <Title>Recevoir</Title>
      <Muted>Adresse {SEPOLIA.name} — partage-la pour recevoir des fonds.</Muted>
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
