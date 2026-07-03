import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import Constants from 'expo-constants';
import {
  PremiumScreen,
  GlassCard,
  ListRow,
  Chip,
  SegmentedTabs,
  GradientAvatar,
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { colors, spacing, typography } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';

function Ico({ e }: { e: string }) {
  return <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{e}</Text>;
}
const chev = <Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>;

export default function Menu() {
  const t = useT();
  const { profileName, uiMode, setUiMode } = useSettings();
  const reset = useWallet((s) => s.reset);
  const expert = uiMode === 'expert';
  const soon = () => Alert.alert(t('soon'));
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
        <ListRow left={<Ico e="💼" />} title="Mes wallets" subtitle="Gérer plusieurs portefeuilles" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="📥" />} title="Importer un wallet" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="✨" />} title="Créer un wallet" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="🔒" />} title="Ledger" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="🔐" />} title="Trezor" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="🔗" />} title="WalletConnect" right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="🌐" />} title="dApps" right={soonChip} onPress={soon} />
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
        <ListRow left={<Ico e="💳" />} title={t('accounts')} right={chev} onPress={() => router.push('/accounts')} />
        <ListRow divider left={<Ico e="🌐" />} title={t('networks')} right={chev} onPress={() => router.push('/networks')} />
        <ListRow divider left={<Ico e="🔗" />} title={t('connectedApps')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="📒" />} title={t('contacts')} right={soonChip} onPress={soon} />
      </GlassCard>

      {/* Préférences */}
      <GlassCard>
        <ListRow left={<Ico e="🌍" />} title={t('language')} right={chev} onPress={() => router.push('/language')} />
        <ListRow divider left={<Ico e="💱" />} title={t('currency')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico e="🎨" />} title={t('appearance')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="🔔" />} title={t('notifications')} right={soonChip} onPress={soon} />
      </GlassCard>

      {/* Sécurité */}
      <GlassCard>
        <ListRow left={<Ico e="🔐" />} title={t('security')} right={chev} onPress={() => router.push('/settings')} />
        <ListRow divider left={<Ico e="🔑" />} title={t('changePin')} right={chev} onPress={() => router.push('/change-pin')} />
        <ListRow divider left={<Ico e="📜" />} title={t('revealPhrase')} right={chev} onPress={() => router.push('/reveal-phrase')} />
      </GlassCard>

      {/* Avancé (mode expert) */}
      {expert ? (
        <GlassCard>
          <ListRow left={<Ico e="🛠️" />} title={t('developer')} subtitle="RPC custom, logs, signatures" right={soonChip} onPress={soon} />
          <ListRow divider left={<Ico e="🧩" />} title={t('extensions')} right={soonChip} onPress={soon} />
        </GlassCard>
      ) : null}

      {/* Aide */}
      <GlassCard>
        <ListRow left={<Ico e="💬" />} title={t('support')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="❓" />} title={t('faq')} right={soonChip} onPress={soon} />
        <ListRow divider left={<Ico e="ℹ️" />} title={t('about')} subtitle={`Nova · v${Constants.expoConfig?.version ?? '0.0.1'}`} />
      </GlassCard>

      <ListRow left={<Ico e="⚠️" />} title={t('resetWallet')} right={<Text style={{ color: colors.danger }}>›</Text>} onPress={onReset} />
    </PremiumScreen>
  );
}
