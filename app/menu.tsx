import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, SegmentedTabs, GradientAvatar } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { AppTabBar } from '../ui/tabs';
import { useAiStore } from '../lib/aiStore';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';

function Ico({ n }: { n: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 30, alignItems: 'center' }}>
      <Icon name={n} size={20} tone="muted" />
    </View>
  );
}
const chev = <Icon name="chevron" size={18} tone="faint" />;

export default function Menu() {
  const { colors, typography } = useTheme();
  const t = useT();
  const aiEnabled = useAiStore((s) => s.isEnabled);
  const { profileName, uiMode, setUiMode } = useSettings();
  const reset = useWallet((s) => s.reset);
  const expert = uiMode === 'expert';

  const onReset = () =>
    Alert.alert(t('resetWallet'), t('resetWarning'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('resetWallet'), style: 'destructive', onPress: async () => { await reset(); router.replace('/welcome'); } },
    ]);

  return (
    <PremiumScreen footer={<AppTabBar active="menu" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={typography.title}>{t('menu')}</Text>

      {/* Profil */}
      <Pressable onPress={() => router.push('/settings')}>
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <GradientAvatar label={(profileName || 'K').slice(0, 1).toUpperCase()} />
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{profileName || t('yourProfile')}</Text>
              <Text style={typography.muted}>{t('profile')} · {t('settings')}</Text>
            </View>
            {chev}
          </View>
        </GlassCard>
      </Pressable>

      {/* Wallets */}
      <GlassCard>
        <ListRow left={<Ico n="wallets" />} title={t('myWallets')} subtitle={t('myWalletsSub')} right={chev} onPress={() => router.push('/wallets')} />
        <ListRow divider left={<Ico n="import" />} title={t('importWalletT')} right={chev} onPress={() => router.push('/import-wallet')} />
        <ListRow divider left={<Ico n="create" />} title={t('createWalletT')} right={chev} onPress={() => router.push('/create-wallet')} />
      </GlassCard>

      {/* Mode d'interface (différenciateur Kalyx) */}
      <GlassCard>
        <Text style={typography.muted}>{t('uiMode')}</Text>
        <View style={{ marginTop: spacing(1) }}>
          <SegmentedTabs
            active={uiMode}
            onChange={(k) => setUiMode(k as 'beginner' | 'expert')}
            items={[
              { key: 'beginner', label: t('beginnerMode') },
              { key: 'expert', label: t('expertMode') },
            ]}
          />
        </View>
        <Text style={[typography.muted, { marginTop: spacing(1) }]}>
          {expert ? t('expertModeHint') : t('beginnerModeHint')}
        </Text>
      </GlassCard>

      {/* Compte & réseaux */}
      <GlassCard>
        <ListRow left={<Ico n="accounts" />} title={t('accounts')} right={chev} onPress={() => router.push('/accounts')} />
        <ListRow divider left={<Ico n="networks" />} title={t('networks')} right={chev} onPress={() => router.push('/networks')} />
        <ListRow divider left={<Ico n="dapps" />} title={t('dappBrowser')} subtitle={t('dappBrowserSub')} right={chev} onPress={() => router.push('/browser')} />
        <ListRow divider left={<Ico n="walletconnect" />} title="WalletConnect" subtitle={t('connectedApps')} right={chev} onPress={() => router.push('/walletconnect')} />
        <ListRow divider left={<Ico n="security" />} title={t('approvals')} subtitle={t('approvalsSub')} right={chev} onPress={() => router.push('/approvals')} />
        <ListRow divider left={<Ico n="contacts" />} title={t('contacts')} right={chev} onPress={() => router.push('/contacts')} />
        <ListRow divider left={<Ico n="history" />} title={t("activity")} subtitle={t("allTransactions")} right={chev} onPress={() => router.push('/history')} />
        {aiEnabled ? <ListRow divider left={<Ico n="sparkles" />} title={t("assistant")} subtitle={t("assistantSubtitle")} right={chev} onPress={() => useAiStore.getState().openChat()} /> : null}
      </GlassCard>

      {/* Préférences */}
      <GlassCard>
        <ListRow left={<Ico n="language" />} title={t('language')} right={chev} onPress={() => router.push('/language')} />
        <ListRow divider left={<Ico n="currency" />} title={t('currency')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico n="appearance" />} title={t('appearance')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico n="notifications" />} title={t('notifications')} right={chev} onPress={() => router.push('/notifications')} />
      </GlassCard>

      {/* Sécurité */}
      <GlassCard>
        <ListRow left={<Ico n="security" />} title={t('security')} subtitle={t("securityCenter")} right={chev} onPress={() => router.push('/security')} />
        <ListRow divider left={<Ico n="bell" />} title={t('priceAlerts')} subtitle={t('priceAlertsSub')} right={chev} onPress={() => router.push('/price-alerts')} />
        <ListRow divider left={<Ico n="pin" />} title={t('changePin')} right={chev} onPress={() => router.push('/change-pin')} />
        <ListRow divider left={<Ico n="phrase" />} title={t('revealPhrase')} right={chev} onPress={() => router.push('/reveal-phrase')} />
        <ListRow divider left={<Ico n="copy" />} title={t('revealPrivateKey')} right={chev} onPress={() => router.push('/reveal-private-key')} />
        <ListRow divider left={<Ico n="share" />} title={t('encBackup')} subtitle={t('encBackupSub')} right={chev} onPress={() => router.push('/cloud-backup')} />
      </GlassCard>

      {/* Avancé (mode expert) */}
      {expert ? (
        <GlassCard>
          <ListRow left={<Ico n="developer" />} title={t('developer')} subtitle={t('developerSub')} right={chev} onPress={() => router.push('/developer')} />
          <ListRow divider left={<Ico n="extensions" />} title={t('extensions')} subtitle={t('extensionsSub')} right={chev} onPress={() => router.push('/extensions')} />
        </GlassCard>
      ) : null}

      {/* Inviter des amis + soutenir + suggestions */}
      <GlassCard>
        <ListRow left={<Ico n="gift" />} title={t('inviteFriends')} subtitle={t('inviteFriendsSub')} right={chev} onPress={() => router.push('/invite')} />
        <ListRow divider left={<Ico n="star" />} title={t('supportUs')} subtitle={t('supportUsSub')} right={chev} onPress={() => router.push('/support')} />
        <ListRow divider left={<Ico n="bulb" />} title={t('suggestFeature')} subtitle={t('suggestFeatureSub')} right={chev} onPress={() => router.push('/feature-request')} />
      </GlassCard>

      {/* Aide */}
      <GlassCard>
        <ListRow left={<Ico n="faq" />} title={t('faq')} right={chev} onPress={() => router.push('/faq')} />
        <ListRow divider left={<Ico n="about" />} title={t('about')} subtitle={`Kalyx · v${Constants.expoConfig?.version ?? '0.0.1'}`} right={chev} onPress={() => router.push('/about')} />
      </GlassCard>

      <ListRow left={<Ico n="reset" />} title={t('resetWallet')} right={<Icon name="chevron" size={18} color={colors.danger} />} onPress={onReset} />
    </PremiumScreen>
  );
}
