import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { toast } from '../lib/toast';

export default function RevealPrivateKey() {
  const { colors, typography } = useTheme();
  const exportPrivateKey = useWallet((s) => s.exportPrivateKey);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const wallets = useWallet((s) => s.wallets);
  const isPk = wallets.find((w) => w.id === activeWalletId)?.type === 'privateKey';
  const [confirming, setConfirming] = useState(false);
  const [pk, setPk] = useState<string | null>(null);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('reveal-pk').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('reveal-pk').catch(() => {});
    };
  }, []);

  // Révèle via biométrie ou PIN (ConfirmUnlock) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    setPk(await exportPrivateKey(unlock));
  };

  if (pk) {
    return (
      <Screen>
        <Title>Ta clé privée</Title>
        <Muted>
          Quiconque détient cette clé contrôle ce compte. Ne la partage jamais, ne la saisis
          sur aucun site. Capture d’écran bloquée.
        </Muted>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
          <Card>
            <Text selectable style={[typography.body, { fontFamily: undefined, letterSpacing: 0.5 }]}>{pk}</Text>
          </Card>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(pk);
              toast.success('Copié', 'Clé privée copiée. Colle-la vite et efface le presse-papier.');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing(1.5) }}
          >
            <Icon name="copy" size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>Copier la clé</Text>
          </Pressable>
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderRadius: radii.sm,
              padding: spacing(1.5),
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Icon name="warning" size={18} color={colors.warning} />
            <Text style={[typography.muted, { flex: 1 }]}>
              Une clé privée ne protège qu’un seul compte. Ta phrase de récupération, elle,
              restaure TOUT le portefeuille — garde-la aussi en lieu sûr.
            </Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Afficher la clé privée</Title>
      <Muted>
        {isPk
          ? 'Ce portefeuille a été importé par clé privée. Confirme ton identité pour l’afficher.'
          : 'Confirme ton identité pour révéler la clé privée du compte actif.'}
      </Muted>
      <View style={{ flex: 1 }} />
      <Button label="Afficher" onPress={() => setConfirming(true)} />

      <ConfirmUnlock
        visible={confirming}
        title="Révéler la clé privée"
        subtitle="Personne d'autre ne doit la voir."
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
