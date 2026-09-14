import { ScreenHeader, IconButton } from '../ui/kit';
import { ExplainSheet } from '../components/ai/ExplainSheet';
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Muted } from '../ui/components';
import { SearchBar, RemoteIcon } from '../ui/premium';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { listChains, chainIconUrl } from '../src';
import { useCustomChains, type CustomChainInput } from '../lib/customChainsStore';

export default function Networks() {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const addCustomChain = useCustomChains((s) => s.add);

  const showTestnets = useSettings((s) => s.showTestnets);
  const all = useMemo(() => listChains({ includeTestnets: showTestnets }), [showTestnets]);
  const [query, setQuery] = useState('');
  const [explain, setExplain] = useState<{ name: string; id: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<CustomChainInput>({ name: '', rpcUrl: '', evmChainId: 0, nativeSymbol: '', explorerUrl: '', testnet: false });
  const [formError, setFormError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolledOnce = useRef(false);

  const q = query.trim().toLowerCase();
  const chains = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.nativeSymbol.toLowerCase().includes(q))
    : all;
  // Séparation nette mainnet / testnet.
  const mainnets = chains.filter((c) => !c.testnet);
  const testnets = chains.filter((c) => c.testnet);

  const choose = (id: string) => {
    setActiveChain(id);
    router.back();
  };

  const saveCustomChain = () => {
    setFormError(null);
    const result = addCustomChain(form);
    if (!result.ok) {
      setFormError(result.error ?? t('errNetwork'));
      return;
    }
    const id = `custom-${form.evmChainId}`;
    setAddOpen(false);
    setForm({ name: '', rpcUrl: '', evmChainId: 0, nativeSymbol: '', explorerUrl: '', testnet: false });
    choose(id);
  };

  const renderChain = (c: (typeof chains)[number]) => {
    const active = c.id === activeChain;
    return (
      <Pressable
        key={c.id}
        onPress={() => choose(c.id)}
        onLayout={active ? (e) => onActiveLayout(e.nativeEvent.layout.y) : undefined}
      >
        <Card
          style={{
            borderColor: active ? colors.accent : colors.cardBorder,
            borderWidth: active ? 1.5 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), flex: 1 }}>
            <RemoteIcon uri={chainIconUrl(c.id)} label={c.name} size={36} />
            <View>
              <Text style={typography.body}>{c.name}</Text>
              <Muted>
                {c.nativeSymbol}
                {c.evmChainId ? ` · Chain ${c.evmChainId}` : ''}
                {c.testnet ? ` · ${t('testnet')}` : ''}
              </Muted>
            </View>
          </View>
          {/* Expliquer ce réseau (Copilot) — sans changer de réseau. */}
          <IconButton icon="sparkles" label={`Expliquer ${c.name}`} tone="ghost" onPress={() => setExplain({ name: c.name, id: c.id })} />
          {active ? <Text style={{ color: colors.text, fontSize: 18 }}>✓</Text> : null}
        </Card>
      </Pressable>
    );
  };

  // Réseau actif rendu visible à l'ouverture (scroll vers sa position, une fois).
  const onActiveLayout = (y: number) => {
    if (scrolledOnce.current || q) return;
    scrolledOnce.current = true;
    if (y > 220) setTimeout(() => scrollRef.current?.scrollTo({ y: y - 120, animated: false }), 0);
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('network')}
        right={<IconButton icon="add" label={t("addNetwork")} tone="ghost" onPress={() => { setFormError(null); setAddOpen(true); }} />}
      />
      <Muted>{t('sameAddressAllEvm')}</Muted>

      {all.length > 6 ? (
        <View style={{ marginTop: spacing(1) }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('searchNetwork')} />
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, marginTop: spacing(1) }}
        contentContainerStyle={{ gap: spacing(1.5), paddingBottom: insets.bottom + spacing(6) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {chains.length === 0 ? (
          <Card>
            <Muted>{t('noNetworkMatch').replace('{q}', query)}</Muted>
          </Card>
        ) : (
          <>
            {/* Section principale (mainnet) */}
            {mainnets.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <View style={{ width: 3, height: 15, borderRadius: 2, backgroundColor: colors.accent }} />
                <Text style={typography.section}>{t('mainNetworks')}</Text>
              </View>
            ) : null}
            {mainnets.map((c) => renderChain(c))}

            {/* Section testnet, nettement séparée */}
            {testnets.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: spacing(2) }}>
                <View style={{ width: 3, height: 15, borderRadius: 2, backgroundColor: colors.warning }} />
                <Text style={typography.section}>{t('testNetworks')}</Text>
                <View style={{ backgroundColor: colors.warning + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: colors.warning, fontSize: 10, fontFamily: fonts.bold }}>{t('noRealFunds')}</Text>
                </View>
              </View>
            ) : null}
            {testnets.map((c) => renderChain(c))}
          </>
        )}
        <Pressable
          onPress={() => { setFormError(null); setAddOpen(true); }}
          style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: spacing(2) }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{t("addCustomNetwork")}</Text>
        </Pressable>
      </ScrollView>
      <ExplainSheet visible={!!explain} onClose={() => setExplain(null)} subject={explain ? { kind: 'network', name: explain.name, logo: chainIconUrl(explain.id), seed: explain.id } : null} />
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing(2.5), gap: spacing(1.25) }}>
            <Text style={typography.section}>{t("addNetwork")}</Text>
            {([
              ['name', t("networkName"), 'Arbitrum Sepolia'],
              ['rpcUrl', t("rpcUrl"), 'https://…'],
              ['evmChainId', 'Chain ID', '421614'],
              ['nativeSymbol', t("currencySymbol"), 'ETH'],
              ['explorerUrl', t("blockExplorer"), 'https://…'],
            ] as const).map(([key, label, placeholder]) => (
              <View key={key} style={{ gap: 4 }}>
                <Text style={typography.muted}>{label}</Text>
                <TextInput
                  value={String(form[key] ?? '')}
                  onChangeText={(value) => setForm((current) => ({ ...current, [key]: key === 'evmChainId' ? Number(value.replace(/\D/g, '')) : value }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  keyboardType={key === 'evmChainId' ? 'number-pad' : 'default'}
                  autoCapitalize="none"
                  style={{ color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
                />
              </View>
            ))}
            <Pressable
              onPress={() => setForm((current) => ({ ...current, testnet: !current.testnet }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.testnet === true }}
            >
              <Text style={{ color: form.testnet ? colors.warning : colors.textMuted, fontSize: 18 }}>{form.testnet ? '☑' : '☐'}</Text>
              <Text style={typography.body}>{t("testNetwork")}</Text>
            </Pressable>
            {formError ? <Text style={{ color: colors.danger }}>{formError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: spacing(1) }}>
              <Pressable onPress={() => setAddOpen(false)} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}><Text style={typography.body}>{t("cancel")}</Text></Pressable>
              <Pressable onPress={saveCustomChain} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent }}><Text style={{ color: colors.onPrimary, fontWeight: '600' }}>{t("saveNetwork")}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
