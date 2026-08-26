import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, Alert, RefreshControl } from 'react-native';
import { router, Stack } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SearchBar,
  ListRow,
  Avatar,
  RemoteIcon,
  Sparkline,
  SegmentedTabs,
  SkeletonRow
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { AllocationDonut, foldSlices } from '../ui/AllocationDonut';
import { NftDetailModal } from '../ui/NftDetailModal';
import { CountUp } from '../ui/CountUp';
import { FadeInUp } from '../ui/FadeInUp';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { usePortfolio } from '../lib/portfolioStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { useTokenPrefs, tokenKey } from '../lib/tokenPrefsStore';
import {
  getAdapter,
  listChains,
  chainIconUrl,
  formatBalance,
  formatAmount,
  getPrices,
  getMarkets,
  getErc20Tokens,
  getCustomTokens,
  getTokenPrices,
  getNfts,
  getSolanaNfts,
  classifyToken,
  SolanaChainAdapter,
  type ChainConfig,
  type NftItem,
  type DefiPosition,
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
  spark?: number[]; // courbe 7j
  change24h?: number; // (depuis getMarkets, sans appel supplémentaire)
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
  /** Position DeFi/staking détectée (Lido, Aave…) — null = token normal. */
  defi: DefiPosition | null;
  /** Présent = token SPL (Solana) ; l'envoi passe par le mint, pas un contrat EVM. */
  mint?: string;
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
  const [openNft, setOpenNft] = useState<NftItem | null>(null);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('crypto');
  const setPortfolio = usePortfolio(s => s.setPortfolio);

  
  useEffect(() => {
    if (!assets) return;
    let totalFiat = 0;
    let pastFiat = 0;
    let topGainer = { symbol: '', change: -9999 };
    let topLoser = { symbol: '', change: 9999 };
    
    const activeAssets = [];
    
    // Process native assets
    for (const a of assets) {
      if (a.fiat > 0 || a.raw > 0n) {
        totalFiat += a.fiat;
        const bal = Number(formatAmount(a.raw, a.chain.nativeDecimals));
        activeAssets.push(`- ${a.chain.nativeSymbol}: ${bal.toFixed(4)} (~ ${money(a.fiat)} ${fiatSymbol(fiat)})`);
        
        if (a.change24h !== undefined) {
          pastFiat += a.fiat / (1 + a.change24h / 100);
          if (a.change24h > topGainer.change) topGainer = { symbol: a.chain.nativeSymbol, change: a.change24h };
          if (a.change24h < topLoser.change) topLoser = { symbol: a.chain.nativeSymbol, change: a.change24h };
        } else {
          pastFiat += a.fiat; // unknown change, assume 0
        }
      }
    }
    
    // Process tokens (without change24h for now, assuming 0 change for pastFiat)
    for (const t of tokens) {
       if (t.hasPrice && t.fiat > 0) {
          totalFiat += t.fiat;
          pastFiat += t.fiat;
          const bal = Number(formatBalance(t.raw, t.decimals));
          activeAssets.push(`- ${t.symbol}: ${bal.toFixed(4)} (~ ${money(t.fiat)} ${fiatSymbol(fiat)})`);
       } else if (t.raw > 0n) {
          const bal = Number(formatBalance(t.raw, t.decimals));
          activeAssets.push(`- ${t.symbol}: ${bal.toFixed(4)} (${t.name})`);
       }
    }
    
    const pnl24h = totalFiat - pastFiat;
    const pnl24hPct = pastFiat > 0 ? (pnl24h / pastFiat) * 100 : 0;
    
    setPortfolio(totalFiat, activeAssets, pnl24h, pnl24hPct, topGainer.symbol, topLoser.symbol);
  }, [assets, tokens, fiat]);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const ids = [...new Set(VALUE_CHAINS.map((c) => c.coingeckoId!))];
      const [prices, markets] = await Promise.all([getPrices(ids, fiat), getMarkets(fiat, 60)]);
      const logos = new Map(markets.map((m) => [m.id, m.image]));
      const sparks = new Map(markets.map((m) => [m.id, m.sparkline]));
      const changes = new Map(markets.map((m) => [m.id, m.change24h])); // courbe 7j (même appel)
      const results = await Promise.all(
        VALUE_CHAINS.map(async (chain) => {
          const address =
            chain.family === 'bitcoin'
              ? account.btcAddress
              : chain.family === 'solana'
                ? account.solAddress ?? ''
                : account.evmAddress;
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
            logo: logos.get(chain.coingeckoId!), change24h: changes.get(chain.coingeckoId!),
            spark: sparks.get(chain.coingeckoId!),
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
        // Note: tokenPrices doesn't return change24h currently, but we use the main assets for AI P&L
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
            defi: classifyToken(activeChain, tk.contract, tk.name, tk.symbol),
          };
        });
        // Tri : valorisés d'abord, par valeur décroissante.
        tokenAssets.sort((a, b) => b.fiat - a.fiat);
        setTokens(tokenAssets);
      } else if (chainCfg.family === 'solana' && account.solAddress) {
        // Tokens SPL du réseau Solana.
        const adapter = getAdapter(activeChain);
        const spl = adapter instanceof SolanaChainAdapter ? await adapter.getSplTokens(account.solAddress) : [];
        const splPrices = spl.length
          ? await getTokenPrices('solana', spl.map((tk) => tk.mint), fiat)
          : {};
        const splAssets: TokenAsset[] = spl.map((tk) => {
          const price = splPrices[tk.mint.toLowerCase()] ?? 0;
          return {
            contract: tk.mint,
            mint: tk.mint,
            name: tk.name,
            symbol: tk.symbol,
            decimals: tk.decimals,
            raw: tk.raw,
            logo: tk.logo,
            hasPrice: price > 0,
            fiat: Number(formatAmount(tk.raw, tk.decimals)) * price,
            defi: null,
          };
        });
        splAssets.sort((a, b) => b.fiat - a.fiat);
        setTokens(splAssets);
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

  // Balayer vers le bas pour rafraîchir les soldes/tokens.
  const [refreshing, setRefreshing] = useState(false);
  const [opps, setOpps] = useState<any[]>([]);
  useEffect(() => { fetchYieldOpportunities().then(setOpps); }, []);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // NFT du réseau actif (chargés à l'ouverture de l'onglet NFT).
  useEffect(() => {
    if (tab !== 'nft' || !account) return;
    const cfg = getAdapter(activeChain).config;
    
    setLoadingNfts(true);
    if (cfg.family === 'evm') {
      getNfts(cfg, account.evmAddress)
        .then(setNfts)
        .catch(() => setNfts([]))
        .finally(() => setLoadingNfts(false));
    } else if (cfg.family === 'solana') {
      getSolanaNfts(cfg, account.solAddress || '')
        .then(setNfts)
        .catch(() => setNfts([]))
        .finally(() => setLoadingNfts(false));
    } else {
      setNfts([]);
      setLoadingNfts(false);
    }
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
  // Positions détectées (parmi les ERC-20 détenus), par onglet.
  const stakingPositions = useMemo(() => {
    return tokens.filter((tk) => {
      if (tk.defi?.kind === 'staking') return true;
      const o = opps.find(op => op.yieldTokenAddress === tk.contract || op.yieldTokenAddress === (tk as any).mint);
      return o !== undefined;
    });
  }, [tokens, opps]);
  const defiPositions = useMemo(() => {
    return tokens.filter((tk) => {
      if (tk.defi?.kind === 'defi') return true;
      const n = (tk.name || '').toLowerCase();
      const s = (tk.symbol || '').toLowerCase();
      // Heuristics for DeFi tokens (LPs, aTokens, cTokens, Vaults)
      return n.includes('liquidity') || n.includes('lp token') || s.includes('lp') || n.includes('aave') || n.includes('compound') || s.startsWith('a') && s.length > 3 || s.startsWith('c') && s.length > 3;
    });
  }, [tokens]);

  const hidden_ = useTokenPrefs((s) => s.hidden);
  const pinned = useTokenPrefs((s) => s.pinned);
  const showHidden = useTokenPrefs((s) => s.showHidden);
  const setShowHidden = useTokenPrefs((s) => s.setShowHidden);
  const togglePin = useTokenPrefs((s) => s.togglePin);
  const toggleHidden = useTokenPrefs((s) => s.toggleHidden);
  const keyOf = (tk: TokenAsset) => tokenKey(activeChain, tk.contract);

  const q = query.trim().toLowerCase();
  const hiddenCount = tokens.filter((tk) => hidden_[keyOf(tk)]).length;
  const filteredTokens = useMemo(() => {
    const list = tokens
      .filter((tk) => !q || tk.name.toLowerCase().includes(q) || tk.symbol.toLowerCase().includes(q))
      .filter((tk) => showHidden || !hidden_[keyOf(tk)]);
    // Épinglés d'abord (ordre par valeur préservé dans chaque groupe).
    const pins = list.filter((tk) => pinned[keyOf(tk)]);
    const rest = list.filter((tk) => !pinned[keyOf(tk)]);
    return [...pins, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, q, hidden_, pinned, showHidden, activeChain]);

  const openTokenMenu = (tk: TokenAsset) => {
    const key = keyOf(tk);
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      tk.mint
        ? { text: t('send'), onPress: () => router.push({ pathname: '/send', params: { mint: tk.mint!, symbol: tk.symbol, decimals: String(tk.decimals) } }) }
        : { text: t('send'), onPress: () => router.push({ pathname: '/send', params: { contract: tk.contract, symbol: tk.symbol, decimals: String(tk.decimals) } }) },
      ...(tk.mint ? [] : [{ text: t('swap'), onPress: () => router.push({ pathname: '/swap', params: { contract: tk.contract } }) }]),
      { text: pinned[key] ? t('unpin') : t('pinTop'), onPress: () => togglePin(key) },
      { text: hidden_[key] ? t('showAgain') : t('hideToken'), style: 'destructive', onPress: () => toggleHidden(key) },
      { text: t('cancel'), style: 'cancel' },
    ];
    Alert.alert(tk.symbol, tk.name, buttons);
  };
  const filtered = (assets ?? []).filter(
    (a) =>
      !query.trim() ||
      a.chain.name.toLowerCase().includes(query.toLowerCase()) ||
      a.chain.nativeSymbol.toLowerCase().includes(query.toLowerCase()),
  );

  const tabs = [
    { key: 'crypto', label: t('tabCrypto') },
    { key: 'nft', label: t('tabNft') },
    { key: 'defi', label: t('tabDefi') },
    { key: 'staking', label: t('tabStaking') },
    { key: 'history', label: t('historyTab') },
  ];

  return (
    <PremiumScreen
      footer={<AppTabBar active="wallet" />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
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
        {hidden || (loading && !assets) ? (
          <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit>
            {hidden ? '••••••' : '…'}
          </Text>
        ) : (
          /* Solde animé : compte jusqu'à la valeur totale. */
          <CountUp value={total} format={(v) => `${money(v)} ${fiatSymbol(fiat)}`} style={typography.hero} />
        )}
        <Pressable onPress={load} disabled={loading} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>
            {loading ? t('refreshing') : '↻ ' + t('refresh')}
          </Text>
        </Pressable>
      </GlassCard>

      <SegmentedTabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'crypto' ? (
        <>
          {allocation.length > 1 ? (
            <GlassCard>
              <Text style={[typography.muted, { marginBottom: spacing(1.5) }]}>{t('allocation')}</Text>
              <AllocationDonut
                slices={allocation}
                centerTitle="Total"
                centerValue={hidden ? '••••' : `${money(total, 0)} ${fiatSymbol(fiat)}`}
                formatValue={hidden ? undefined : (v) => `${money(v, 0)} ${fiatSymbol(fiat)}`}
              />
            </GlassCard>
          ) : null}
          <SearchBar value={query} onChangeText={setQuery} placeholder={t("searchAsset")} />
          <GlassCard>
            {loading && !assets ? (
              [0, 1, 2, 3].map((i) => <SkeletonRow key={i} divider={i > 0} />)
            ) : (
              filtered.map((a, i) => (
                <FadeInUp key={a.chain.id} delay={i * 55}>
                  <ListRow
                    divider={i > 0}
                    left={<RemoteIcon uri={chainIconUrl(a.chain.id)} label={a.chain.nativeSymbol} />}
                    title={a.chain.name}
                    subtitle={hidden ? '••••' : `${formatBalance(a.raw, a.chain.nativeDecimals, 6)} ${a.chain.nativeSymbol}`}
                    onPress={() => a.chain.coingeckoId && router.push(`/token/${a.chain.coingeckoId}`)}
                    right={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
                        {a.spark && a.spark.length > 1 ? (
                          <Sparkline data={a.spark} width={56} height={26} color={a.spark[a.spark.length - 1] >= a.spark[0] ? colors.up : colors.down} />
                        ) : null}
                        <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                          {hidden ? '••••' : `${money(a.fiat)} ${fiatSymbol(fiat)}`}
                        </Text>
                      </View>
                    }
                  />
                </FadeInUp>
              ))
            )}
          </GlassCard>

          {/* Tokens du réseau actif (ERC-20 sur EVM, SPL sur Solana) */}
          {filteredTokens.length > 0 ? (
            <>
              <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>
                {t("tokensOn")} · {getAdapter(activeChain).config.name}
              </Text>
              <GlassCard>
                {filteredTokens.map((tk, i) => (
                  <FadeInUp key={tk.contract} delay={i * 55}>
                  <ListRow
                    divider={i > 0}
                    onPress={() => openTokenMenu(tk)}
                    left={<RemoteIcon uri={tk.logo} label={tk.symbol} />}
                    title={pinned[keyOf(tk)] ? `📌 ${tk.name}` : tk.name}
                    subtitle={hidden ? '••••' : `${formatBalance(tk.raw, tk.decimals, 6)} ${tk.symbol}`}
                    right={
                      <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                        {hidden ? '••••' : tk.hasPrice ? `${money(tk.fiat)} ${fiatSymbol(fiat)}` : '—'}
                      </Text>
                    }
                  />
                  </FadeInUp>
                ))}
              </GlassCard>
              {hiddenCount > 0 ? (
                <Pressable onPress={() => setShowHidden(!showHidden)} hitSlop={6} style={{ alignSelf: 'center', paddingVertical: spacing(1) }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {showHidden ? 'Masquer' : 'Afficher'} {hiddenCount} token{hiddenCount > 1 ? 's' : ''} masqué{hiddenCount > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {getAdapter(activeChain).config.family === 'evm' ? (
            <Pressable
              onPress={() => router.push('/add-token')}
              style={{ alignItems: 'center', paddingVertical: spacing(1.75), borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 22, borderStyle: 'dashed' }}
            >
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>＋ {t('addToken')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : tab === 'history' ? (
        <GlassCard>
          <ListRow
            title={t('txHistoryTitle')}
            subtitle={t('txHistorySub')}
            right={<Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>}
            onPress={() => router.push('/history')}
          />
        </GlassCard>
      ) : tab === 'nft' ? (
        loadingNfts && nfts === null ? (
          <GlassCard>
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>{t('nftLoading')}</Text>
          </GlassCard>
        ) : nfts && nfts.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.25) }}>
            {nfts.map((n) => (
              <Pressable
                key={`${n.contract}-${n.tokenId}`}
                style={{ width: '48%' }}
                onPress={() => setOpenNft(n)}
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
              <Text style={typography.muted}>{t('nftEmptyHint')}</Text>
            </View>
          </GlassCard>
        )
      ) : tab === 'defi' || tab === 'staking' ? (
        (() => {
          const positions = tab === 'defi' ? defiPositions : stakingPositions;
          const isStaking = tab === 'staking';
          if (loading && !assets) {
            return <GlassCard>{[0, 1].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>;
          }
          if (positions.length > 0) {
            const sum = positions.reduce((s, p) => s + p.fiat, 0);
            return (
              <>
                <GlassCard>
                  <Text style={typography.muted}>{isStaking ? 'Total staké' : 'Total DeFi'} · {getAdapter(activeChain).config.name}</Text>
                  <Text style={[typography.title, { marginTop: 2 }]}>
                    {hidden ? '••••' : `${money(sum)} ${fiatSymbol(fiat)}`}
                  </Text>
                </GlassCard>
                <GlassCard>
                  {positions.map((p, i) => (
                    <ListRow
                      key={p.contract}
                      divider={i > 0}
                      left={<RemoteIcon uri={p.logo} label={p.symbol} />}
                      title={p.name}
                      subtitle={`${p.defi?.protocol ?? ''} · ${hidden ? '••••' : `${formatBalance(p.raw, p.decimals, 6)} ${p.symbol}`}`}
                      right={
                        <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                          {hidden ? '••••' : p.hasPrice ? `${money(p.fiat)} ${fiatSymbol(fiat)}` : '—'}
                        </Text>
                      }
                      onPress={() => {
                        const pName = (p.defi?.protocol || p.name).toLowerCase();
                        let url = isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com'; // fallback
                        
                        if (pName.includes('jito')) url = 'https://jito.network/staking';
                        else if (pName.includes('benqi')) url = isStaking ? 'https://staking.benqi.fi' : 'https://app.benqi.fi';
                        else if (pName.includes('lido')) url = 'https://stake.lido.fi';
                        else if (pName.includes('binance') || pName.includes('bnb')) url = 'https://www.bnbchain.org/en/staking';
                        else if (pName.includes('rocket')) url = 'https://stake.rocketpool.net';
                        else if (pName.includes('aave')) url = 'https://app.aave.com';
                        else if (pName.includes('raydium')) url = 'https://raydium.io';
                        else if (pName.includes('pancake')) url = 'https://pancakeswap.finance';
                        
                        router.push({ pathname: '/browser', params: { url } });
                      }}
                    />
                  ))}
                </GlassCard>
              </>
            );
          }
          // État vide : CTA vers le navigateur dApps (le vrai point d'entrée).
          return (
            <GlassCard>
              <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
                <Icon name={isStaking ? 'staking' : 'defi'} size={34} color={colors.textMuted} />
                <Text style={typography.bodyStrong}>{isStaking ? 'Aucune position de staking' : 'Aucune position DeFi'}</Text>
                
                {(() => {
                  const isSolana = activeChain === 'solana';
                  const isAvax = activeChain === 'avalanche';
                  const isBnb = activeChain === 'bnb';
                  
                  const stakingDesc = isSolana ? "Mets ton SOL au travail via Jito ou Marinade." : isAvax ? "Mets ton AVAX au travail via BENQI." : isBnb ? "Génère du rendement avec le staking BNB." : "Mets ton ETH au travail via un protocole de staking liquide (stETH, rETH…).";
                  const defiDesc = "Prête, emprunte ou fournis de la liquidité sur les protocoles DeFi.";
                  
                  const stakingCtaText = isSolana ? "Ouvrir Jito ↗" : isAvax ? "Ouvrir BENQI ↗" : isBnb ? "Staking BNB ↗" : "Ouvrir Lido ↗";
                  const stakingCtaUrl = isSolana ? "https://jito.network/staking" : isAvax ? "https://staking.benqi.fi" : isBnb ? "https://www.bnbchain.org/en/staking" : "https://stake.lido.fi";
                  
                  const defiCtaText = isSolana ? "Ouvrir Raydium ↗" : isAvax ? "Ouvrir BENQI ↗" : isBnb ? "Ouvrir PancakeSwap ↗" : "Ouvrir Aave ↗";
                  const defiCtaUrl = isSolana ? "https://raydium.io" : isAvax ? "https://app.benqi.fi" : isBnb ? "https://pancakeswap.finance" : "https://app.aave.com";

                  return (
                    <>
                      <Text style={[typography.muted, { textAlign: 'center' }]}>
                        {isStaking ? stakingDesc : defiDesc}
                      </Text>
                      <Pressable
                        onPress={() => router.push({ pathname: '/browser', params: { url: isStaking ? stakingCtaUrl : defiCtaUrl } })}
                        style={{ marginTop: spacing(0.5), backgroundColor: colors.accent, borderRadius: 999, paddingVertical: spacing(1.25), paddingHorizontal: spacing(2.5) }}
                      >
                        <Text style={{ color: '#fff', fontFamily: fonts.semibold }}>
                          {isStaking ? stakingCtaText : defiCtaText}
                        </Text>
                      </Pressable>
                    </>
                  );
                })()}
              </View>
            </GlassCard>
          );
        })()
      ) : null}

      <NftDetailModal nft={openNft} explorerUrl={getAdapter(activeChain).config.explorerUrl} onClose={() => setOpenNft(null)} />
    </PremiumScreen>
  );
}
