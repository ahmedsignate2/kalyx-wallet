/**
 * Activité (web) — même écran que l'app (app/history.tsx), au lieu d'un
 * historique limité au réseau sélectionné :
 *  - TOUS les réseaux partagés par le téléphone, lus par le même magasin
 *    d'historique que l'app (cache, fraîcheur) ;
 *  - filtres Reçus / Envoyés / Swaps, puces par réseau (seulement ceux où il
 *    s'est passé quelque chose), recherche (jeton, adresse, hash) ;
 *  - tri anti-spam de l'app : suspects repliés en bas avec leur raison,
 *    empoisonnement d'adresse signalé en tête ;
 *  - export CSV (téléchargé par le navigateur) ;
 *  - détail en feuille : statut, date, réseau, adresses, hash, explorateur.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, Surface, Divider, Chip, Input, SegmentedControl, ActivityRow, Skeleton, Sheet, ListRow, Button, Pressable } from '../kit';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { space } from '../tokens';
import { useT, useActivityT, useSettings, fiatSymbol } from '../../lib/settingsStore';
import { useHistoryStore, useHistoryCache, cacheKey } from '../../lib/historyStore';
import { usePortfolioStore } from '../../lib/portfolio';
import { useContacts } from '../../lib/contactsStore';
import { buildTrusted, pickHistoryChains } from '../../lib/historySpam';
import { knownCounterparties, spamReason, type SpamCtx } from '../../src/domain/tx/spam';
import { useWebConnect } from '../../lib/webConnect';
import { toast } from '../../lib/toast';
import {
  humanizeTx, groupByDay, formatFiat, chainNameOf, chainMetaOf, chainIconUrl, nativeOfChain, transactionsToCsv, shortAddress,
  type TxSummary, type HumanTx, type ChainConfig,
} from '../../src';
import { MobileEmptyState } from './MobileChrome';
import { useWebT } from './webI18n';
import { webLocale } from './webTheme';
import { chainOf } from './webAccounts';

type Filter = 'all' | 'in' | 'out' | 'swap';
type Row = { tx: TxSummary; h: HumanTx };

const SPAM_TEXT = { poisoning: 'spamPoisoning', scamName: 'spamScamName', zeroValue: 'spamZeroValue', unverifiedToken: 'spamUnverified' } as const;
const PAGE = 20;

/** Téléchargement d'un fichier texte par le navigateur (rien ne quitte l'appareil). */
function downloadText(name: string, text: string): boolean {
  const g = globalThis as { document?: { createElement: (t: string) => { href: string; download: string; click: () => void } }; URL?: { createObjectURL: (b: unknown) => string; revokeObjectURL: (u: string) => void }; Blob?: new (parts: string[], o: { type: string }) => unknown };
  if (Platform.OS !== 'web' || !g.document || !g.URL || !g.Blob) return false;
  const url = g.URL.createObjectURL(new g.Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = g.document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => g.URL!.revokeObjectURL(url), 1000);
  return true;
}

export function WebActivity({ onReceive }: { onReceive: () => void }) {
  const t = useT();
  const tw = useWebT();
  const activityT = useActivityT();
  const { colors } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const showTestnets = useSettings((s) => s.showTestnets);
  const accounts = useWebConnect((s) => s.accounts);
  const rev = useWebConnect((s) => s.rev);
  const holdings = usePortfolioStore((s) => s.holdings);
  const contacts = useContacts((s) => s.contacts);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const cache = useHistoryCache();
  const locale = webLocale();

  const [filter, setFilter] = useState<Filter>('all');
  const [onlyChain, setOnlyChain] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<Row | null>(null);
  const [attempted, setAttempted] = useState(false);

  /*
   * Réseaux lus : ceux que le téléphone a partagés (les autres ne
   * signeraient pas), restreints comme dans l'app aux principaux, à ceux où
   * l'on détient quelque chose et à ceux déjà en cache — pas soixante appels
   * pour des listes vides. Réseaux de test : seulement s'ils sont affichés.
   */
  const shared = useMemo(
    () => accounts
      .map((a) => ({ chain: chainOf(a.chainId), address: a.address }))
      .filter((x): x is { chain: ChainConfig; address: string } => !!x.chain && (!x.chain.testnet || showTestnets)),
    [accounts, showTestnets],
  );
  const holdingKey = [...new Set(holdings.filter((h) => h.raw > 0n).map((h) => h.chainId))].sort().join(',');
  const cachedKey = [...new Set(Object.entries(cache).filter(([, v]) => v.length > 0).map(([k]) => k.split(':')[0]))].sort().join(',');
  const targets = useMemo(() => {
    const picked = new Set(pickHistoryChains(shared.map((s) => s.chain), new Set(holdingKey.split(',')), new Set(cachedKey.split(','))).map((c) => c.id));
    return shared.filter((s) => picked.has(s.chain.id) || s.chain.testnet);
  }, [shared, holdingKey, cachedKey]);
  const targetKey = targets.map((x) => `${x.chain.id}:${x.address}`).join(',');

  const load = useCallback(async (force: boolean) => {
    await Promise.all(targets.map((x) => fetchHistory(x.chain.id, x.address, { force }).catch(() => {})));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, fetchHistory]);
  // `rev` change après chaque signature : l'activité est relue sans attendre.
  useEffect(() => {
    setAttempted(false);
    void load(rev > 0).finally(() => setAttempted(true));
  }, [load, rev]);

  const loading = useHistoryStore((s) => targets.some((x) => s.loading[cacheKey(x.chain.id, x.address)] === true));

  const txs = useMemo(() => {
    const seen = new Map<string, TxSummary>();
    for (const x of targets) for (const tx of cache[cacheKey(x.chain.id, x.address)] ?? []) seen.set(`${tx.chain}:${tx.hash}`, tx);
    return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [cache, targets]);

  // Tri anti-spam de l'app : jetons vérifiés du portefeuille, listes curées, contacts, propres adresses.
  const spamOf = useMemo(() => {
    const verified = new Set(holdings.filter((h) => h.verified && h.contract).map((h) => `${h.chainId}:${h.contract!.toLowerCase()}`));
    const trusted = buildTrusted(verified);
    const known = knownCounterparties(txs, trusted, [...accounts.map((a) => a.address), ...contacts.map((c) => c.address)]);
    const ctx: SpamCtx = { trusted, known };
    return (tx: TxSummary) => spamReason(tx, ctx);
  }, [holdings, accounts, contacts, txs]);

  const own = useMemo(() => new Set(accounts.map((a) => a.address.toLowerCase())), [accounts]);
  const nameOf = useCallback(
    (a: string) => (own.has(a.toLowerCase()) ? t('actYou') : contacts.find((c) => c.address.toLowerCase() === a.toLowerCase())?.name),
    [own, contacts, t],
  );
  const { priceBySymbol, logoOf } = useMemo(() => {
    const prices = new Map<string, number>();
    const logos = new Map<string, string>();
    for (const h of holdings) {
      if (h.verified && h.price > 0 && !prices.has(h.symbol.toUpperCase())) prices.set(h.symbol.toUpperCase(), h.price);
      if (h.logo) logos.set(h.contract ? `${h.chainId}:${h.contract.toLowerCase()}` : `${h.chainId}:native`, h.logo);
    }
    return { priceBySymbol: prices, logoOf: (tx: TxSummary) => logos.get(tx.contract ? `${tx.chain}:${tx.contract.toLowerCase()}` : `${tx.chain}:native`) };
  }, [holdings]);

  const sym = fiatSymbol(fiat);
  const rows: Row[] = useMemo(() => txs.map((tx) => {
    const c = chainOf(tx.chain);
    const h = humanizeTx(tx, {
      t: activityT,
      nativeSymbol: c?.nativeSymbol ?? '',
      nativeDecimals: c?.nativeDecimals ?? 18,
      nativeOf: nativeOfChain,
      nameOf,
      spamOf,
      symbolOf: (chainId: string, contract: string) => holdings.find((x) => x.chainId === chainId && x.contract?.toLowerCase() === contract.toLowerCase())?.symbol,
      // Jamais de contre-valeur sur un réseau de test : ses jetons ne valent rien.
      fiatOf: c?.testnet ? undefined : (symbol: string, amount: number) => {
        const p = priceBySymbol.get(symbol.toUpperCase());
        return p ? `${formatFiat(amount * p)} ${sym}` : undefined;
      },
    });
    return { tx, h };
  }), [txs, activityT, nameOf, spamOf, holdings, priceBySymbol, sym]);

  const spamRows = rows.filter((r) => r.h.spam);
  const poisoned = spamRows.some((r) => r.h.spamReason === 'poisoning');
  const presentChains = useMemo(() => {
    const seen = new Set(rows.filter((r) => !r.h.spam).map((r) => r.tx.chain));
    return targets.map((x) => x.chain).filter((c) => seen.has(c.id));
  }, [rows, targets]);

  const q = query.trim().toLowerCase();
  const matches = useCallback((r: Row) => {
    if (!q) return true;
    return [r.h.label, r.h.title, r.h.subtitle, r.tx.asset, r.tx.hash, r.tx.from, r.tx.to, chainNameOf(r.tx.chain), ...(r.tx.legs ?? []).map((l) => l.asset)]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }, [q]);
  const visible = useMemo(() => rows.filter((r) => {
    if (r.h.spam) return false;
    if (onlyChain && r.tx.chain !== onlyChain) return false;
    if (filter === 'in' && r.tx.direction !== 'in') return false;
    if (filter === 'out' && r.tx.direction !== 'out') return false;
    if (filter === 'swap' && (r.tx.type ?? '').toUpperCase() !== 'SWAP') return false;
    return matches(r);
  }), [rows, onlyChain, filter, matches]);
  const shown = visible.slice(0, limit);
  const groups = groupByDay(shown.map((r) => ({ ...r, timestamp: r.tx.timestamp })), Date.now(), locale, { today: t('txToday'), yesterday: t('txYesterday') });
  const hiddenShown = showSpam ? spamRows.filter((r) => (!onlyChain || r.tx.chain === onlyChain) && matches(r)) : [];
  const unfiltered = filter === 'all' && onlyChain === null && !q;

  const exportCsv = () => {
    const clean = visible.map((r) => r.tx);
    if (clean.length === 0) return;
    const first = chainOf(clean[0].chain);
    const csv = transactionsToCsv(clean, {
      chainName: first?.name ?? '',
      nativeSymbol: first?.nativeSymbol ?? '',
      nativeDecimals: first?.nativeDecimals ?? 18,
      explorerUrl: first?.explorerUrl,
      chainOf: chainMetaOf,
    });
    if (downloadText('kalyx-history.csv', csv)) return;
    void Clipboard.setStringAsync(csv).then(() => toast.success(t('copied'))).catch(() => toast.error(t('exportFailed')));
  };

  const time = (tx: TxSummary) => new Date(tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const renderRow = (r: Row, last: boolean) => (
    <View key={`${r.tx.chain}:${r.tx.hash}`}>
      <ActivityRow
        h={r.h}
        time={time(r.tx)}
        network={onlyChain ? undefined : chainNameOf(r.tx.chain)}
        networkIcon={onlyChain ? undefined : chainIconUrl(r.tx.chain)}
        tokenLogo={logoOf(r.tx)}
        tokenSeed={r.tx.contract}
        pendingLabel={t('txPending')}
        spamText={r.h.spamReason ? t(SPAM_TEXT[r.h.spamReason]) : undefined}
        onPress={() => setDetail(r)}
      />
      {!last ? <Divider inset={68} /> : null}
    </View>
  );

  const detailChain = detail ? chainOf(detail.tx.chain) : undefined;
  const explorerTx = detail && detailChain?.explorerUrl ? `${detailChain.explorerUrl}/tx/${detail.tx.hash}` : null;
  const copy = async (v: string, msg: string) => { await Clipboard.setStringAsync(v); toast.success(msg); };
  const status = (tx: TxSummary) => (tx.status === 'failed' ? tw('txFailed') : tx.status === 'pending' ? tw('txPending') : tw('txSuccess'));

  if (txs.length === 0 && (loading || !attempted)) {
    return (
      <View style={{ gap: space[3] }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Skeleton width={36} height={36} round />
            <View style={{ flex: 1, gap: space[2] }}><Skeleton width="55%" /><Skeleton width="30%" height={12} /></View>
          </View>
        ))}
      </View>
    );
  }
  if (txs.length === 0) {
    return <MobileEmptyState icon="history" title={t('noActivityYet')} subtitle={t('noActivityBody')} action={{ label: t('receive'), onPress: onReceive }} />;
  }

  return (
    <View style={{ gap: space[3] }}>
      {poisoned ? (
        <Surface style={{ borderColor: colors.danger, gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="alert" size={18} color={colors.danger} />
            <Text variant="body" tone="danger" style={{ flex: 1 }}>{t('histPoisonTitle')}</Text>
          </View>
          <Text variant="caption" tone="secondary">{t('histPoisonBody')}</Text>
        </Surface>
      ) : null}
      <Input placeholder={t('histSearch')} value={query} onChangeText={(v) => { setQuery(v); setLimit(PAGE); }} autoCapitalize="none" />
      <SegmentedControl
        items={[
          { key: 'all', label: t('filterAll') },
          { key: 'in', label: t('filterReceived') },
          { key: 'out', label: t('filterSent') },
          { key: 'swap', label: t('filterSwaps') },
        ]}
        value={filter}
        onChange={(k) => { setFilter(k); setLimit(PAGE); }}
      />
      {presentChains.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <Chip label={t('filterAllNetworks')} selected={onlyChain === null} onPress={() => setOnlyChain(null)} />
          {presentChains.map((c) => (
            <Chip key={c.id} label={c.name} selected={onlyChain === c.id} onPress={() => { setOnlyChain(onlyChain === c.id ? null : c.id); setLimit(PAGE); }} />
          ))}
        </ScrollView>
      ) : null}

      {visible.length === 0 ? (
        <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', paddingVertical: space[4] }}>{unfiltered ? t('noActivityYet') : t('nothingForFilter')}</Text>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={{ gap: space[1] }}>
            <Text variant="micro" tone="tertiary" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.label}</Text>
            <Surface padded={false}>{g.items.map((r, i) => renderRow(r, i === g.items.length - 1))}</Surface>
          </View>
        ))
      )}
      {visible.length > limit ? (
        <Pressable onPress={() => setLimit((n) => n + PAGE)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
          <Text variant="caption" style={{ color: colors.primary }}>{tw('showMore')}</Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[4] }}>
        {spamRows.length > 0 ? (
          <Pressable onPress={() => setShowSpam((v) => !v)} style={{ paddingVertical: space[1] }}>
            <Text variant="caption" tone="tertiary">{showSpam ? t('histHiddenHide') : t('histHiddenShow').replace('{count}', String(spamRows.length))}</Text>
          </Pressable>
        ) : null}
        {visible.length > 0 ? (
          <Pressable onPress={exportCsv} style={{ paddingVertical: space[1], flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="share" size={14} color={colors.textTertiary} />
            <Text variant="caption" tone="tertiary">{t('exportCsv')}</Text>
          </Pressable>
        ) : null}
      </View>
      {hiddenShown.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('histHiddenNote')}</Text>
          <Surface padded={false} style={{ opacity: 0.75 }}>{hiddenShown.map((r, i) => renderRow(r, i === hiddenShown.length - 1))}</Surface>
        </View>
      ) : null}

      <Sheet visible={!!detail} onClose={() => setDetail(null)}>
        {detail ? (
          <>
            <Text variant="title2">{detail.h.title}</Text>
            {detail.h.amount ? <Text variant="body" tabular>{detail.h.amount}{detail.h.fiat ? `  ·  ${detail.h.fiat}` : ''}</Text> : null}
            <Surface padded={false}>
              <ListRow title={tw('txStatus')} right={<Text variant="body" tone={detail.tx.status === 'failed' ? 'danger' : detail.tx.status === 'pending' ? 'warning' : 'up'}>{status(detail.tx)}</Text>} />
              <Divider inset={16} />
              <ListRow title={tw('txDate')} right={<Text variant="body">{new Date(detail.tx.timestamp * 1000).toLocaleString(locale)}</Text>} />
              <Divider inset={16} />
              <ListRow title={t('labelNetwork')} right={<Text variant="body">{detailChain?.name ?? detail.tx.chain}</Text>} />
              <Divider inset={16} />
              <ListRow title={tw('txFrom')} subtitle={shortAddress(detail.tx.from)} onPress={() => copy(detail.tx.from, t('addressCopied'))} right={<Icon name="copy" size={14} color={colors.textTertiary} />} />
              <Divider inset={16} />
              <ListRow title={tw('txTo')} subtitle={shortAddress(detail.tx.to)} onPress={() => copy(detail.tx.to, t('addressCopied'))} right={<Icon name="copy" size={14} color={colors.textTertiary} />} />
              <Divider inset={16} />
              <ListRow title={tw('txHash')} subtitle={shortAddress(detail.tx.hash)} onPress={() => copy(detail.tx.hash, tw('hashCopied'))} right={<Icon name="copy" size={14} color={colors.textTertiary} />} />
            </Surface>
            {explorerTx ? (
              <Button label={tw('openExplorer')} variant="secondary" onPress={() => { const w = (globalThis as { open?: (u: string, target?: string, features?: string) => unknown }).open; w?.(explorerTx, '_blank', 'noopener,noreferrer'); }} />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
