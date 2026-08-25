import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Share, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
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

  const onAdd = () => {
    setError(null);
    const res = addChain({ ...form, evmChainId: Number(chainIdStr) });
    if (!res.ok) { setError(res.error ?? t('failed')); return; }
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
    if (!res.ok) { toast.error(t('restoreFailed'), res.error); return; }
    if (res.added === 0) { toast.info(t('nothingToRestore'), t('networksAlreadyPresent')); return; }
    toast.success(`${res.added} ${t('networksRestoredWord')}`, res.skipped ? `${res.skipped} ${t('alreadyPresentWord')}` : undefined);
  };

  const input = (v: string, on: (t: string) => void, ph: string, kbd?: 'default' | 'number-pad' | 'url') => (
    <TextInput
      value={v}
      onChangeText={on}
      placeholder={ph}
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={kbd ?? 'default'}
      style={{ color: colors.text, fontSize: 15, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 12, paddingHorizontal: spacing(1.5), paddingVertical: spacing(1.25) }}
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('developer') }} />
      <PremiumScreen>
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Infos build */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>{t('appSection')}</Text>
          <GlassCard>
            <Row label={t('versionWord')} value={`v${Constants.expoConfig?.version ?? '0.0.1'}`} colors={colors} typography={typography} />
            <Row label={t('environment')} value={__DEV__ ? t('developmentEnv') : t('productionEnv')} colors={colors} typography={typography} divider />
          </GlassCard>
        </View>

        {/* Réseaux de test (séparés du mainnet) */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>{t('testNetworks')}</Text>
          <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="networks" size={20} color={showTestnets ? colors.warning : colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{t('enableTestnets')}</Text>
              <Text style={typography.muted}>{t('testnetsHint')}</Text>
            </View>
            <Switch value={showTestnets} onValueChange={(v) => setFlag('showTestnets', v)} />
          </GlassCard>
        </View>

        {/* Services */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>{t('configuredServices')}</Text>
          <GlassCard>
            {SERVICES.map((s, i) => (
              <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                <Text style={typography.body}>{s.name}</Text>
                <Icon name={s.present ? 'check' : 'close'} size={17} color={s.present ? colors.up : colors.danger} />
              </View>
            ))}
          </GlassCard>
        </View>

        {/* Réseaux personnalisés */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>{t('customNetworks')}</Text>
          {chains.length > 0 ? (
            <GlassCard>
              {chains.map((c, i) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{c.name}</Text>
                    <Text style={typography.muted}>{t('chainWord')} {c.evmChainId} · {c.nativeSymbol}</Text>
                  </View>
                  <Pressable onPress={() => removeChain(c.id)} hitSlop={8}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('removeWord')}</Text>
                  </Pressable>
                </View>
              ))}
            </GlassCard>
          ) : null}
          <GlassCard style={{ gap: spacing(1) }}>
            {input(form.name, (v) => setForm({ ...form, name: v }), t('networkNamePh'))}
            {input(chainIdStr, setChainIdStr, t('chainIdPh'), 'number-pad')}
            {input(form.nativeSymbol, (v) => setForm({ ...form, nativeSymbol: v }), t('symbolPh'))}
            {input(form.rpcUrl, (v) => setForm({ ...form, rpcUrl: v }), t('rpcPh'), 'url')}
            {input(form.explorerUrl ?? '', (v) => setForm({ ...form, explorerUrl: v }), t('explorerPh'), 'url')}
            {error ? <ErrorBox message={error} /> : null}
            <Button label={t('addNetwork')} onPress={onAdd} />
          </GlassCard>

          {/* Sauvegarde portable des réseaux (survit à une réinstallation) */}
          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{t('customNetworksNote')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
            <Pressable onPress={onExport} style={{ flex: 1 }}>
              <GlassCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="share" size={17} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('backupWord')}</Text>
              </GlassCard>
            </Pressable>
            <Pressable onPress={onImport} style={{ flex: 1 }}>
              <GlassCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="copy" size={17} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('restoreWord')}</Text>
              </GlassCard>
            </Pressable>
          </View>
        </View>

        {/* Maintenance */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>{t('maintenance')}</Text>
          <Pressable onPress={() => { clearNotifs(); toast.info(t('notifCenterCleared')); }}>
            <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <Icon name="refresh" size={18} color={colors.textMuted} />
              <Text style={typography.body}>{t('clearNotifCenter')}</Text>
            </GlassCard>
          </Pressable>
        </View>
      </ScrollView>
    </PremiumScreen>
    </>
  );
}

function Row({ label, value, divider, colors, typography }: { label: string; value: string; divider?: boolean; colors: ReturnType<typeof useTheme>['colors']; typography: ReturnType<typeof useTheme>['typography'] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: divider ? 1 : 0, borderTopColor: colors.glassBorder }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: colors.text, fontFamily: 'Inter_500Medium' }}>{value}</Text>
    </View>
  );
}
