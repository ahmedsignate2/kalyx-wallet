import { ScreenHeader } from '../ui/kit';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';

export default function RevealPrivateKey() {
  const { colors, typography } = useTheme();
  const t = useT();
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
      <ScreenHeader />
        <Title>{t('yourPrivateKey')}</Title>
        <Muted>{t('pkWarningBody')}</Muted>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
          <Card>
            <Text selectable style={[typography.body, { fontFamily: undefined, letterSpacing: 0.5 }]}>{pk}</Text>
          </Card>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(pk);
              toast.success(t('copied'), t('pkCopiedBody'));
            }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing(1.5) }}
          >
            <Icon name="copy" size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>{t('copyKey')}</Text>
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
            <Text style={[typography.muted, { flex: 1 }]}>{t('pkVsPhraseNote')}</Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('revealPrivateKeyTitle')}</Title>
      <Muted>
        {isPk ? t('pkImportedConfirm') : t('confirmIdentityPk')}
      </Muted>
      <View style={{ flex: 1 }} />
      <Button label={t('revealAction')} onPress={() => setConfirming(true)} />

      <ConfirmUnlock
        visible={confirming}
        title={t('revealPkSheet')}
        subtitle={t('nobodyElseSee')}
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
