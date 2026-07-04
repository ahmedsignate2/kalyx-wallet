import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWalletConnect } from '../lib/walletconnect';
import { toast } from '../lib/toast';

export default function WalletConnectScreen() {
  const { colors, typography } = useTheme();
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
      toast.error('URI invalide', 'Colle un lien WalletConnect qui commence par « wc: ».');
      return;
    }
    setBusy(true);
    try {
      await pair(uri);
      setUri('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/expired/i.test(msg)) {
        toast.error('Lien expiré', 'Ce lien a expiré. Régénère un QR / lien sur le site puis recolle-le tout de suite.');
      } else {
        toast.error('Connexion impossible', 'Le lien n’a pas pu être utilisé. Régénère-le et réessaie.');
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
          <Text onPress={onPaste} style={{ color: colors.accent, fontFamily: fonts.semibold }}>Coller</Text>
        </View>
        <TextInput value={uri} onChangeText={setUri} placeholder="wc:…" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: 14, paddingVertical: spacing(1) }} />
      </Card>
      <Button label={busy ? 'Connexion…' : 'Connecter'} loading={busy || !ready} onPress={onConnect} />

      <Text style={[typography.section, { marginTop: spacing(2) }]}>dApps connectées</Text>
      <ScrollView
        style={{ flex: 1, marginTop: spacing(1) }}
        contentContainerStyle={{ gap: spacing(1), paddingBottom: spacing(4) }}
        showsVerticalScrollIndicator={false}
      >
        {sessions.length === 0 ? (
          <Muted>Aucune connexion active.</Muted>
        ) : (
          sessions.map((s) => (
            <Card key={s.topic} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{s.name}</Text>
                <Muted>{s.url}</Muted>
              </View>
              <Text onPress={() => disconnect(s.topic)} style={{ color: colors.danger, fontFamily: fonts.semibold }}>Déconnecter</Text>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
