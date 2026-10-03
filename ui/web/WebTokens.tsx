/**
 * Jetons (web) — la liste de l'accueil de l'app : TOUS les réseaux à la fois,
 * depuis le même portefeuille agrégé, au lieu du seul réseau sélectionné.
 *  - « Tous les réseaux » ou le réseau sélectionné, au choix ;
 *  - petits soldes et jetons non vérifiés repliés, comme dans l'app ;
 *  - réseaux de test à part, sans valeur, quand ils sont affichés.
 * Toucher une ligne sélectionne son réseau (solde, graphique, Envoyer suivent).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text, Surface, Divider, TokenRow, TokenIcon, Chip, Skeleton, Pressable } from '../kit';
import { space } from '../tokens';
import { useT, useSettings, fiatSymbol } from '../../lib/settingsStore';
import { fill } from '../../lib/i18n';
import { usePortfolioStore, splitHoldings, snapshotKey, useTestnetBalances, type Holding } from '../../lib/portfolio';
import { useWebConnect } from '../../lib/webConnect';
import { chainIconUrl, formatTokenAmount, formatFiat, type ChainConfig } from '../../src';
import { MobileEmptyState } from './MobileChrome';
import { useWebT } from './webI18n';
import { chainOf, useWebPortfolioAccount } from './webAccounts';

const NONE: Holding[] = [];

export function WebTokens({ chain, onReceive }: { chain: ChainConfig; onReceive: () => void }) {
  const t = useT();
  const tw = useWebT();
  const fiat = useSettings((s) => s.fiat);
  const showTestnets = useSettings((s) => s.showTestnets);
  const sym = fiatSymbol(fiat);
  const setChain = useWebConnect((s) => s.setChain);
  const accounts = useWebConnect((s) => s.accounts);
  const rev = useWebConnect((s) => s.rev);
  const acct = useWebPortfolioAccount();
  // Seulement le cliché DE CE compte : jamais les jetons d'un autre sous son nom.
  const pfKey = usePortfolioStore((s) => s.key);
  const allHoldings = usePortfolioStore((s) => s.holdings);
  const holdings = acct && pfKey === snapshotKey(acct, fiat) ? allHoldings : NONE;
  const loading = usePortfolioStore((s) => s.loading);
  const at = usePortfolioStore((s) => s.at);
  const [scope, setScope] = useState<'all' | 'chain'>('all');
  const [showSmall, setShowSmall] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Réseaux de test : lus à part (jamais dans le total), seulement s'ils sont affichés.
  const testnets = useTestnetBalances((s) => s.balances);
  useEffect(() => {
    if (showTestnets && acct) void useTestnetBalances.getState().refresh(acct, { force: rev > 0 });
  }, [showTestnets, acct, rev]);
  const sharedTestnets = testnets.filter((b) => accounts.some((a) => a.chainId === b.chain.id));

  const mainnet = useMemo(() => holdings.filter((h) => !chainOf(h.chainId)?.testnet), [holdings]);
  const scoped = scope === 'chain' ? mainnet.filter((h) => h.chainId === chain.id) : mainnet;
  const { main, small, hidden } = splitHoldings(scoped);
  const shown = showSmall ? [...main, ...small] : main;

  const row = (h: Holding, i: number, arr: Holding[]) => {
    const c = chainOf(h.chainId);
    return (
      <React.Fragment key={h.id}>
        <TokenRow
          symbol={h.symbol}
          name={c && h.name !== c.name ? `${h.name} · ${c.name}` : h.name}
          logo={h.logo ?? (h.kind === 'native' ? chainIconUrl(h.chainId) : undefined)}
          chainBadge={h.kind === 'native' ? undefined : chainIconUrl(h.chainId)}
          chainId={h.chainId}
          address={h.contract ?? h.chainId}
          balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
          fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
          changePct={h.change24h}
          onPress={accounts.some((a) => a.chainId === h.chainId) ? () => setChain(h.chainId) : undefined}
        />
        {i < arr.length - 1 ? <Divider inset={68} /> : null}
      </React.Fragment>
    );
  };

  const empty = at === 0 && loading;
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Chip label={t('filterAllNetworks')} selected={scope === 'all'} onPress={() => setScope('all')} />
        <Chip label={chain.name} selected={scope === 'chain'} onPress={() => setScope('chain')} />
      </View>

      {empty ? (
        <Surface padded={false}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
              <Skeleton width={40} height={40} round />
              <View style={{ flex: 1, gap: space[2] }}><Skeleton width="50%" /><Skeleton width="30%" height={12} /></View>
            </View>
          ))}
        </Surface>
      ) : shown.length === 0 && hidden.length === 0 && small.length === 0 ? (
        <MobileEmptyState
          icon="wallet"
          title={tw('noTokensYet')}
          subtitle={scope === 'chain' ? tw('noTokensBody', { chain: chain.name }) : t('emptyTokensBody')}
          action={{ label: tw('receiveFunds'), onPress: onReceive }}
        />
      ) : (
        <>
          {shown.length > 0 ? <Surface padded={false}>{shown.map(row)}</Surface> : null}
          {small.length > 0 ? (
            <Pressable onPress={() => setShowSmall((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
              <Text variant="caption" tone="secondary">{showSmall ? t('hideSmallBalances') : fill(t('showSmallBalances'), { count: String(small.length) })}</Text>
            </Pressable>
          ) : null}
          {hidden.length > 0 ? (
            <View style={{ gap: space[2] }}>
              <Pressable onPress={() => setShowHidden((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
                <Text variant="caption" tone="tertiary">{showHidden ? t('hideUnverifiedTokens') : fill(t('showUnverifiedTokens'), { count: String(hidden.length) })}</Text>
              </Pressable>
              {showHidden ? (
                <Surface padded={false} style={{ opacity: 0.75 }}>
                  {hidden.map((h, i) => (
                    <React.Fragment key={h.id}>
                      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                        <TokenIcon symbol={h.symbol} seed={h.contract ?? h.symbol} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="body" tone="secondary" numberOfLines={1}>{h.name} · {chainOf(h.chainId)?.name ?? h.chainId}</Text>
                          <Text variant="caption" tone="warning">{t('unverifiedBadge')}</Text>
                        </View>
                        <Text variant="caption" tone="tertiary" tabular>{formatTokenAmount(h.raw, h.decimals)} {h.symbol}</Text>
                      </View>
                      {i < hidden.length - 1 ? <Divider inset={68} /> : null}
                    </React.Fragment>
                  ))}
                </Surface>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      {showTestnets ? (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('testnetSectionTitle')}</Text>
            <Text variant="micro" tone="tertiary">{t('testnetSectionNote')}</Text>
          </View>
          {sharedTestnets.length > 0 ? (
            <Surface padded={false}>
              {sharedTestnets.map((b, i) => (
                <React.Fragment key={b.chain.id}>
                  <TokenRow
                    symbol={b.chain.nativeSymbol}
                    name={b.chain.name}
                    logo={chainIconUrl(b.chain.id)}
                    chainId={b.chain.id}
                    address={b.chain.id}
                    balance={`${formatTokenAmount(b.raw, b.chain.nativeDecimals)} ${b.chain.nativeSymbol}`}
                    fiat={t('testnetNoValue')}
                    onPress={() => setChain(b.chain.id)}
                  />
                  {i < sharedTestnets.length - 1 ? <Divider inset={68} /> : null}
                </React.Fragment>
              ))}
            </Surface>
          ) : (
            <Surface>
              <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                {accounts.some((a) => chainOf(a.chainId)?.testnet) ? t('testnetNoBalance') : t('testnetNotShared')}
              </Text>
            </Surface>
          )}
        </View>
      ) : null}
    </View>
  );
}
