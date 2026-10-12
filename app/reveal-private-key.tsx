import { IconDisc, NovaHero } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Button, Card, Screen } from '../ui/kit';
import { getAdapter } from '../src';
import { useEffect, useState } from 'react';
import { AppState, Platform, View, Text, ScrollView } from 'react-native';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
import { copySecret, clearSecret } from '../lib/secureClipboard';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { spacing, useTheme, fontSize, radii } from '../ui/theme';
import { monoFont } from '../ui/tokens';
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
  const chainName = getAdapter(useWallet.getState().activeChain).config.name;
  const [pk, setPk] = useState<string | null>(null);

  useNoScreenCapture('reveal-pk', true, { screenshotWarning: true });
  // Hors premier plan, la clé quitte l'écran : elle ne réapparaît pas au retour avant le voile.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') setPk(null);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    return () => {
      // En quittant l'écran, la clé ne reste pas dans le presse-papier.
      void clearSecret();
    };
  }, []);

  // Révèle via biométrie ou PIN (ConfirmUnlock) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    setPk(await exportPrivateKey(unlock));
  };

  if (pk) {
    return (
      <Screen layout="form">
      <ScreenHeader />
        {/* iOS ne bloque PAS la capture (lib/useNoScreenCapture.ts) : l'avertissement ne le prétend pas. */}
        {/* Le RÉSEAU de la clé : une phrase donne une clé différente par famille (EVM, Bitcoin, Solana). */}
        <NovaHero icon="copy" tone="gold" title={isPk ? t('yourPrivateKey') : `${t('yourPrivateKey')} · ${chainName}`} subtitle={Platform.OS === 'ios' ? t('pkWarningBodyNoCapture') : t('pkWarningBody')} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
          <Card padding="xl" gap="md" style={{ borderRadius: radii.xl }}>
            {/* PAS `selectable` : le menu système copiait la clé sans passer par
                copySecret (ni effacement du presse-papier, ni bandeau). */}
            <Text style={[typography.body, { fontFamily: monoFont, fontSize: fontSize.md, lineHeight: 22, letterSpacing: 0.3 }]}>{pk}</Text>
          </Card>
          <KPressable
            onPress={async () => {
              await copySecret(pk);
              toast.success(t('copied'), t('pkCopiedBody'));
            }}
            haptic="light"
            style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: spacing(1.5), paddingHorizontal: 18, height: 44, borderRadius: radii.full, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}
          >
            <Icon name="copy" size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontFamily: typography.bodyStrong.fontFamily }}>{t('copyKey')}</Text>
          </KPressable>
          <View
            style={{
              backgroundColor: 'rgba(255,181,71,0.08)',
              borderRadius: radii.lg,
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
    <Screen layout="form">
      <ScreenHeader />
      <NovaHero icon="copy" tone="gold" title={t('revealPrivateKeyTitle')} subtitle={isPk ? t('pkImportedConfirm') : t('confirmIdentityPk')} />
      <Card rise delay={160} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
        <IconDisc name="eyeOff" />
        <Text style={[typography.muted, { flex: 1 }]}>{t('nobodyElseSee')}</Text>
      </Card>
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
