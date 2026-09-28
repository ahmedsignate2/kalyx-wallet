import { Pressable as KPressable } from '../../ui/kit';
import { ConfirmUnlock } from '../../ui/ConfirmUnlock';
import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, SegmentedTabs } from '../../ui/premium';
import { WalletAvatar, AvatarPicker } from '../../ui/avatarArt';
import { Icon, type IconName } from '../../ui/icon';
import { useAiStore } from '../../lib/aiStore';
import { spacing, useTheme } from '../../ui/theme';
import { useSettings, useT } from '../../lib/settingsStore';
import { useWallet } from '../../lib/walletStore';
import { ActionDisc, IconDisc, Orbit, Rise, SectionLabel } from '../../ui/nova';

function Ico({ n, tone }: { n: IconName; tone?: 'gold' | 'danger' }) {
  return <IconDisc name={n} tone={tone} />;
}
const chev = <Icon name="chevron" size={18} tone="faint" />;

export default function Menu() {
  const { colors, typography } = useTheme();
  const t = useT();
  const aiEnabled = useAiStore((s) => s.isEnabled);
  const { profileName, uiMode, setUiMode } = useSettings();
  const reset = useWallet((s) => s.reset);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const [pickAvatar, setPickAvatar] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const expert = uiMode === 'expert';

  const onReset = () =>
    Alert.alert(t('resetWallet'), t('resetWarning'), [
      { text: t('cancel'), style: 'cancel' },
      // Tout effacer exige le code (ou la biométrie), pas seulement cette confirmation.
      { text: t('resetWallet'), style: 'destructive', onPress: () => setConfirmReset(true) },
    ]);

  return (
    <PremiumScreen tabBarSpace>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={typography.title}>{t('menu')}</Text>

      {/* Profil : l'avatar dans son orbite, comme le halo de l'accueil. */}
      <Rise>
      <KPressable onPress={() => router.push('/settings')}>
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
            {/* L'avatar a son propre geste : le reste de la carte mène aux réglages. */}
            <KPressable onPress={() => setPickAvatar(true)} hitSlop={6} accessibilityLabel={t('a11yChangeAvatar')} style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: 30, top: 30 }}><Orbit cx={0} cy={0} r={38} /></View>
              <WalletAvatar size={56} />
            </KPressable>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{profileName || t('yourProfile')}</Text>
              <Text style={typography.muted}>{t('profile')} · {t('settings')}</Text>
            </View>
            {chev}
          </View>
        </GlassCard>
      </KPressable>
      </Rise>

      {/* Raccourcis : les quatre destinations les plus fréquentes, en disques. */}
      <View style={{ flexDirection: 'row', gap: spacing(1) }}>
        <ActionDisc index={0} icon="wallets" label={t('menuSecWallets')} onPress={() => router.push('/wallets')} />
        <ActionDisc index={1} icon="accounts" label={t('accounts')} onPress={() => router.push('/accounts')} />
        <ActionDisc index={2} icon="networks" label={t('networks')} onPress={() => router.push('/networks')} />
        <ActionDisc index={3} icon="walletconnect" label="WalletConnect" onPress={() => router.push('/walletconnect')} />
      </View>

      {/* Wallets */}
      <SectionLabel>{t('menuSecWallets')}</SectionLabel>
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
      <SectionLabel>{t('menuSecConnections')}</SectionLabel>
      <GlassCard>
        <ListRow left={<Ico n="accounts" />} title={t('accounts')} right={chev} onPress={() => router.push('/accounts')} />
        <ListRow divider left={<Ico n="networks" />} title={t('networks')} right={chev} onPress={() => router.push('/networks')} />
        <ListRow divider left={<Ico n="dapps" />} title={t('dappBrowser')} subtitle={t('dappBrowserSub')} right={chev} onPress={() => router.navigate('/browser')} />
        <ListRow divider left={<Ico n="walletconnect" />} title="WalletConnect" subtitle={t('connectedApps')} right={chev} onPress={() => router.push('/walletconnect')} />
        <ListRow divider left={<Ico n="security" />} title={t('approvals')} subtitle={t('approvalsSub')} right={chev} onPress={() => router.push('/approvals')} />
        <ListRow divider left={<Ico n="contacts" />} title={t('contacts')} right={chev} onPress={() => router.push('/contacts')} />
        <ListRow divider left={<Ico n="history" />} title={t("activity")} subtitle={t("allTransactions")} right={chev} onPress={() => router.push('/history')} />
        {aiEnabled ? <ListRow divider left={<Ico n="sparkles" />} title={t("assistant")} subtitle={t("assistantSubtitle")} right={chev} onPress={() => useAiStore.getState().openChat()} /> : null}
      </GlassCard>

      {/* Préférences */}
      <SectionLabel>{t('menuSecPreferences')}</SectionLabel>
      <GlassCard>
        <ListRow left={<Ico n="language" />} title={t('language')} right={chev} onPress={() => router.push('/language')} />
        <ListRow divider left={<Ico n="currency" />} title={t('currency')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico n="appearance" />} title={t('appearance')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico n="notifications" />} title={t('notifications')} right={chev} onPress={() => router.push('/notifications')} />
      </GlassCard>

      {/* Sécurité */}
      <SectionLabel>{t('security')}</SectionLabel>
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
      <SectionLabel>{t('menuSecCommunity')}</SectionLabel>
      <GlassCard>
        <ListRow left={<Ico n="gift" tone="gold" />} title={t('inviteFriends')} subtitle={t('inviteFriendsSub')} right={chev} onPress={() => router.push('/invite')} />
        <ListRow divider left={<Ico n="star" />} title={t('supportUs')} subtitle={t('supportUsSub')} right={chev} onPress={() => router.push('/support')} />
        <ListRow divider left={<Ico n="bulb" />} title={t('suggestFeature')} subtitle={t('suggestFeatureSub')} right={chev} onPress={() => router.push('/feature-request')} />
      </GlassCard>

      {/* Aide */}
      <SectionLabel>{t('menuSecHelp')}</SectionLabel>
      <GlassCard>
        <ListRow left={<Ico n="faq" />} title={t('faq')} right={chev} onPress={() => router.push('/faq')} />
        <ListRow divider left={<Ico n="support" />} title={t('supportHistoryTitle')} subtitle={t('supportDiagnosticSubtitle')} right={chev} onPress={() => router.push('/support-history')} />
        <ListRow divider left={<Ico n="about" />} title={t('legalTitle')} subtitle={`Kalyx · v${Constants.expoConfig?.version ?? '0.0.1'}`} right={chev} onPress={() => router.push('/about')} />
      </GlassCard>

      <ListRow left={<Ico n="reset" tone="danger" />} title={t('resetWallet')} right={<Icon name="chevron" size={18} color={colors.danger} />} onPress={onReset} />
      <AvatarPicker walletId={activeWalletId} visible={pickAvatar} onClose={() => setPickAvatar(false)} />
      <ConfirmUnlock
        visible={confirmReset}
        title={t('resetWallet')}
        perform={(unlock) => reset(unlock)}
        onDone={() => {
          setConfirmReset(false);
          router.replace('/welcome');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </PremiumScreen>
  );
}
