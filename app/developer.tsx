import { NovaCard, NovaHero, NovaSwitch, SectionLabel, SettingRow } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { probeRpcChainId } from '../src/domain/chains/customNetworks';
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Share, Switch, Platform } from 'react-native';
import { usePortfolioDiag, diagText } from '../lib/portfolio/diagnostics';
import * as Clipboard from 'expo-clipboard';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useCustomChains, type CustomChainInput } from '../lib/customChainsStore';
import { useSettings, useT } from '../lib/settingsStore';
import { useNotifCenter } from '../lib/notificationCenter';
import { toast } from '../lib/toast';

export default function Developer() {
  const diag = usePortfolioDiag((s) => s.last);
  const { colors, typography } = useTheme();
  const t = useT();
  // Services configurés (clé présente ou non — jamais la valeur).
  const SERVICES: { name: string; present: boolean }[] = [
    { name: t('svcAlchemy'), present: !!process.env.EXPO_PUBLIC_ALCHEMY_KEY },
    { name: t('svcEtherscan'), present: !!process.env.EXPO_PUBLIC_ETHERSCAN_KEY },
    { name: t('svcCoingecko'), present: !!process.env.EXPO_PUBLIC_COINGECKO_KEY },
    { name: t('svcLifi'), present: !!process.env.EXPO_PUBLIC_LIFI_KEY },
    { name: 'WalletConnect', present: !!process.env.EXPO_PUBLIC_WALLETCONNECT_ID },
  ];
  const chains = useCustomChains((s) => s.chains);
  const addChain = useCustomChains((s) => s.add);
  const removeChain = useCustomChains((s) => s.remove);
  const exportBackup = useCustomChains((s) => s.exportBackup);
  const importBackup = useCustomChains((s) => s.importBackup);
  const clearNotifs = useNotifCenter((s) => s.clear);
  const showTestnets = useSettings((s) => s.showTestnets);
  const setFlag = useSettings((s) => s.setFlag);

  const [form, setForm] = useState<CustomChainInput>({ name: '', evmChainId: 0, nativeSymbol: '', rpcUrl: '', explorerUrl: '' });
  const [chainIdStr, setChainIdStr] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const onAdd = async () => {
    setError(null);
    const want = Number(chainIdStr);
    const input = { ...form, evmChainId: want };
    // Contrôles de forme d'abord (sans réseau), puis le Chain ID RÉEL du RPC.
    if (/^https:\/\//i.test(form.rpcUrl.trim()) && Number.isInteger(want) && want > 0) {
      setChecking(true);
      const got = await probeRpcChainId(form.rpcUrl.trim());
      setChecking(false);
      if (got === null) { setError(t('netErrUnreachable')); return; }
      if (got !== want) { setError(t('netErrMismatch').replace('{got}', String(got)).replace('{want}', String(want))); return; }
    }
    const res = addChain(input);
    if (!res.ok) { setError(res.error ? t(res.error as never).replace('{name}', res.detail ?? '') : t('failed')); return; }
    toast.success(t('networkAdded'), form.name);
    setForm({ name: '', evmChainId: 0, nativeSymbol: '', rpcUrl: '', explorerUrl: '' });
    setChainIdStr('');
  };

  // Sauvegarde portable : partage la liste des réseaux perso (JSON, non sensible).
  const onExport = async () => {
    if (chains.length === 0) { toast.info(t('noNetworkToBackup')); return; }
    try {
      await Share.share({ message: exportBackup() });
    } catch { /* partage annulé */ }
  };

  // Restauration : lit la sauvegarde collée dans le presse-papier.
  const onImport = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text?.trim()) { toast.info(t('clipboardEmpty'), t('copyBackupFirst')); return; }
    const res = importBackup(text);
    if (!res.ok) { toast.error(t('restoreFailed'), t('invalidBackup')); return; } // message du domaine en français : jamais affiché tel quel
    if (res.added === 0) { toast.info(t('nothingToRestore'), t('networksAlreadyPresent')); return; }
    toast.success(`${res.added} ${t('networksRestoredWord')}`, res.skipped ? `${res.skipped} ${t('alreadyPresentWord')}` : undefined);
  };

  const input = (v: string, on: (t: string) => void, ph: string, kbd?: 'default' | 'number-pad' | 'url') => (
    <TextInput
      value={v}
      onChangeText={on}
      placeholder={ph}
      placeholderTextColor={colors.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={kbd ?? 'default'}
      style={{ color: colors.text, fontSize: 15, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing(1.5), paddingVertical: spacing(1.25) }}
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="developer" title={t('developer')} subtitle={t('developerSub')} />
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Infos build */}
        <View style={{ gap: spacing(1) }}>
          {/* Journal de diagnostic : tout ce que l'app a fait (lib/debugJournal.ts). */}
          <NovaCard delay={100}>
            <SettingRow icon="history" tone="gold" title={t('journalTitle')} onPress={() => router.push('/journal')} />
          </NovaCard>
          <SectionLabel>{t('appSection')}</SectionLabel>
          <NovaCard>
            <Row label={t('versionWord')} value={`v${Constants.expoConfig?.version ?? '0.0.1'}`} colors={colors} typography={typography} />
            <Row label={t('environment')} value={__DEV__ ? t('developmentEnv') : t('productionEnv')} colors={colors} typography={typography} divider />
          </NovaCard>
        </View>

        {/* Dernier chargement des soldes, réseau par réseau : l'erreur RÉELLE de l'appareil. */}
        <View style={{ gap: spacing(1) }}>
          <SectionLabel>{t('diagBalances')}</SectionLabel>
          <NovaCard>
            <Text selectable style={[typography.muted, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 }]}>
              {diag ? diagText(diag) : t('diagNone')}
            </Text>
          </NovaCard>
          {diag ? <Button label={t('diagShare')} variant="ghost" onPress={() => void Share.share({ message: diagText(diag) })} /> : null}
        </View>

        {/* Réseaux de test (séparés du mainnet) */}
        <View style={{ gap: spacing(1) }}>
          <SectionLabel>{t('testNetworks')}</SectionLabel>
          <NovaCard>
            <SettingRow icon="networks" title={t('enableTestnets')} hint={t('testnetsHint')} right={<NovaSwitch value={showTestnets} onValueChange={(v) => setFlag('showTestnets', v)} />} />
          </NovaCard>
        </View>

        {/* Services */}
        <View style={{ gap: spacing(1) }}>
          <SectionLabel>{t('configuredServices')}</SectionLabel>
          <NovaCard>
            {SERVICES.map((s, i) => (
              <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={typography.body}>{s.name}</Text>
                <Icon name={s.present ? 'check' : 'close'} size={17} color={s.present ? colors.up : colors.danger} />
              </View>
            ))}
          </NovaCard>
        </View>

        {/* Réseaux personnalisés */}
        <View style={{ gap: spacing(1) }}>
          <SectionLabel>{t('customNetworks')}</SectionLabel>
          {chains.length > 0 ? (
            <NovaCard>
              {chains.map((c, i) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{c.name}</Text>
                    <Text style={typography.muted}>{t('chainWord')} {c.evmChainId} · {c.nativeSymbol}</Text>
                  </View>
                  <KPressable onPress={() => removeChain(c.id)} hitSlop={8}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('removeWord')}</Text>
                  </KPressable>
                </View>
              ))}
            </NovaCard>
          ) : null}
          <NovaCard style={{ gap: spacing(1) }}>
            {input(form.name, (v) => setForm({ ...form, name: v }), t('networkNamePh'))}
            {input(chainIdStr, setChainIdStr, t('chainIdPh'), 'number-pad')}
            {input(form.nativeSymbol, (v) => setForm({ ...form, nativeSymbol: v }), t('symbolPh'))}
            {input(form.rpcUrl, (v) => setForm({ ...form, rpcUrl: v }), t('rpcPh'), 'url')}
            {input(form.explorerUrl ?? '', (v) => setForm({ ...form, explorerUrl: v }), t('explorerPh'), 'url')}
            {error ? <ErrorBox message={error} /> : null}
            <Button label={t('addNetwork')} onPress={() => void onAdd()} loading={checking} />
          </NovaCard>

          {/* Sauvegarde portable des réseaux (survit à une réinstallation) */}
          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{t('customNetworksNote')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
            <KPressable onPress={onExport} style={{ flex: 1 }}>
              <NovaCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="share" size={17} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: fonts.semibold }}>{t('backupWord')}</Text>
              </NovaCard>
            </KPressable>
            <KPressable onPress={onImport} style={{ flex: 1 }}>
              <NovaCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="copy" size={17} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: fonts.semibold }}>{t('restoreWord')}</Text>
              </NovaCard>
            </KPressable>
          </View>
        </View>

        {/* Maintenance */}
        <View style={{ gap: spacing(1) }}>
          <SectionLabel>{t('maintenance')}</SectionLabel>
          <NovaCard>
            <SettingRow icon="refresh" title={t('clearNotifCenter')} onPress={() => { clearNotifs(); toast.info(t('notifCenterCleared')); }} />
          </NovaCard>
        </View>
      </ScrollView>
    </PremiumScreen>
    </>
  );
}

function Row({ label, value, divider, colors, typography }: { label: string; value: string; divider?: boolean; colors: ReturnType<typeof useTheme>['colors']; typography: ReturnType<typeof useTheme>['typography'] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{value}</Text>
    </View>
  );
}
