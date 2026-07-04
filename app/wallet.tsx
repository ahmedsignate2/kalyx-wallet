import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, Image } from 'react-native';
import { router, Stack } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SearchBar,
  ListRow,
  Avatar,
  SegmentedTabs,
  SkeletonRow
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { AllocationDonut, foldSlices } from '../ui/AllocationDonut';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useCustomTokens } from '../lib/customTokensStore';
import {
  getAdapter,
  listChains,
  formatBalance,
  formatAmount,
  getPrices,
  getMarkets,
  getErc20Tokens,
  getCustomTokens,
  getTokenPrices,
  getNfts,
  type ChainConfig,
  type NftItem,
} from '../src';

function money(value: number, decimals = 2): string {
  const [int, dec] = value.toFixed(decimals).split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${g},${dec}` : g;
}

interface Asset {
  chain: ChainConfig;
  raw: bigint;
  price: number;
  fiat: number;
  logo?: string;
}

interface TokenAsset {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  raw: bigint;
  logo?: string;
  fiat: number;
  hasPrice: boolean;
}

const VALUE_CHAINS = listChains({ includeTestnets: false }).filter((c) => c.coingeckoId);

export default function WalletScreen() {
  const { colors, typography } = useTheme();
  const t = useT();
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const activeChain = useWallet((s) => s.activeChain);
  const { fiat } = useSettings();
  // NB : ne pas renvoyer `?? []` directement du sélecteur (nouvelle réf à chaque
  // rendu -> boucle infinie zustand). On sélectionne l'objet stable puis on dérive.
  const customByChain = useCustomTokens((s) => s.byChain);
  const customList = useMemo(() => customByChain[activeChain] ?? [], [customByChain, activeChain]);
  const account = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [tokens, setTokens] = useState<TokenAsset[]>([]);
  const [nfts, setNfts] = useState<NftItem[] | null>(null);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('crypto');

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const ids = [...new Set(VALUE_CHAINS.map((c) => c.coingeckoId!))];
      const [prices, markets] = await Promise.all([getPrices(ids, fiat), getMarkets(fiat, 60)]);
      const logos = new Map(markets.map((m) => [m.id, m.image]));
      const results = await Promise.all(
        VALUE_CHAINS.map(async (chain) => {
          const address = chain.family === 'bitcoin' ? account.btcAddress : account.evmAddress;
          let raw = 0n;
          try {
            raw = (await getAdapter(chain.id).getBalance(address)).raw;
          } catch {
            raw = 0n;
          }
          const price = prices[chain.coingeckoId!]?.price ?? 0;
          return {
            chain,
            raw,
            price,
            fiat: Number(formatAmount(raw, chain.nativeDecimals)) * price,
            logo: logos.get(chain.coingeckoId!),
          } as Asset;
        }),
      );
      setAssets(results);

      // Tokens ERC-20 du réseau actif (Alchemy) — lecture seule.
      const chainCfg = getAdapter(activeChain).config;
      if (chainCfg.family === 'evm' && chainCfg.coingeckoPlatform) {
        const detected = await getErc20Tokens(chainCfg, account.evmAddress);
        const detectedSet = new Set(detected.map((tk) => tk.contract.toLowerCase()));
        const extra = customList.filter((c) => !detectedSet.has(c.toLowerCase()));
        const custom = extra.length ? await getCustomTokens(chainCfg, account.evmAddress, extra) : [];
        const erc20 = [...detected, ...custom];
        const tokenPrices = await getTokenPrices(
          chainCfg.coingeckoPlatform,
          erc20.map((tk) => tk.contract),
          fiat,
        );
        const tokenAssets: TokenAsset[] = erc20.map((tk) => {
          const price = tokenPrices[tk.contract.toLowerCase()] ?? 0;
          return {
            contract: tk.contract,
            name: tk.name,
            symbol: tk.symbol,
            decimals: tk.decimals,
            raw: tk.raw,
            logo: tk.logo,
            hasPrice: price > 0,
            fiat: Number(formatAmount(tk.raw, tk.decimals)) * price,
          };
        });
        // Tri : valorisés d'abord, par valeur décroissante.
        tokenAssets.sort((a, b) => b.fiat - a.fiat);
        setTokens(tokenAssets);
      } else {
        setTokens([]);
      }
    } finally {
      setLoading(false);
    }
  }, [account, fiat, activeChain, customList]);

  useEffect(() => {
    load();
  }, [load]);

  // NFT du réseau actif (chargés à l'ouverture de l'onglet NFT).
  useEffect(() => {
    if (tab !== 'nft' || !account) return;
    const cfg = getAdapter(activeChain).config;
    if (cfg.family !== 'evm') {
      setNfts([]);
      return;
    }
    setLoadingNfts(true);
    getNfts(cfg, account.evmAddress)
      .then(setNfts)
      .catch(() => setNfts([]))
      .finally(() => setLoadingNfts(false));
  }, [tab, activeChain, account]);

  const total = useMemo(
    () => (assets ?? []).reduce((s, a) => s + a.fiat, 0) + tokens.reduce((s, tk) => s + tk.fiat, 0),
    [assets, tokens],
  );
  // Répartition du portefeuille : natifs (toutes chaînes) + tokens valorisés,
  // repliés en 4 tranches + « Autres » (ordre = couleur, stable).
  const allocation = useMemo(
    () =>
      foldSlices([
        ...(assets ?? []).map((a) => ({ label: a.chain.nativeSymbol, value: a.fiat })),
        ...tokens.filter((tk) => tk.hasPrice).map((tk) => ({ label: tk.symbol, value: tk.fiat })),
      ]),
    [assets, tokens],
  );

  const q = query.trim().toLowerCase();
  const filteredTokens = tokens.filter(
    (tk) => !q || tk.name.toLowerCase().includes(q) || tk.symbol.toLowerCase().includes(q),
  );
  const filtered = (assets ?? []).filter(
    (a) =>
      !query.trim() ||
      a.chain.name.toLowerCase().includes(query.toLowerCase()) ||
      a.chain.nativeSymbol.toLowerCase().includes(query.toLowerCase()),
  );

  const tabs = [
    { key: 'crypto', label: 'Crypto' },
    { key: 'nft', label: 'NFT' },
    { key: 'defi', label: 'DeFi' },
    { key: 'staking', label: 'Staking' },
    { key: 'history', label: 'Historique' },
  ];

  return (
    <PremiumScreen footer={<AppTabBar active="wallet" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.title}>{t('navWallet')}</Text>
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <GlassCard glow>
        <Text style={typography.muted}>
          {t('totalValue')} · {account?.label ?? ''}
        </Text>
        <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit>
          {hidden ? '••••••' : loading && !assets ? '…' : `${money(total)} ${fiatSymbol(fiat)}`}
        </Text>
        <Pressable onPress={load} disabled={loading} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>
            {loading ? 'Actualisation…' : '↻ Actualiser'}
          </Text>
        </Pressable>
      </GlassCard>

      <SegmentedTabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'crypto' ? (
        <>
          {allocation.length > 1 ? (
            <GlassCard>
              <Text style={[typography.muted, { marginBottom: spacing(1.5) }]}>Répartition</Text>
              <AllocationDonut
                slices={allocation}
                centerTitle="Total"
                centerValue={hidden ? '••••' : `${money(total, 0)} ${fiatSymbol(fiat)}`}
                formatValue={hidden ? undefined : (v) => `${money(v, 0)} ${fiatSymbol(fiat)}`}
              />
            </GlassCard>
          ) : null}
          <SearchBar value={query} onChangeText={setQuery} placeholder="Rechercher un actif…" />
          <GlassCard>
            {loading && !assets ? (
              [0, 1, 2, 3].map((i) => <SkeletonRow key={i} divider={i > 0} />)
            ) : (
              filtered.map((a, i) => (
                <ListRow
                  key={a.chain.id}
                  divider={i > 0}
                  left={
                    a.logo ? (
                      <Image source={{ uri: a.logo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                    ) : (
                      <Avatar label={a.chain.nativeSymbol.slice(0, 1)} color={colors.glassStrong} />
                    )
                  }
                  title={a.chain.name}
                  subtitle={hidden ? '••••' : `${formatBalance(a.raw, a.chain.nativeDecimals, 6)} ${a.chain.nativeSymbol}`}
                  onPress={() => a.chain.coingeckoId && router.push(`/token/${a.chain.coingeckoId}`)}
                  right={
                    <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                      {hidden ? '••••' : `${money(a.fiat)} ${fiatSymbol(fiat)}`}
                    </Text>
                  }
                />
              ))
            )}
          </GlassCard>

          {/* Tokens ERC-20 du réseau actif */}
          {filteredTokens.length > 0 ? (
            <>
              <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>
                Tokens · {getAdapter(activeChain).config.name}
              </Text>
              <GlassCard>
                {filteredTokens.map((tk, i) => (
                  <ListRow
                    key={tk.contract}
                    divider={i > 0}
                    left={
                      tk.logo ? (
                        <Image source={{ uri: tk.logo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                      ) : (
                        <Avatar label={tk.symbol.slice(0, 1)} color={colors.glassStrong} />
                      )
                    }
                    title={tk.name}
                    subtitle={hidden ? '••••' : `${formatBalance(tk.raw, tk.decimals, 6)} ${tk.symbol}`}
                    right={
                      <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                        {hidden ? '••••' : tk.hasPrice ? `${money(tk.fiat)} ${fiatSymbol(fiat)}` : '—'}
                      </Text>
                    }
                  />
                ))}
              </GlassCard>
            </>
          ) : null}

          {getAdapter(activeChain).config.family === 'evm' ? (
            <Pressable
              onPress={() => router.push('/add-token')}
              style={{ alignItems: 'center', paddingVertical: spacing(1.75), borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 22, borderStyle: 'dashed' }}
            >
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>＋ Ajouter un token</Text>
            </Pressable>
          ) : null}
        </>
      ) : tab === 'history' ? (
        <GlassCard>
          <ListRow
            title="Historique des transactions"
            subtitle="Voir l’activité on-chain de ce compte"
            right={<Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>}
            onPress={() => router.push('/history')}
          />
        </GlassCard>
      ) : tab === 'nft' ? (
        loadingNfts && nfts === null ? (
          <GlassCard>
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>Chargement des NFT…</Text>
          </GlassCard>
        ) : nfts && nfts.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.25) }}>
            {nfts.map((n) => (
              <Pressable
                key={`${n.contract}-${n.tokenId}`}
                style={{ width: '48%' }}
                onPress={() => Alert.alert(n.name, n.collection || '')}
              >
                <Image
                  source={{ uri: n.image }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: colors.glassStrong }}
                />
                <Text numberOfLines={1} style={[typography.bodyStrong, { marginTop: 6 }]}>{n.name}</Text>
                {n.collection ? <Text numberOfLines={1} style={typography.muted}>{n.collection}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <GlassCard>
            <View style={{ alignItems: 'center', paddingVertical: spacing(4), gap: spacing(1) }}>
              <Icon name="nft" size={34} color={colors.textMuted} />
              <Text style={typography.bodyStrong}>Aucun NFT sur {getAdapter(activeChain).config.name}</Text>
              <Text style={typography.muted}>Tes NFT apparaîtront ici (Alchemy).</Text>
            </View>
          </GlassCard>
        )
      ) : (
        <GlassCard>
          <View style={{ alignItems: 'center', paddingVertical: spacing(4), gap: spacing(1) }}>
            <Icon name={tab === 'defi' ? 'defi' : 'staking'} size={34} color={colors.textMuted} />
            <Text style={typography.bodyStrong}>{tab === 'defi' ? 'Positions DeFi' : 'Staking'}</Text>
            <Text style={typography.muted}>{t('soon')}</Text>
          </View>
        </GlassCard>
      )}
    </PremiumScreen>
  );
}
