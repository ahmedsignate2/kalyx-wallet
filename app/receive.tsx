import React from 'react';
import { View, Text, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet, DEFAULT_CHAIN } from '../lib/walletStore';
import { SEPOLIA } from '../src';

export default function Receive() {
  const account = useWallet((s) => s.account);
  if (!account) return null;

  return (
    <Screen>
      <Title>Recevoir</Title>
      <Muted>Adresse {SEPOLIA.name} — partage-la pour recevoir des fonds.</Muted>
      <Card>
        {/* TODO: QR code (react-native-qrcode-svg) — placeholder pour l'instant. */}
        <View
          style={{
            aspectRatio: 1,
            backgroundColor: colors.bgElevated,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Muted>QR code à venir</Muted>
        </View>
        <Text selectable style={[typography.mono, { marginTop: spacing(1.5) }]}>
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
