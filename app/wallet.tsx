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
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import {
  getAdapter,
  listChains,
  formatBalance,
  formatAmount,
  getPrices,
  getMarkets,
  getErc20Tokens,
  getTokenPrices,
  type ChainConfig,
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
  const t = useT();
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const activeChain = useWallet((s) => s.activeChain);
  const { fiat } = useSettings();
  const account = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [tokens, setTokens] = useState<TokenAsset[]>([]);
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
        const erc20 = await getErc20Tokens(chainCfg, account.evmAddress);
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
  }, [account, fiat, activeChain]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => (assets ?? []).reduce((s, a) => s + a.fiat, 0) + tokens.reduce((s, tk) => s + tk.fiat, 0),
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
        <Pressable onPress={() => setHidden((h) => !h)}>
          <Text style={{ fontSize: 20 }}>{hidden ? '🙈' : '👁'}</Text>
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
          <Text style={{ color: colors.accent, fontWeight: '600' }}>
            {loading ? 'Actualisation…' : '↻ Actualiser'}
          </Text>
        </Pressable>
      </GlassCard>

      <SegmentedTabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'crypto' ? (
        <>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Rechercher un actif…" />
          <GlassCard>
            {loading && !assets ? (
              <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>…</Text>
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
                    <Text style={{ color: colors.text, fontWeight: '600' }}>
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
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {hidden ? '••••' : tk.hasPrice ? `${money(tk.fiat)} ${fiatSymbol(fiat)}` : '—'}
                      </Text>
                    }
                  />
                ))}
              </GlassCard>
            </>
          ) : null}

          <Pressable
            onPress={() => Alert.alert(t('soon'), 'Ajout de tokens ERC-20/SPL à venir.')}
            style={{ alignItems: 'center', paddingVertical: spacing(1.75), borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 22, borderStyle: 'dashed' }}
          >
            <Text style={{ color: colors.accent, fontWeight: '600' }}>＋ Ajouter un token</Text>
          </Pressable>
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
      ) : (
        <GlassCard>
          <View style={{ alignItems: 'center', paddingVertical: spacing(4), gap: spacing(1) }}>
            <Text style={{ fontSize: 34 }}>{tab === 'nft' ? '🖼️' : tab === 'defi' ? '🏦' : '🌱'}</Text>
            <Text style={typography.bodyStrong}>
              {tab === 'nft' ? 'NFT & Collectibles' : tab === 'defi' ? 'Positions DeFi' : 'Staking'}
            </Text>
            <Text style={typography.muted}>{t('soon')}</Text>
          </View>
        </GlassCard>
      )}
    </PremiumScreen>
  );
}
