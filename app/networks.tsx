import { NovaHero, Pills, Pulse, SectionLabel } from '../ui/nova';
import { fill } from '../lib/i18n';
import { ScreenHeader, IconButton, Pressable as KPressable, Button, Checkbox, SegmentedControl, Text as KText } from '../ui/kit';
import { SafeModal } from '../ui/kit/SafeModal';
import { ExplainSheet } from '../components/ai/ExplainSheet';
import React, { useMemo, useRef, useState } from 'react';
import { probeRpcChainId } from '../src/domain/chains/customNetworks';
import { View, Text, ScrollView, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Muted } from '../ui/components';
import { SearchBar, RemoteIcon } from '../ui/premium';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { listChains, chainIconUrl, customChainId, CUSTOM_FAMILIES, DEFAULT_DECIMALS, type ChainFamily } from '../src';

/** Libellés des familles : noms propres, donc non traduits. */
const FAMILY_LABELS: Record<ChainFamily, string> = { evm: 'EVM', bitcoin: 'Bitcoin', solana: 'Solana', ton: 'TON' };

/**
 * Familles présentées en onglets, dans cet ordre.
 *
 * La liste était PLATE : tous les réseaux les uns après les autres, mainnets puis
 * testnets, sans rien qui regroupe. Passé une dizaine d'entrées, on ne cherche
 * plus, on défile. Les quatre familles sont donc des onglets, comme sur l'écran
 * Recevoir, et chacun ne montre que ses réseaux.
 *
 * TON y figure même sans réseau configuré, et c'est délibéré : son absence est une
 * information, et l'onglet le DIT au lieu de laisser croire à un oubli.
 */
const FAMILY_TABS: ChainFamily[] = ['evm', 'bitcoin', 'solana', 'ton'];

/** Symbole suggéré par famille, pour ne pas laisser le champ vide. */
const DEFAULT_SYMBOLS: Record<ChainFamily, string> = { evm: 'ETH', bitcoin: 'BTC', solana: 'SOL', ton: 'TON' };
import { useCustomChains, type CustomChainInput } from '../lib/customChainsStore';
import { space, radius } from '../ui/tokens';
import { Icon } from '../ui/icon';

export default function Networks() {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const addCustomChain = useCustomChains((s) => s.add);

  const showTestnets = useSettings((s) => s.showTestnets);
  const setFlag = useSettings((s) => s.setFlag);
  const all = useMemo(() => listChains({ includeTestnets: showTestnets }), [showTestnets]);
  const [query, setQuery] = useState('');
  const [explain, setExplain] = useState<{ name: string; id: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const EMPTY_FORM: CustomChainInput = {
    name: '',
    family: 'evm',
    rpcUrl: '',
    evmChainId: 0,
    nativeSymbol: '',
    nativeDecimals: DEFAULT_DECIMALS.evm,
    explorerUrl: '',
    testnet: false,
  };
  const [form, setForm] = useState<CustomChainInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolledOnce = useRef(false);

  const q = query.trim().toLowerCase();
  /*
   * Onglet ouvert sur la famille du réseau ACTIF : on arrive sur cet écran pour
   * changer de réseau, pas pour changer de chaîne — commencer ailleurs obligerait
   * à revenir sur ses pas.
   */
  const [family, setFamily] = useState<ChainFamily>(
    () => (listChains({ includeTestnets: true }).find((c) => c.id === activeChain)?.family ?? 'evm') as ChainFamily,
  );
  /*
   * UNE RECHERCHE IGNORE L'ONGLET. Chercher veut dire « trouve-le où qu'il soit » ;
   * filtrer en plus sur la famille rendrait invisible un réseau dont on vient de
   * taper le nom exact.
   */
  const chains = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.nativeSymbol.toLowerCase().includes(q))
    : all.filter((c) => c.family === family);
  // Séparation nette mainnet / testnet.
  const mainnets = chains.filter((c) => !c.testnet);
  const testnets = chains.filter((c) => c.testnet);

  const choose = (id: string) => {
    setActiveChain(id);
    router.back();
  };

  const [probing, setProbing] = useState(false);
  /** Formulaire fermé pendant la vérification : son résultat est ignoré (aucun ajout, aucune bascule). */
  const addGen = useRef(0);
  const closeAdd = () => {
    addGen.current += 1;
    setProbing(false);
    setAddOpen(false);
  };
  const saveCustomChain = async () => {
    if (probing) return;
    const gen = addGen.current;
    setFormError(null);
    /*
     * Même contrôle que l'écran Développeur : le Chain ID RÉEL du RPC. Un RPC
     * mal saisi dont le réseau diffère était accepté ici, et les transactions
     * étaient ensuite signées pour un autre réseau que celui du nœud.
     */
    if ((form.family ?? 'evm') === 'evm' && /^https:\/\//i.test(form.rpcUrl.trim()) && Number.isInteger(form.evmChainId) && form.evmChainId > 0) {
      setProbing(true);
      const got = await probeRpcChainId(form.rpcUrl.trim()).finally(() => setProbing(false));
      if (gen !== addGen.current) return; // annulé entre-temps
      if (got === null) return setFormError(t('netErrUnreachable'));
      if (got !== form.evmChainId) return setFormError(t('netErrMismatch').replace('{got}', String(got)).replace('{want}', String(form.evmChainId)));
    }
    const result = addCustomChain(form);
    if (!result.ok) {
      // Le refus est une CLÉ de traduction (et `detail` nomme le réseau intégré en conflit).
      setFormError(result.error ? t(result.error as never).replace('{name}', result.detail ?? '') : t('errNetwork'));
      return;
    }
    const family = form.family ?? 'evm';
    const id = customChainId(family, family === 'evm' ? form.evmChainId : undefined, form.name.trim());
    setAddOpen(false);
    setForm(EMPTY_FORM);
    choose(id);
  };

  const renderChain = (c: (typeof chains)[number]) => {
    const active = c.id === activeChain;
    return (
      <KPressable
        key={c.id}
        onPress={() => choose(c.id)}
        onLayout={active ? (e) => onActiveLayout(e.nativeEvent.layout.y) : undefined}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={c.name}
      >
        <Card
          style={{
            borderColor: active ? 'rgba(221,181,101,0.45)' : colors.border,
            borderRadius: 22,
            paddingVertical: spacing(1.75),
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
          <IconButton icon="sparkles" label={fill(t('a11yExplainThing'), { name: c.name })} tone="ghost" onPress={() => setExplain({ name: c.name, id: c.id })} />
          {/* Icône du kit : le glyphe texte « ✓ » rendait différemment selon la police. */}
          {active ? <Pulse size={8} /> : null}
        </Card>
      </KPressable>
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
        right={<IconButton icon="add" label={t("addNetwork")} tone="ghost" onPress={() => { setFormError(null); setAddOpen(true); }} />}
      />
      <NovaHero icon="networks" title={t('network')} subtitle={t('sameAddressAllEvm')} />

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
        {/*
          LES QUATRE FAMILLES EN ONGLETS, toujours visibles hors recherche — y
          compris quand la famille choisie n'a aucun réseau, sinon on ne pourrait
          plus en sortir. Masquées pendant une recherche : celle-ci porte sur
          tout, les afficher suggérerait le contraire.
        */}
        {!q ? (
          <Pills
            items={FAMILY_TABS.map((f) => ({ key: f, label: FAMILY_LABELS[f] }))}
            value={family}
            onChange={(next) => setFamily(next as ChainFamily)}
          />
        ) : null}

        {chains.length === 0 ? (
          /*
            TROIS VIDES DIFFÉRENTS. Une recherche sans résultat n'est pas une
            famille sans réseau, et TON mérite qu'on dise où en est le travail
            plutôt qu'un onglet muet — un vide ne se distingue pas d'un bogue.
          */
          q ? (
            <Card>
              <Muted>{t('noNetworkMatch').replace('{q}', query)}</Muted>
            </Card>
          ) : family === 'ton' ? (
            /*
              TON n'existe que sur le réseau de test pour l'instant : un onglet
              vide ne dirait pas pourquoi. On l'explique, et on offre le réglage
              ici même plutôt que d'envoyer l'utilisateur le chercher.
            */
            <Card style={{ gap: spacing(1) }}>
              <Text style={typography.section}>{t('tonTestnetTitle')}</Text>
              <Text style={typography.muted}>{t('tonTestnetBody')}</Text>
              {!showTestnets ? (
                <Button label={t('showTestnetsAction')} variant="secondary" onPress={() => setFlag('showTestnets', true)} />
              ) : null}
            </Card>
          ) : (
            <Card>
              <Muted>{t('noNetworkMatch').replace('{q}', FAMILY_LABELS[family])}</Muted>
            </Card>
          )
        ) : (
          <>
            {/* Section principale (mainnet) */}
            {mainnets.length > 0 ? (
              <SectionLabel>{t('mainNetworks')}</SectionLabel>
            ) : null}
            {mainnets.map((c) => renderChain(c))}

            {/* Section testnet, nettement séparée */}
            {testnets.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: spacing(2) }}>
                <SectionLabel>{t('testNetworks')}</SectionLabel>
                <View style={{ backgroundColor: colors.warning + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: colors.warning, fontSize: 10, fontFamily: fonts.bold }}>{t('noRealFunds')}</Text>
                </View>
              </View>
            ) : null}
            {testnets.map((c) => renderChain(c))}
          </>
        )}
        <View style={{ marginTop: spacing(2) }}>
          <Button label={t('addCustomNetwork')} variant="secondary" onPress={() => { setFormError(null); setAddOpen(true); }} />
        </View>
      </ScrollView>
      <ExplainSheet visible={!!explain} onClose={() => setExplain(null)} subject={explain ? { kind: 'network', name: explain.name, logo: chainIconUrl(explain.id), seed: explain.id } : null} />
      <SafeModal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing(2.5), gap: spacing(1.25) }}>
            <Text style={typography.section}>{t("addNetwork")}</Text>
            {/*
              La FAMILLE d'abord : elle décide des champs suivants. Sans ce
              choix, seuls les réseaux EVM étaient ajoutables — donc pas moyen de
              mettre son propre RPC Solana, alors que l'endpoint public est
              précisément le goulot d'étranglement de cette chaîne.
            */}
            <View style={{ gap: 4 }}>
              <Text style={typography.muted}>{t('networkFamily')}</Text>
              <SegmentedControl
                items={CUSTOM_FAMILIES.map((f) => ({ key: f, label: FAMILY_LABELS[f] }))}
                value={form.family ?? 'evm'}
                onChange={(family) =>
                  setForm((current) => ({
                    ...current,
                    family,
                    // Les décimales suivent la famille tant que l'utilisateur n'y
                    // a pas touché : 8 pour Bitcoin, 9 pour Solana, 18 pour l'EVM.
                    nativeDecimals: DEFAULT_DECIMALS[family],
                    nativeSymbol: current.nativeSymbol || DEFAULT_SYMBOLS[family],
                  }))
                }
              />
            </View>
            {(
              [
                ['name', t('networkName'), form.family === 'solana' ? 'Solana (mon RPC)' : 'Arbitrum Sepolia'],
                ['rpcUrl', t('rpcUrl'), 'https://…'],
                // Le Chain ID n'existe que sur l'EVM : l'afficher ailleurs
                // demanderait à l'utilisateur d'inventer une valeur.
                ...(form.family === 'evm' ? [['evmChainId', 'Chain ID', '421614'] as const] : []),
                ['nativeSymbol', t('currencySymbol'), DEFAULT_SYMBOLS[form.family ?? 'evm']],
                ['nativeDecimals', t('nativeDecimals'), String(DEFAULT_DECIMALS[form.family ?? 'evm'])],
                ['explorerUrl', t('blockExplorer'), 'https://…'],
              ] as const
            ).map(([key, label, placeholder]) => {
              const numeric = key === 'evmChainId' || key === 'nativeDecimals';
              return (
                <View key={key} style={{ gap: 4 }}>
                  <Text style={typography.muted}>{label}</Text>
                  <TextInput
                    value={String(form[key] ?? '')}
                    onChangeText={(value) =>
                      setForm((current) => ({
                        ...current,
                        [key]: numeric ? Number(value.replace(/\D/g, '')) : value,
                      }))
                    }
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType={numeric ? 'number-pad' : key === 'rpcUrl' || key === 'explorerUrl' ? 'url' : 'default'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
                  />
                </View>
              );
            })}
            <View style={{ paddingVertical: space[1] }}>
              <Checkbox
                checked={form.testnet === true}
                onChange={(next) => setForm((current) => ({ ...current, testnet: next }))}
                label={<KText variant="body">{t('testNetwork')}</KText>}
              />
            </View>
            {formError ? <Text style={{ color: colors.danger }}>{formError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <View style={{ flex: 1 }}><Button label={t('cancel')} variant="ghost" onPress={closeAdd} /></View>
              <View style={{ flex: 1 }}><Button label={t('saveNetwork')} onPress={() => void saveCustomChain()} loading={probing} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeModal>
    </Screen>
  );
}
