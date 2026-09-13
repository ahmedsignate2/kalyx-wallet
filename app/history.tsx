import { useT, useSettings } from "../lib/settingsStore";

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
import { useWallet } from '../lib/walletStore';
import { useHistoryStore } from '../lib/historyStore';
import { useContacts } from '../lib/contactsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { getAdapter, transactionsToCsv, humanizeTx, groupByDay, type TxSummary } from '../src';

type Filter = 'all' | 'in' | 'out' | 'failed';

export default function History() {
  const t = useT();
  const language = useSettings((s) => s.language);
  const locale = LANG_LOCALES[language] || 'en-US';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useWallet((s) => s.account);
  const accounts = useWallet((s) => s.accounts);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  const contacts = useContacts((s) => s.contacts);
  const getCached = useHistoryStore((s) => s.getCached);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const isLoading = useHistoryStore((s) => s.isLoading);
  const [filter, setFilter] = useState<Filter>('all');
  const [showSpam, setShowSpam] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cached: TxSummary[] = account ? getCached(activeChain, account.address) : [];
  const loading = account ? isLoading(activeChain, account.address) : false;

  const load = useCallback(async () => {
    if (!account) return;
    await fetchHistory(activeChain, account.address).catch(() => {});
  }, [account, activeChain, fetchHistory]);
  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (a: string) => {
      const l = a.toLowerCase();
      if (accounts.some((x) => x.evmAddress.toLowerCase() === l || x.solAddress?.toLowerCase() === l || x.btcAddress.toLowerCase() === l)) return 'toi';
      return contacts.find((c) => c.address.toLowerCase() === l)?.name;
    },
    [accounts, contacts],
  );

  const rows = useMemo(() => {
    const ctx = { nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals, nameOf };
    return cached.map((tx) => ({ tx, h: humanizeTx(tx, ctx) }));
  }, [cached, chain.nativeSymbol, chain.nativeDecimals, nameOf]);
  const spamCount = rows.filter((r) => r.h.spam).length;
  const filtered = rows.filter((r) => {
    if (r.h.spam && !showSpam) return false;
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
    const csv = transactionsToCsv(cached, { chainName: chain.name, nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals, explorerUrl: chain.explorerUrl });
    try {
      await Share.share({ message: csv, title: `kalyx-history-${chain.id}.csv` });
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
          <Text variant="micro" tone="tertiary">{chain.name}</Text>
        </View>
        <IconButton icon="share" label={t("exportCsv")} tone="ghost" onPress={exportCsv} disabled={cached.length === 0} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[4] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { haptic.light(); setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.textSecondary} colors={[colors.textSecondary]} />}
      >
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          {filters.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </View>

        {loading && cached.length === 0 ? (
          <Surface padded={false}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="65%" /><Skeleton width="35%" height={12} /></View>)}</Surface>
        ) : groups.length === 0 ? (
          <Surface>
            <EmptyState icon="history" title={filter === 'all' ? t("noActivityYet") : t("nothingForFilter")} body={filter === 'all' ? `Tes transactions sur ${chain.name} apparaîtront ici. Partage ton adresse pour recevoir.` : undefined} actionLabel={filter === 'all' ? t("receive") : undefined} onAction={filter === 'all' ? () => router.push('/receive') : undefined} />
          </Surface>
        ) : (
          groups.map((g) => (
            <View key={g.label} style={{ gap: space[2] }}>
              <Text variant="caption" tone="secondary">{g.label}</Text>
              <Surface padded={false}>
                {g.items.map((r, i) => (
                  <React.Fragment key={r.tx.hash + i}>
                    <ActivityRow
                      h={r.h}
                      time={new Date(r.tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      onPress={chain.explorerUrl ? () => router.push({ pathname: '/browser', params: { url: `${chain.explorerUrl}/tx/${r.tx.hash}` } }) : undefined}
                    />
                    {i < g.items.length - 1 ? <Divider inset={68} /> : null}
                  </React.Fragment>
                ))}
              </Surface>
            </View>
          ))
        )}

        {spamCount > 0 ? (
          <Pressable onPress={() => setShowSpam((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
            <Text variant="caption" tone="secondary">{showSpam ? t("hideZeroTransfers") : `Afficher ${spamCount} transfert${spamCount > 1 ? 's' : ''} à 0 (spam probable)`}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
