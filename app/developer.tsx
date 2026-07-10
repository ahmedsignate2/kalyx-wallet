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
import { useSettings } from '../lib/settingsStore';
import { useNotifCenter } from '../lib/notificationCenter';
import { toast } from '../lib/toast';

/** Services configurés (clé présente ou non — jamais la valeur). */
const SERVICES: { name: string; present: boolean }[] = [
  { name: 'Alchemy (RPC/tokens/NFT)', present: !!process.env.EXPO_PUBLIC_ALCHEMY_KEY },
  { name: 'Etherscan (historique)', present: !!process.env.EXPO_PUBLIC_ETHERSCAN_KEY },
  { name: 'CoinGecko (prix)', present: !!process.env.EXPO_PUBLIC_COINGECKO_KEY },
  { name: 'LI.FI (swap/bridge)', present: !!process.env.EXPO_PUBLIC_LIFI_KEY },
  { name: 'WalletConnect', present: !!process.env.EXPO_PUBLIC_WALLETCONNECT_ID },
];

export default function Developer() {
  const { colors, typography } = useTheme();
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
    if (!res.ok) { setError(res.error ?? 'Échec'); return; }
    toast.success('Réseau ajouté', form.name);
    setForm({ name: '', evmChainId: 0, nativeSymbol: '', rpcUrl: '', explorerUrl: '' });
    setChainIdStr('');
  };

  // Sauvegarde portable : partage la liste des réseaux perso (JSON, non sensible).
  const onExport = async () => {
    if (chains.length === 0) { toast.info('Aucun réseau à sauvegarder'); return; }
    try {
      await Share.share({ message: exportBackup() });
    } catch { /* partage annulé */ }
  };

  // Restauration : lit la sauvegarde collée dans le presse-papier.
  const onImport = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text?.trim()) { toast.info('Presse-papier vide', 'Copie d’abord ta sauvegarde de réseaux.'); return; }
    const res = importBackup(text);
    if (!res.ok) { toast.error('Restauration impossible', res.error); return; }
    if (res.added === 0) { toast.info('Rien à restaurer', 'Ces réseaux sont déjà présents.'); return; }
    toast.success(`${res.added} réseau${res.added > 1 ? 'x' : ''} restauré${res.added > 1 ? 's' : ''}`, res.skipped ? `${res.skipped} déjà présent${res.skipped > 1 ? 's' : ''}` : undefined);
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
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Développeur' }} />
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Infos build */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>Application</Text>
          <GlassCard>
            <Row label="Version" value={`v${Constants.expoConfig?.version ?? '0.0.1'}`} colors={colors} typography={typography} />
            <Row label="Environnement" value={__DEV__ ? 'Développement' : 'Production'} colors={colors} typography={typography} divider />
          </GlassCard>
        </View>

        {/* Réseaux de test (séparés du mainnet) */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>Réseaux de test</Text>
          <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="networks" size={20} color={showTestnets ? colors.warning : colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>Activer les testnets / devnets</Text>
              <Text style={typography.muted}>Affiche Sepolia, Monad… séparés du mainnet. Pour développeurs uniquement (aucun fonds réel).</Text>
            </View>
            <Switch value={showTestnets} onValueChange={(v) => setFlag('showTestnets', v)} />
          </GlassCard>
        </View>

        {/* Services */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>Services configurés</Text>
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
          <Text style={typography.section}>Réseaux personnalisés (RPC)</Text>
          {chains.length > 0 ? (
            <GlassCard>
              {chains.map((c, i) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{c.name}</Text>
                    <Text style={typography.muted}>Chain {c.evmChainId} · {c.nativeSymbol}</Text>
                  </View>
                  <Pressable onPress={() => removeChain(c.id)} hitSlop={8}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>Retirer</Text>
                  </Pressable>
                </View>
              ))}
            </GlassCard>
          ) : null}
          <GlassCard style={{ gap: spacing(1) }}>
            {input(form.name, (v) => setForm({ ...form, name: v }), 'Nom (ex. Mon réseau)')}
            {input(chainIdStr, setChainIdStr, 'Chain ID (ex. 1337)', 'number-pad')}
            {input(form.nativeSymbol, (v) => setForm({ ...form, nativeSymbol: v }), 'Symbole (ex. ETH)')}
            {input(form.rpcUrl, (v) => setForm({ ...form, rpcUrl: v }), 'RPC https://…', 'url')}
            {input(form.explorerUrl ?? '', (v) => setForm({ ...form, explorerUrl: v }), 'Explorateur (optionnel)', 'url')}
            {error ? <ErrorBox message={error} /> : null}
            <Button label="Ajouter le réseau" onPress={onAdd} />
          </GlassCard>

          {/* Sauvegarde portable des réseaux (survit à une réinstallation) */}
          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>
            Tes réseaux perso ne sont pas liés à ta phrase secrète. Sauvegarde-les
            pour les retrouver après une réinstallation (les fonds restent on-chain).
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
            <Pressable onPress={onExport} style={{ flex: 1 }}>
              <GlassCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="share" size={17} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Sauvegarder</Text>
              </GlassCard>
            </Pressable>
            <Pressable onPress={onImport} style={{ flex: 1 }}>
              <GlassCard style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1) }}>
                <Icon name="copy" size={17} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Restaurer</Text>
              </GlassCard>
            </Pressable>
          </View>
        </View>

        {/* Maintenance */}
        <View style={{ gap: spacing(1) }}>
          <Text style={typography.section}>Maintenance</Text>
          <Pressable onPress={() => { clearNotifs(); toast.info('Centre de notifications vidé'); }}>
            <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <Icon name="refresh" size={18} color={colors.textMuted} />
              <Text style={typography.body}>Vider le centre de notifications</Text>
            </GlassCard>
          </Pressable>
        </View>
      </ScrollView>
    </PremiumScreen>
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
