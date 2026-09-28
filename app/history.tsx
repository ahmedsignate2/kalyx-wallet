/**
 * Activité — refaite.
 *
 * L'ancien écran empilait toutes les transactions de tous les réseaux, spam
 * compris : les tokens « visitez ce site », les transferts à zéro et les sosies
 * d'adresses occupaient la moitié de la liste, et chaque ligne répétait son
 * montant dans le titre et à droite. Ici :
 *   - le tri anti-spam se fonde sur l'ADRESSE du token et sur l'historique
 *     réel de l'utilisateur (voir `src/domain/tx/spam.ts`), pas sur un symbole
 *     que n'importe qui peut copier ;
 *   - les lignes suspectes sont repliées en bas, avec leur raison ;
 *   - une tentative d'empoisonnement d'adresse est signalée en tête ;
 *   - une ligne = un verbe, une contrepartie, un montant — lisible d'un coup d'œil ;
 *   - la liste est virtualisée (SectionList) : fluide même avec des centaines de lignes.
 */
import { journal } from '../lib/debugJournal';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, SectionList, RefreshControl, Share, ScrollView } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, IconButton, Surface, Divider, Chip, Skeleton, EmptyState, ActivityRow, Pressable, Input, SegmentedControl } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radius, SCREEN_MARGIN } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useHistoryStore, useHistoryCache, cacheKey, type HistoryChain } from '../lib/historyStore';
import { addressForChain } from '../lib/accountAddress';
import { useContacts } from '../lib/contactsStore';
import { usePortfolioStore } from '../lib/portfolio';
import { useSpamOf, useHistoryChains } from '../lib/historySpam';
import { useT, useActivityT, useSettings, fiatSymbol } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import {
  getAdapter,
  chainNameOf,
  chainMetaOf,
  chainIconUrl,
  nativeOfChain,
  transactionsToCsv,
  humanizeTx,
  groupByDay,
  formatFiat,
  type TxSummary,
  type HumanTx,
} from '../src';
import { BtcAccelerate } from '../ui/BtcAccelerate';

const LANG_LOCALES: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', it: 'it-IT', nl: 'nl-NL', pl: 'pl-PL',
  tr: 'tr-TR', ru: 'ru-RU', ar: 'ar-SA', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
};

type Filter = 'all' | 'in' | 'out' | 'swap';
type Row = { tx: TxSummary; h: HumanTx };

const SPAM_TEXT = { poisoning: 'spamPoisoning', scamName: 'spamScamName', zeroValue: 'spamZeroValue', unverifiedToken: 'spamUnverified' } as const;

export default function History() {
  const t = useT();
  const activityT = useActivityT();
  const language = useSettings((s) => s.language);
  const fiat = useSettings((s) => s.fiat);
  const locale = LANG_LOCALES[language] || 'en-US';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useWallet((s) => s.accounts);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  const contacts = useContacts((s) => s.contacts);
  const holdings = usePortfolioStore((s) => s.holdings);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyChain, setOnlyChain] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showSpam, setShowSpam] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Tous les réseaux : les adresses diffèrent par famille.
  const acct = useWallet((s) => s.accounts.find((a) => a.index === s.activeAccountIndex) ?? s.accounts[0]);
  const chains = useHistoryChains();
  const addressFor = useCallback((c: HistoryChain) => addressForChain(acct, c) || undefined, [acct]);

  // Abonnement au CACHE (réactif), pas à `getCached` (fonction stable).
  const cache = useHistoryCache();
  const cached: TxSummary[] = useMemo(() => {
    const seen = new Map<string, TxSummary>();
    for (const c of chains) {
      const address = addressFor(c);
      if (!address) continue;
      for (const tx of cache[cacheKey(c.id, address)] ?? []) seen.set(`${tx.chain}:${tx.hash}`, tx);
    }
    return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [cache, chains, addressFor]);

  const loading = useHistoryStore((s) =>
    chains.some((c) => {
      const address = addressFor(c);
      return address ? s.loading[cacheKey(c.id, address)] === true : false;
    }),
  );

  const load = useCallback(
    async (force = false) => {
      await Promise.all(
        chains.map((c) => {
          const address = addressFor(c);
          return address ? fetchHistory(c.id, address, { force }).catch(() => {}) : Promise.resolve();
        }),
      );
    },
    [chains, addressFor, fetchHistory],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (a: string) => {
      const l = a.toLowerCase();
      if (accounts.some((x) => x.evmAddress.toLowerCase() === l || x.solAddress?.toLowerCase() === l || x.btcAddress.toLowerCase() === l)) return t('actYou');
      return contacts.find((c) => c.address.toLowerCase() === l)?.name;
    },
    [accounts, contacts, t],
  );

  // Prix et logos du portefeuille : contre-valeur des tokens VÉRIFIÉS, icône des lignes.
  const { priceBySymbol, logoOf } = useMemo(() => {
    const prices = new Map<string, number>();
    const logos = new Map<string, string>();
    for (const h of holdings) {
      if (h.verified && h.price > 0 && !prices.has(h.symbol.toUpperCase())) prices.set(h.symbol.toUpperCase(), h.price);
      if (h.logo) logos.set(h.contract ? `${h.chainId}:${h.contract.toLowerCase()}` : `${h.chainId}:native`, h.logo);
    }
    return {
      priceBySymbol: prices,
      logoOf: (tx: TxSummary) => logos.get(tx.contract ? `${tx.chain}:${tx.contract.toLowerCase()}` : `${tx.chain}:native`),
    };
  }, [holdings]);

  const spamOf = useSpamOf(cached);
  const sym = fiatSymbol(fiat);
  const rows: Row[] = useMemo(() => {
    const ctx = {
      t: activityT,
      nativeSymbol: chain.nativeSymbol,
      nativeDecimals: chain.nativeDecimals,
      nativeOf: nativeOfChain,
      nameOf,
      spamOf,
      symbolOf: (c: string, contract: string) => holdings.find((x) => x.chainId === c && x.contract?.toLowerCase() === contract.toLowerCase())?.symbol,
      fiatOf: (symbol: string, amount: number) => {
        const p = priceBySymbol.get(symbol.toUpperCase());
        return p ? `${formatFiat(amount * p)} ${sym}` : undefined;
      },
    };
    return cached.map((tx) => ({ tx, h: humanizeTx(tx, ctx) }));
  }, [cached, activityT, chain.nativeSymbol, chain.nativeDecimals, nameOf, spamOf, priceBySymbol, sym, holdings]);

  const spamRows = rows.filter((r) => r.h.spam);
  const poisoned = spamRows.some((r) => r.h.spamReason === 'poisoning');

  // Réseaux réellement présents (hors spam) : pas de filtre qui mène au vide.
  const presentChains = useMemo(() => {
    const seen = new Set(rows.filter((r) => !r.h.spam).map((r) => r.tx.chain));
    return chains.filter((c) => seen.has(c.id));
  }, [rows, chains]);

  const q = query.trim().toLowerCase();
  const matches = (r: Row) => {
    if (!q) return true;
    const hay = [r.h.label, r.h.title, r.h.subtitle, r.tx.asset, r.tx.hash, r.tx.from, r.tx.to, chainNameOf(r.tx.chain), ...(r.tx.legs ?? []).map((l) => l.asset)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  };
  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (r.h.spam) return false;
        if (onlyChain && r.tx.chain !== onlyChain) return false;
        if (filter === 'in' && r.tx.direction !== 'in') return false;
        if (filter === 'out' && r.tx.direction !== 'out') return false;
        if (filter === 'swap' && (r.tx.type ?? '').toUpperCase() !== 'SWAP') return false;
        return matches(r);
      }),
    // `matches` ne dépend que de `q`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, onlyChain, filter, q],
  );
  const sections = useMemo(
    () =>
      groupByDay(visible.map((r) => ({ ...r, timestamp: r.tx.timestamp })), Date.now(), locale, { today: t('txToday'), yesterday: t('txYesterday') }).map((g) => ({
        title: g.label,
        data: g.items,
      })),
    [visible, locale, t],
  );
  const hiddenShown = showSpam ? spamRows.filter((r) => (!onlyChain || r.tx.chain === onlyChain) && matches(r)) : [];

  const exportCsv = async () => {
    const clean = rows.filter((r) => !r.h.spam).map((r) => r.tx);
    if (clean.length === 0) return;
    const csv = transactionsToCsv(clean, {
      chainName: chain.name,
      nativeSymbol: chain.nativeSymbol,
      nativeDecimals: chain.nativeDecimals,
      explorerUrl: chain.explorerUrl,
      chainOf: chainMetaOf,
    });
    try {
      await Share.share({ message: csv, title: 'kalyx-history.csv' });
    } catch {
      toast.error(t('exportFailed'));
    }
  };

  const open = (tx: TxSummary) => router.push({ pathname: '/tracking', params: { hash: tx.hash, chainId: tx.chain } });
  const time = (tx: TxSummary) => new Date(tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const renderRow = (r: Row, last: boolean) => (
    <View style={{ backgroundColor: colors.surface1 }}>
      <ActivityRow
        h={r.h}
        time={time(r.tx)}
        network={onlyChain ? undefined : chainNameOf(r.tx.chain)}
        networkIcon={onlyChain ? undefined : chainIconUrl(r.tx.chain)}
        tokenLogo={logoOf(r.tx)}
        tokenSeed={r.tx.contract}
        pendingLabel={t('txPending')}
        spamText={r.h.spamReason ? t(SPAM_TEXT[r.h.spamReason]) : undefined}
        onPress={() => open(r.tx)}
      />
      {!last ? <Divider inset={68} /> : null}
    </View>
  );

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[2] }}>
      <BtcAccelerate />
      {poisoned ? (
        <Surface style={{ borderColor: colors.danger, gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="alert" size={18} color={colors.danger} />
            <Text variant="body" tone="danger" style={{ flex: 1 }}>{t('histPoisonTitle')}</Text>
          </View>
          <Text variant="caption" tone="secondary">{t('histPoisonBody')}</Text>
        </Surface>
      ) : null}
      <Input value={query} onChangeText={setQuery} placeholder={t('histSearch')} autoCapitalize="none" autoCorrect={false} right={query ? <IconButton icon="close" label={t('actionCancel')} tone="ghost" onPress={() => setQuery('')} /> : <Icon name="search" size={18} tone="muted" />} />
      <SegmentedControl
        items={[
          { key: 'all', label: t('filterAll') },
          { key: 'in', label: t('filterReceived') },
          { key: 'out', label: t('filterSent') },
          { key: 'swap', label: t('filterSwaps') },
        ]}
        value={filter}
        onChange={(k) => { haptic.selection(); setFilter(k); }}
      />
      {presentChains.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} style={{ marginHorizontal: -SCREEN_MARGIN }}>
          <View style={{ width: SCREEN_MARGIN - space[2] }} />
          <Chip label={t('filterAllNetworks')} selected={onlyChain === null} onPress={() => setOnlyChain(null)} />
          {presentChains.map((c) => (
            <Chip key={c.id} label={c.name} selected={onlyChain === c.id} onPress={() => setOnlyChain(onlyChain === c.id ? null : c.id)} />
          ))}
          <View style={{ width: SCREEN_MARGIN - space[2] }} />
        </ScrollView>
      ) : null}
    </View>
  );

  const unfiltered = filter === 'all' && onlyChain === null && !q;
  const empty =
    loading && cached.length === 0 ? (
      <Surface padded={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ height: 64, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Skeleton width={40} height={40} round />
            <View style={{ flex: 1, gap: space[2] }}><Skeleton width="45%" /><Skeleton width="30%" height={12} /></View>
          </View>
        ))}
      </Surface>
    ) : (
      <Surface>
        <EmptyState
          icon="history"
          title={unfiltered ? t('noActivityYet') : t('nothingForFilter')}
          body={unfiltered ? t('noActivityBody') : undefined}
          actionLabel={unfiltered ? t('receive') : undefined}
          onAction={unfiltered ? () => router.push('/receive') : undefined}
        />
      </Surface>
    );

  const footer = (
    <View style={{ gap: space[3], paddingTop: space[4] }}>
      {spamRows.length > 0 ? (
        <Pressable onPress={() => { haptic.selection(); setShowSpam((v) => !v); }} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], paddingHorizontal: space[4], borderRadius: radius.round, backgroundColor: colors.surface2 }}>
          <Icon name={showSpam ? 'eyeOff' : 'eye'} size={14} tone="muted" />
          <Text variant="caption" tone="secondary">{showSpam ? t('histHiddenHide') : t('histHiddenShow').replace('{count}', String(spamRows.length))}</Text>
        </Pressable>
      ) : null}
      {showSpam && hiddenShown.length > 0 ? (
        <>
          <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{t('histHiddenNote')}</Text>
          <Surface padded={false}>{hiddenShown.map((r, i) => <React.Fragment key={`${r.tx.chain}:${r.tx.hash}`}>{renderRow(r, i === hiddenShown.length - 1)}</React.Fragment>)}</Surface>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t('back')} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <Text variant="title2">{t('activity')}</Text>
          <Text variant="micro" tone="tertiary">{onlyChain ? (chainNameOf(onlyChain) ?? onlyChain) : t('filterAllNetworks')}</Text>
        </View>
        <IconButton icon="share" label={t('exportCsv')} tone="ghost" onPress={exportCsv} disabled={cached.length === 0} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(r) => `${r.tx.chain}:${r.tx.hash}`}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View style={{ borderTopLeftRadius: first ? radius.container : 0, borderTopRightRadius: first ? radius.container : 0, borderBottomLeftRadius: last ? radius.container : 0, borderBottomRightRadius: last ? radius.container : 0, overflow: 'hidden', borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: last ? 1 : 0 }}>
              {renderRow(item, last)}
            </View>
          );
        }}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: colors.bg, paddingTop: space[4], paddingBottom: space[2] }}>
            <Text variant="caption" tone="secondary">{section.title}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6] }}
        initialNumToRender={14}
        /*
         * STABILITÉ EN BAS DE LISTE (Android). Le retrait des lignes hors écran
         * (`removeClippedSubviews`, actif par défaut sur Android) combiné aux
         * en-têtes de date collants et à une fenêtre courte faisait remesurer
         * les lignes en boucle : l'écran montait et descendait tout seul en bas
         * de « Envoyés ». Quelques centaines de lignes tiennent sans ces économies.
         */
        removeClippedSubviews={false}
        windowSize={21}
        maxToRenderPerBatch={20}
        // Journal : si la hauteur du contenu oscille, la cause est là.
        onContentSizeChange={(_w, h) => journal('state', `historique : hauteur du contenu ${Math.round(h)} (filtre ${filter})`)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              haptic.light();
              setRefreshing(true);
              await load(true);
              setRefreshing(false);
            }}
            tintColor={colors.textSecondary}
            colors={[colors.textSecondary]}
          />
        }
      />
    </View>
  );
}
