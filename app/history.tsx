import { useT, useActivityT, useSettings } from "../lib/settingsStore";

const LANG_LOCALES: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  hi: 'hi-IN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
};
/**
 * Activité (§4.6) — tout est traduit en humain, regroupé par Aujourd'hui /
 * Hier / date. Les échecs disent pourquoi ; les transferts spam à 0 sont
 * masqués (réglage pour les voir). Export CSV conservé.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, Share } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, IconButton, Surface, Divider, Chip, Skeleton, EmptyState, ActivityRow, Pressable } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { FadeInUp } from '../ui/FadeInUp';
import { cascadeDelay } from '../ui/motion';
import { useWallet } from '../lib/walletStore';
import { useHistoryStore, useHistoryCache, cacheKey } from '../lib/historyStore';
import { useContacts } from '../lib/contactsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import {
  getAdapter,
  listChains,
  chainNameOf,
  chainMetaOf,
  chainIconUrl,
  nativeOfChain,
  transactionsToCsv,
  humanizeTx,
  groupByDay,
  type TxSummary,
} from '../src';
import { BtcAccelerate } from '../ui/BtcAccelerate';

type Filter = 'all' | 'in' | 'out' | 'failed';

export default function History() {
  const t = useT();
  const activityT = useActivityT();
  const language = useSettings((s) => s.language);
  const locale = LANG_LOCALES[language] || 'en-US';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useWallet((s) => s.accounts);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  const contacts = useContacts((s) => s.contacts);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const [filter, setFilter] = useState<Filter>('all');
  /** Réseau retenu, ou `null` pour tous. */
  const [onlyChain, setOnlyChain] = useState<string | null>(null);
  const [showSpam, setShowSpam] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /*
   * TOUS LES RÉSEAUX, comme l'accueil.
   *
   * Cet écran ne montrait que le réseau actif alors qu'on y arrive par
   * « Historique complet », depuis une liste qui, elle, agrège tout : le lien
   * promettait davantage et menait à moins. Les adresses diffèrent par famille,
   * d'où la résolution par famille plutôt que `account.address`, qui suit le
   * réseau affiché.
   */
  const acct = useWallet((s) => s.accounts.find((a) => a.index === s.activeAccountIndex) ?? s.accounts[0]);
  const chains = useMemo(() => listChains({ includeTestnets: false }), []);
  const addressFor = useCallback(
    (family: string) => (family === 'solana' ? acct?.solAddress : family === 'bitcoin' ? acct?.btcAddress : acct?.evmAddress),
    [acct?.evmAddress, acct?.solAddress, acct?.btcAddress],
  );

  /*
   * ABONNEMENT AU CACHE, et non à `getCached`.
   *
   * L'écran sélectionnait la FONCTION `getCached`, qui ne change jamais : quand
   * le réseau répondait et remplissait le cache, rien ne provoquait de rendu et
   * la liste restait vide. Toucher un filtre en déclenchait un, et les
   * transactions apparaissaient d'un coup — « Tout » paraissait vide alors que
   * « Envoyé » et « Reçu » étaient pleins, sans que le filtre y soit pour quoi
   * que ce soit.
   */
  const cache = useHistoryCache();
  const cached: TxSummary[] = useMemo(() => {
    const seen = new Map<string, TxSummary>();
    for (const c of chains) {
      const address = addressFor(c.family);
      if (!address) continue;
      for (const tx of cache[cacheKey(c.id, address)] ?? []) seen.set(`${tx.chain}:${tx.hash}`, tx);
    }
    return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [cache, chains, addressFor]);

  const loading = useHistoryStore((s) =>
    chains.some((c) => {
      const address = addressFor(c.family);
      return address ? s.loading[cacheKey(c.id, address)] === true : false;
    }),
  );

  const load = useCallback(async () => {
    await Promise.all(
      chains.map((c) => {
        const address = addressFor(c.family);
        return address ? fetchHistory(c.id, address).catch(() => {}) : Promise.resolve();
      }),
    );
  }, [chains, addressFor, fetchHistory]);
  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (a: string) => {
      const l = a.toLowerCase();
      if (accounts.some((x) => x.evmAddress.toLowerCase() === l || x.solAddress?.toLowerCase() === l || x.btcAddress.toLowerCase() === l)) return t('actYou');
      return contacts.find((c) => c.address.toLowerCase() === l)?.name;
    },
    [accounts, contacts],
  );

  const rows = useMemo(() => {
    const ctx = {
      t: activityT,
      // Repli seulement : `nativeOf` tranche ligne par ligne.
      nativeSymbol: chain.nativeSymbol,
      nativeDecimals: chain.nativeDecimals,
      nativeOf: nativeOfChain,
      nameOf,
    };
    return cached.map((tx) => ({ tx, h: humanizeTx(tx, ctx) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cached, chain.nativeSymbol, chain.nativeDecimals, nameOf]);
  const spamCount = rows.filter((r) => r.h.spam).length;

  /*
   * Réseaux RÉELLEMENT présents dans les données, dans l'ordre du registre. On
   * ne propose pas de filtrer sur un réseau dont il n'y a rien à montrer : le
   * filtre rendrait une liste vide sans expliquer pourquoi.
   */
  const presentChains = useMemo(() => {
    const seen = new Set(rows.map((r) => r.tx.chain));
    return chains.filter((c) => seen.has(c.id));
  }, [rows, chains]);

  const filtered = rows.filter((r) => {
    if (r.h.spam && !showSpam) return false;
    if (onlyChain && r.tx.chain !== onlyChain) return false;
    if (filter === 'in') return r.tx.direction === 'in';
    if (filter === 'out') return r.tx.direction === 'out';
    if (filter === 'failed') return r.h.failed;
    return true;
  });
  const groups = useMemo(
    () => groupByDay(filtered.map((r) => ({ ...r, timestamp: r.tx.timestamp })), Date.now(), locale, { today: t('txToday'), yesterday: t('txYesterday') }),
    [filtered, locale, t],
  );

  const exportCsv = async () => {
    if (cached.length === 0) return;
    const csv = transactionsToCsv(cached, {
      chainName: chain.name,
      nativeSymbol: chain.nativeSymbol,
      nativeDecimals: chain.nativeDecimals,
      explorerUrl: chain.explorerUrl,
      // L'export couvre plusieurs réseaux : chaque ligne porte le sien.
      chainOf: chainMetaOf,
    });
    try {
      await Share.share({ message: csv, title: 'kalyx-history.csv' });
    } catch {
      toast.error(t("exportFailed"));
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t("filterAll") },
    { key: 'in', label: t("filterReceived") },
    { key: 'out', label: t("filterSent") },
    { key: 'failed', label: t("filterFailed") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <Text variant="title2">{t("activity")}</Text>
          <Text variant="micro" tone="tertiary">
            {onlyChain ? (chainNameOf(onlyChain) ?? onlyChain) : t('filterAllNetworks')}
          </Text>
        </View>
        <IconButton icon="share" label={t("exportCsv")} tone="ghost" onPress={exportCsv} disabled={cached.length === 0} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[4] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { haptic.light(); setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.textSecondary} colors={[colors.textSecondary]} />}
      >
        {/* Transaction Bitcoin coincée : proposée à l'accélération, en tête,
            parce que c'est la seule chose qu'on puisse encore faire pour elle. */}
        <BtcAccelerate />

        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          {filters.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </View>

        {/*
          Filtre par réseau, affiché seulement s'il y a plus d'un réseau à
          départager. Avec un seul, la rangée n'offrirait aucun choix.
        */}
        {presentChains.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Chip label={t('filterAllNetworks')} selected={onlyChain === null} onPress={() => setOnlyChain(null)} />
            {presentChains.map((c) => (
              <Chip key={c.id} label={c.name} selected={onlyChain === c.id} onPress={() => setOnlyChain(c.id)} />
            ))}
          </View>
        ) : null}

        {loading && cached.length === 0 ? (
          <Surface padded={false}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="65%" /><Skeleton width="35%" height={12} /></View>)}</Surface>
        ) : groups.length === 0 ? (
          <Surface>
            {/*
              « Rien pour ce filtre » n'est pas « rien du tout » : un filtre actif
              explique le vide, et proposer « Recevoir » dans ce cas enverrait
              chercher un problème qui n'existe pas.
            */}
            {(() => {
              const unfiltered = filter === 'all' && onlyChain === null;
              return (
                <EmptyState
                  icon="history"
                  title={unfiltered ? t('noActivityYet') : t('nothingForFilter')}
                  body={unfiltered ? t('noActivityBody') : undefined}
                  actionLabel={unfiltered ? t('receive') : undefined}
                  onAction={unfiltered ? () => router.push('/receive') : undefined}
                />
              );
            })()}
          </Surface>
        ) : (
          groups.map((g) => (
            <View key={g.label} style={{ gap: space[2] }}>
              <Text variant="caption" tone="secondary">{g.label}</Text>
              <Surface padded={false}>
                {/* Cascade à l'arrivée, comme sur l'accueil : au-delà de douze
                    lignes le décalage vaut zéro, une liste ne doit pas se faire
                    attendre pour le plaisir du mouvement. */}
                {g.items.map((r, i) => (
                  <FadeInUp key={`${r.tx.chain}:${r.tx.hash}`} delay={cascadeDelay(i)}>
                    <ActivityRow
                      h={r.h}
                      time={new Date(r.tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      /*
                        Le réseau n'est montré que quand la liste en mêle
                        plusieurs : filtrée sur un seul, l'en-tête le dit déjà et
                        le répéter à chaque ligne n'apporte rien.
                      */
                      network={onlyChain ? undefined : chainNameOf(r.tx.chain)}
                      networkIcon={onlyChain ? undefined : chainIconUrl(r.tx.chain)}
                      pendingLabel={t('txPending')}
                      /* LA chaîne de la transaction, pas le réseau affiché : le
                         suivi interrogeait sinon le mauvais explorateur. */
                      onPress={() => router.push({ pathname: '/tracking', params: { hash: r.tx.hash, chainId: r.tx.chain } })}
                    />
                    {i < g.items.length - 1 ? <Divider inset={68} /> : null}
                  </FadeInUp>
                ))}
              </Surface>
            </View>
          ))
        )}

        {spamCount > 0 ? (
          <Pressable onPress={() => setShowSpam((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
            <Text variant="caption" tone="secondary">{showSpam ? t('hideZeroTransfers') : t('showZeroTransfers').replace('{count}', String(spamCount))}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
