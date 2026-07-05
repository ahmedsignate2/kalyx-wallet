import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, Chip, SegmentedTabs, GradientAvatar } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { AppTabBar } from '../ui/tabs';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import { toast } from '../lib/toast';

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
  const { profileName, uiMode, setUiMode } = useSettings();
  const reset = useWallet((s) => s.reset);
  const expert = uiMode === 'expert';
  const soon = () => toast.info(t('soon'));
  const soonChip = <Chip label={t('soon')} />;

  const onReset = () =>
    Alert.alert(t('resetWallet'), 'Assure-toi d’avoir ta phrase de récupération.', [
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
            <GradientAvatar label={(profileName || 'N').slice(0, 1).toUpperCase()} />
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{profileName || 'Ton profil'}</Text>
              <Text style={typography.muted}>{t('profile')} · {t('settings')}</Text>
            </View>
            {chev}
          </View>
        </GlassCard>
      </Pressable>

      {/* Wallets */}
      <GlassCard>
        <ListRow left={<Ico n="wallets" />} title="Mes portefeuilles" subtitle="Gérer plusieurs portefeuilles" right={chev} onPress={() => router.push('/wallets')} />
        <ListRow divider left={<Ico n="import" />} title="Importer un portefeuille" right={chev} onPress={() => router.push('/import-wallet')} />
        <ListRow divider left={<Ico n="create" />} title="Créer un portefeuille" right={chev} onPress={() => router.push('/create-wallet')} />
      </GlassCard>

      {/* Mode d'interface (différenciateur Nova) */}
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
          {expert ? 'RPC custom, outils dev et réglages avancés visibles.' : 'Interface simplifiée : l’essentiel seulement.'}
        </Text>
      </GlassCard>

      {/* Compte & réseaux */}
      <GlassCard>
        <ListRow left={<Ico n="accounts" />} title={t('accounts')} right={chev} onPress={() => router.push('/accounts')} />
        <ListRow divider left={<Ico n="networks" />} title={t('networks')} right={chev} onPress={() => router.push('/networks')} />
        <ListRow divider left={<Ico n="dapps" />} title="Navigateur dApps" subtitle="Uniswap, OpenSea… dans Nova" right={chev} onPress={() => router.push('/browser')} />
        <ListRow divider left={<Ico n="walletconnect" />} title="WalletConnect" subtitle={t('connectedApps')} right={chev} onPress={() => router.push('/walletconnect')} />
        <ListRow divider left={<Ico n="security" />} title="Approbations" subtitle="Révoquer les autorisations de dépense" right={chev} onPress={() => router.push('/approvals')} />
        <ListRow divider left={<Ico n="contacts" />} title={t('contacts')} right={chev} onPress={() => router.push('/contacts')} />
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
        <ListRow left={<Ico n="security" />} title={t('security')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico n="pin" />} title={t('changePin')} right={chev} onPress={() => router.push('/change-pin')} />
        <ListRow divider left={<Ico n="phrase" />} title={t('revealPhrase')} right={chev} onPress={() => router.push('/reveal-phrase')} />
      </GlassCard>

      {/* Avancé (mode expert) */}
      {expert ? (
        <GlassCard>
          <ListRow left={<Ico n="developer" />} title={t('developer')} subtitle="RPC custom, réseaux, services" right={chev} onPress={() => router.push('/developer')} />
          <ListRow divider left={<Ico n="extensions" />} title={t('extensions')} subtitle="Modules & fonctions" right={chev} onPress={() => router.push('/extensions')} />
        </GlassCard>
      ) : null}

      {/* Inviter des amis */}
      <GlassCard>
        <ListRow left={<Ico n="gift" />} title="Inviter des amis" subtitle="Partage ton code Nova" right={chev} onPress={() => router.push('/invite')} />
      </GlassCard>

      {/* Aide */}
      <GlassCard>
        <ListRow left={<Ico n="support" />} title={t('support')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico n="faq" />} title={t('faq')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico n="about" />} title={t('about')} subtitle={`Nova · v${Constants.expoConfig?.version ?? '0.0.1'}`} />
      </GlassCard>

      <ListRow left={<Ico n="reset" />} title={t('resetWallet')} right={<Icon name="chevron" size={18} color={colors.danger} />} onPress={onReset} />
    </PremiumScreen>
  );
}
