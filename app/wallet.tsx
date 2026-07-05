import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, Alert } from 'react-native';
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
import { NftDetailModal } from '../ui/NftDetailModal';
import { CountUp } from '../ui/CountUp';
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

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const ids = [...new Set(VALUE_CHAINS.map((c) => c.coingeckoId!))];
      const [prices, markets] = await Promise.all([getPrices(ids, fiat), getMarkets(fiat, 60)]);
      const logos = new Map(markets.map((m) => [m.id, m.image]));
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
  // Positions détectées (parmi les ERC-20 détenus), par onglet.
  const stakingPositions = useMemo(() => tokens.filter((tk) => tk.defi?.kind === 'staking'), [tokens]);
  const defiPositions = useMemo(() => tokens.filter((tk) => tk.defi?.kind === 'defi'), [tokens]);

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

          {/* Tokens du réseau actif (ERC-20 sur EVM, SPL sur Solana) */}
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
                    onPress={() =>
                      Alert.alert(
                        tk.symbol,
                        tk.name,
                        tk.mint
                          ? [
                              {
                                text: 'Envoyer',
                                onPress: () =>
                                  router.push({
                                    pathname: '/send',
                                    params: { mint: tk.mint, symbol: tk.symbol, decimals: String(tk.decimals) },
                                  }),
                              },
                              { text: 'Annuler', style: 'cancel' },
                            ]
                          : [
                              {
                                text: 'Envoyer',
                                onPress: () =>
                                  router.push({
                                    pathname: '/send',
                                    params: { contract: tk.contract, symbol: tk.symbol, decimals: String(tk.decimals) },
                                  }),
                              },
                              {
                                text: 'Échanger',
                                onPress: () => router.push({ pathname: '/swap', params: { contract: tk.contract } }),
                              },
                              { text: 'Annuler', style: 'cancel' },
                            ],
                      )
                    }
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
              <Text style={typography.muted}>Tes NFT apparaîtront ici (Alchemy).</Text>
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
                      left={
                        p.logo ? (
                          <Image source={{ uri: p.logo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : (
                          <Avatar label={p.symbol.slice(0, 1)} color={colors.glassStrong} />
                        )
                      }
                      title={p.name}
                      subtitle={`${p.defi?.protocol ?? ''} · ${hidden ? '••••' : `${formatBalance(p.raw, p.decimals, 6)} ${p.symbol}`}`}
                      right={
                        <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                          {hidden ? '••••' : p.hasPrice ? `${money(p.fiat)} ${fiatSymbol(fiat)}` : '—'}
                        </Text>
                      }
                      onPress={() => router.push({ pathname: '/browser', params: { url: isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com' } })}
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
                <Text style={[typography.muted, { textAlign: 'center' }]}>
                  {isStaking
                    ? 'Mets ton ETH au travail via un protocole de staking liquide (stETH, rETH…).'
                    : 'Prête, emprunte ou fournis de la liquidité sur les protocoles DeFi.'}
                </Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/browser', params: { url: isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com' } })}
                  style={{ marginTop: spacing(0.5), backgroundColor: colors.accent, borderRadius: 999, paddingVertical: spacing(1.25), paddingHorizontal: spacing(2.5) }}
                >
                  <Text style={{ color: '#fff', fontFamily: fonts.semibold }}>
                    {isStaking ? 'Ouvrir Lido ↗' : 'Ouvrir Aave ↗'}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          );
        })()
      ) : null}

      <NftDetailModal nft={openNft} explorerUrl={getAdapter(activeChain).config.explorerUrl} onClose={() => setOpenNft(null)} />
    </PremiumScreen>
  );
}
