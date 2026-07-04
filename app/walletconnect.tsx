import React, { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWalletConnect } from '../lib/walletconnect';

export default function WalletConnectScreen() {
  const configured = useWalletConnect((s) => s.configured);
  const ready = useWalletConnect((s) => s.ready);
  const sessions = useWalletConnect((s) => s.sessions);
  const pair = useWalletConnect((s) => s.pair);
  const disconnect = useWalletConnect((s) => s.disconnect);

  const [uri, setUri] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <Screen>
        <Title>WalletConnect</Title>
        <Muted>
          Ajoute un project ID gratuit (cloud.reown.com) dans la variable
          EXPO_PUBLIC_WALLETCONNECT_ID de ton .env, puis relance avec « expo start -c ».
        </Muted>
      </Screen>
    );
  }

  const onConnect = async () => {
    if (!uri.trim().startsWith('wc:')) {
      Alert.alert('URI invalide', 'Colle un lien WalletConnect qui commence par « wc: ».');
      return;
    }
    setBusy(true);
    try {
      await pair(uri);
      setUri('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/expired/i.test(msg)) {
        Alert.alert('Lien expiré', 'Ce lien WalletConnect a expiré (ils ne durent que quelques minutes). Régénère un nouveau QR / lien sur le site, puis recolle-le tout de suite.');
      } else {
        Alert.alert('Connexion impossible', 'Le lien n’a pas pu être utilisé. Régénère-le sur le site et réessaie.');
      }
      setUri('');
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async () => setUri(await Clipboard.getStringAsync());

  return (
    <Screen>
      <Title>WalletConnect</Title>
      <Muted>Sur le site, choisis « WalletConnect », copie le lien (wc:…) et colle-le ici.</Muted>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>Lien WalletConnect</Text>
          <Text onPress={onPaste} style={{ color: colors.accent, fontWeight: '600' }}>Coller</Text>
        </View>
        <TextInput value={uri} onChangeText={setUri} placeholder="wc:…" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: 14, paddingVertical: spacing(1) }} />
      </Card>
      <Button label={busy ? 'Connexion…' : 'Connecter'} loading={busy || !ready} onPress={onConnect} />

      <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
        <Text style={typography.section}>dApps connectées</Text>
        {sessions.length === 0 ? (
          <Muted>Aucune connexion active.</Muted>
        ) : (
          sessions.map((s, i) => (
            <Card key={s.topic} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{s.name}</Text>
                <Muted>{s.url}</Muted>
              </View>
              <Text onPress={() => disconnect(s.topic)} style={{ color: colors.danger, fontWeight: '600' }}>Déconnecter</Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
