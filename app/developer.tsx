/**
 * DÉVELOPPEUR — outils de diagnostic, en onglets.
 *
 *  Environnement : Mainnet/Testnets (bascule le réseau actif vers l'équivalent),
 *                  interrupteur du journal, version, services, soldes, maintenance.
 *  Réseaux       : RPC de chaque chaîne, santé (mémoire de net.ts), latence à la
 *                  demande, épingle « en premier » (lib/rpcOverridesStore.ts).
 *  Console       : technicalLogger en direct (formatCondensedLog), filtres, pause.
 *  Réseau        : moniteur fetch (lib/netMonitor.ts) — hôte, méthode, statut,
 *                  durée, taille ; p50 et taux d'échec par hôte.
 *  État          : inspecteur en lecture seule, LISTE BLANCHE de champs.
 *  Export        : un JSON assaini, aperçu avant partage.
 *
 * Accès : mode expert exigé, puis confirmation PIN/biométrie à l'entrée.
 * Garde-fous : aucune adresse complète, clé, phrase, montant ni URL à jeton
 * affichés ; abonnements actifs seulement tant que l'écran (et l'onglet) est ouvert.
 */
import { NovaHero, SectionLabel, SettingRow, TextTabs } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Button, Card, Chip, Notice, Screen, Switch, SegmentedControl } from '../ui/kit';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, Share, Platform } from 'react-native';
import { usePortfolioDiag, diagText } from '../lib/portfolio/diagnostics';
import * as Clipboard from 'expo-clipboard';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme, fontSize, radii } from '../ui/theme';
import { useCustomChains } from '../lib/customChainsStore';
import { useSettings, useT } from '../lib/settingsStore';
import { useNotifCenter } from '../lib/notificationCenter';
import { toast } from '../lib/toast';
import { useWallet, DEFAULT_CHAIN } from '../lib/walletStore';
import { useWalletConnect } from '../lib/walletconnect';
import { isDecoySession } from '../lib/sessionMode';
import { listChains, hasChain, getAdapter } from '../src';
import { rpcHealthSnapshot, type RpcHealthState } from '../src/domain/chains/net';
import { testRpcEndpoint, collectDiagnosticData } from '../src/services/support/diagnosticService';
import { useRpcOverrides, displayRpcUrl, healthKeyOf, counterpartChain, applyPins } from '../lib/rpcOverridesStore';
import { technicalLogger, formatCondensedLog, buildDiagnosticExport, type LogEntry } from '../lib/technicalLogger';
import { netEntries, subscribeNet, hostStats, clearNetEntries, type NetEntry } from '../lib/netMonitor';
import { journalLines, formatLine } from '../lib/debugJournal';
import { goBack } from '../lib/nav';

type Tab = 'env' | 'networks' | 'console' | 'traffic' | 'state' | 'export';
type Colors = ReturnType<typeof useTheme>['colors'];
type Typo = ReturnType<typeof useTheme>['typography'];
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** Réglages NON sensibles montrés dans l'inspecteur et l'export (liste blanche). */
const SETTINGS_WHITELIST = [
  'language', 'fiat', 'uiMode', 'themePref', 'showTestnets', 'securityScan', 'autoLockMinutes', 'privacyGuard',
  'biometricEnabled', 'notifTx', 'notifPrice', 'soundEnabled', 'hapticsEnabled', 'aiToolsEnabled', 'debugJournalEnabled',
] as const;

/** Rafraîchit au plus toutes les `ms`, seulement tant que le composant est monté et non en pause. */
function useThrottledTick(subscribe: (fn: () => void) => () => void, paused: boolean, ms = 500): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setTick((n) => n + 1);
      }, ms);
    });
    setTick((n) => n + 1); // reprise : rattrape ce qui est arrivé pendant la pause
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [subscribe, paused, ms]);
  return tick;
}

export default function Developer() {
  const t = useT();
  const tx = useCallback((k: string) => t(k as never), [t]);
  const { colors, typography } = useTheme();
  const uiMode = useSettings((s) => s.uiMode);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('env');

  // Mode expert exigé, même si la route est ouverte directement.
  if (uiMode !== 'expert') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen>
          <ScreenHeader />
          <NovaHero icon="developer" title={t('developer')} subtitle={t('developerSub')} />
          <Notice tone="warning" message={tx('dxExpertRequired')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={false}>
        <ScreenHeader />
        <NovaHero compact icon="developer" title={t('developer')} subtitle={t('developerSub')} />
        {authed ? (
          <View style={{ flex: 1, gap: spacing(1.5) }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <TextTabs
                items={[
                  { key: 'env', label: tx('dxTabEnv') },
                  { key: 'networks', label: tx('dxTabNetworks') },
                  { key: 'console', label: tx('dxTabConsole') },
                  { key: 'traffic', label: tx('dxTabTraffic') },
                  { key: 'state', label: tx('dxTabState') },
                  { key: 'export', label: tx('dxTabExport') },
                ]}
                value={tab}
                onChange={setTab}
              />
            </ScrollView>
            <View style={{ flex: 1 }}>
              {tab === 'env' ? <EnvTab tx={tx} colors={colors} typography={typography} /> : null}
              {tab === 'networks' ? <NetworksTab tx={tx} colors={colors} typography={typography} /> : null}
              {tab === 'console' ? <ConsoleTab tx={tx} colors={colors} typography={typography} /> : null}
              {tab === 'traffic' ? <TrafficTab tx={tx} colors={colors} typography={typography} /> : null}
              {tab === 'state' ? <StateTab tx={tx} colors={colors} typography={typography} /> : null}
              {tab === 'export' ? <ExportTab tx={tx} colors={colors} typography={typography} /> : null}
            </View>
          </View>
        ) : null}
      </Screen>
      <ConfirmUnlock
        visible={!authed}
        title={t('developer')}
        subtitle={tx('dxUnlockSub')}
        perform={(unlock) => useWallet.getState().verifyUnlock(unlock)}
        onDone={() => setAuthed(true)}
        onCancel={() => goBack()}
      />
    </>
  );
}

type TabProps = { tx: (k: string) => string; colors: Colors; typography: Typo };

/* ------------------------------------------------------------------ */
/* Environnement                                                       */
/* ------------------------------------------------------------------ */

const isTestnetChain = (id: string) => hasChain(id) && !!getAdapter(id).config.testnet;

function EnvTab({ tx, colors, typography }: TabProps) {
  const t = useT();
  const diag = usePortfolioDiag((s) => s.last);
  const showTestnets = useSettings((s) => s.showTestnets);
  const setFlag = useSettings((s) => s.setFlag);
  const journalOn = useSettings((s) => s.debugJournalEnabled);
  const setJournalOn = useSettings((s) => s.setDebugJournalEnabled);
  const activeChain = useWallet((s) => s.activeChain);
  const clearNotifs = useNotifCenter((s) => s.clear);
  const SERVICES: { name: string; present: boolean }[] = [
    { name: t('svcAlchemy'), present: !!process.env.EXPO_PUBLIC_ALCHEMY_KEY },
    { name: t('svcEtherscan'), present: !!process.env.EXPO_PUBLIC_ETHERSCAN_KEY },
    { name: t('svcCoingecko'), present: !!process.env.EXPO_PUBLIC_COINGECKO_KEY },
    { name: t('svcLifi'), present: !!process.env.EXPO_PUBLIC_LIFI_KEY },
    { name: 'WalletConnect', present: !!process.env.EXPO_PUBLIC_WALLETCONNECT_ID },
  ];
  const env: 'mainnet' | 'testnet' = showTestnets && isTestnetChain(activeChain) ? 'testnet' : 'mainnet';

  // Bascule : visibilité des testnets ET réseau actif vers l'équivalent (table de correspondance, repli DEFAULT_CHAIN).
  const onEnv = (k: 'mainnet' | 'testnet') => {
    const toTest = k === 'testnet';
    const target = counterpartChain(useWallet.getState().activeChain, toTest, { exists: hasChain, isTestnet: isTestnetChain, fallbackMainnet: DEFAULT_CHAIN, fallbackTestnet: 'sepolia' });
    setFlag('showTestnets', toTest);
    const current = useWallet.getState().activeChain;
    // Jamais de changement de FAMILLE : un portefeuille Bitcoin seul (sans testnet configuré)
    // basculé sur Sepolia n'aurait plus aucun compte affiché. Pas d'équivalent → réseau inchangé.
    const familyOf = (id: string) => (hasChain(id) ? getAdapter(id).config.family : null);
    if (target !== current && familyOf(target) === familyOf(current)) useWallet.getState().setActiveChain(target);
  };
  const activeName = hasChain(activeChain) ? getAdapter(activeChain).config.name : activeChain;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('environment')}</SectionLabel>
        <SegmentedControl items={[{ key: 'mainnet', label: tx('dxMainnet') }, { key: 'testnet', label: tx('dxTestnets') }]} value={env} onChange={onEnv} />
        <Text style={typography.muted}>{tx('dxEnvHint')}</Text>
        <Card>
          <Row label={tx('dxActiveNetwork')} value={activeName} colors={colors} typography={typography} />
        </Card>
      </View>

      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('journalTitle')}</SectionLabel>
        <Card>
          <SettingRow icon="history" title={tx('dxJournalSwitch')} hint={tx('dxJournalSwitchHint')} right={<Switch value={journalOn} onValueChange={setJournalOn} />} />
          <SettingRow divider icon="history" tone="gold" title={t('journalTitle')} onPress={() => router.push('/journal')} />
        </Card>
      </View>

      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('appSection')}</SectionLabel>
        <Card>
          <Row label={t('versionWord')} value={`v${Constants.expoConfig?.version ?? '0.0.1'}`} colors={colors} typography={typography} />
          <Row label={t('environment')} value={__DEV__ ? t('developmentEnv') : t('productionEnv')} colors={colors} typography={typography} divider />
        </Card>
      </View>

      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('configuredServices')}</SectionLabel>
        <Card>
          {SERVICES.map((s, i) => (
            <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
              <Text style={typography.body}>{s.name}</Text>
              <Icon name={s.present ? 'check' : 'close'} size={17} color={s.present ? colors.up : colors.danger} />
            </View>
          ))}
        </Card>
      </View>

      {/* Dernier chargement des soldes, réseau par réseau : l'erreur RÉELLE de l'appareil. */}
      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('diagBalances')}</SectionLabel>
        <Card>
          <Text selectable style={[typography.muted, { fontFamily: MONO, fontSize: fontSize.xxs }]}>{diag ? diagText(diag) : t('diagNone')}</Text>
        </Card>
        {diag ? <Button label={t('diagShare')} variant="outline" onPress={() => void Share.share({ message: diagText(diag) })} /> : null}
      </View>

      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('maintenance')}</SectionLabel>
        <Card>
          <SettingRow icon="refresh" title={t('clearNotifCenter')} onPress={() => { clearNotifs(); toast.info(t('notifCenterCleared')); }} />
        </Card>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Réseaux                                                             */
/* ------------------------------------------------------------------ */

function HealthBadge({ state, tx, colors }: { state: RpcHealthState; tx: (k: string) => string; colors: Colors }) {
  const c = state === 'good' ? colors.up : state === 'failed' ? colors.danger : colors.textSecondary;
  const label = state === 'good' ? tx('dxHealthGood') : state === 'failed' ? tx('dxHealthFailed') : tx('dxHealthUnknown');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
      <Text style={{ color: c, fontSize: fontSize.xxs, fontFamily: fonts.medium }}>{label}</Text>
    </View>
  );
}

function NetworksTab({ tx, colors, typography }: TabProps) {
  const t = useT();
  const showTestnets = useSettings((s) => s.showTestnets);
  const pins = useRpcOverrides((s) => s.pins);
  const pin = useRpcOverrides((s) => s.pin);
  const unpin = useRpcOverrides((s) => s.unpin);
  const chains = useCustomChains((s) => s.chains);
  const removeChain = useCustomChains((s) => s.remove);
  const exportBackup = useCustomChains((s) => s.exportBackup);
  const importBackup = useCustomChains((s) => s.importBackup);
  const all = useMemo(() => listChains({ includeTestnets: showTestnets }), [showTestnets, chains]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);
  const [lat, setLat] = useState<Record<string, { ms?: number; ok: boolean } | 'busy'>>({});
  const [, setTick] = useState(0);

  // Épingles des réseaux perso (enregistrés après le démarrage) : réappliquées à l'ouverture.
  useEffect(() => {
    applyPins(useRpcOverrides.getState().pins);
  }, []);
  // Santé relue tant qu'une chaîne est dépliée (rien sinon).
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(id);
  }, [open]);

  const measure = async (chainId: string, name: string, family: string, url: string, k: string) => {
    setLat((m) => ({ ...m, [k]: 'busy' }));
    const r = await testRpcEndpoint(chainId, name, family, url, 4000).catch(() => null);
    setLat((m) => ({ ...m, [k]: { ms: r?.latencyMs, ok: r?.status === 'ok' } }));
  };

  const onExport = async () => {
    if (chains.length === 0) { toast.info(t('noNetworkToBackup')); return; }
    try { await Share.share({ message: exportBackup() }); } catch { /* partage annulé */ }
  };
  const onImport = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text?.trim()) { toast.info(t('clipboardEmpty'), t('copyBackupFirst')); return; }
    const res = importBackup(text);
    if (!res.ok) { toast.error(t('restoreFailed'), t('invalidBackup')); return; }
    if (res.added === 0) { toast.info(t('nothingToRestore'), t('networksAlreadyPresent')); return; }
    toast.success(`${res.added} ${t('networksRestoredWord')}`, res.skipped ? `${res.skipped} ${t('alreadyPresentWord')}` : undefined);
  };

  return (
    <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
      <Text style={typography.muted}>{tx('dxNetworksHint')}</Text>
      <Card>
        {all.map((c, ci) => {
          const key = healthKeyOf(c);
          const expanded = open === c.id;
          const snap = expanded && key ? rpcHealthSnapshot(key, c.rpcUrls.length) : [];
          const pinnedMasked = pins[c.id];
          return (
            <View key={c.id} style={{ borderTopWidth: ci > 0 ? 1 : 0, borderTopColor: colors.border }}>
              <KPressable onPress={() => setOpen(expanded ? null : c.id)} accessibilityLabel={c.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1.25) }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{c.name}</Text>
                  <Text style={typography.muted}>{`${c.rpcUrls.length} RPC${pinnedMasked ? ` · ${tx('dxPinned')}` : ''}${c.testnet ? ' · testnet' : ''}`}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.semibold }}>{expanded ? '−' : '+'}</Text>
              </KPressable>
              {expanded ? (
                <View style={{ gap: spacing(1), paddingBottom: spacing(1.5) }}>
                  {!key ? <Text style={typography.muted}>{tx('dxNoFallback')}</Text> : null}
                  {c.rpcUrls.map((u, i) => {
                    const shown = displayRpcUrl(u);
                    const s = snap[i];
                    const isPinned = pinnedMasked === shown;
                    const lk = `${c.id}#${i}`;
                    const l = lat[lk];
                    return (
                      <View key={lk} style={{ gap: 6, padding: spacing(1), borderRadius: radii.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: isPinned ? colors.primary : colors.border }}>
                        <Text selectable style={{ color: colors.text, fontFamily: MONO, fontSize: fontSize.xxs }}>{`${s ? `#${s.rank + 1} ` : ''}${shown}`}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), flexWrap: 'wrap' }}>
                          {s ? <HealthBadge state={s.state} tx={tx} colors={colors} /> : null}
                          {l && l !== 'busy' ? (
                            <Text style={{ color: l.ok ? colors.text : colors.danger, fontSize: fontSize.xxs, fontFamily: fonts.medium }}>{`${l.ms !== undefined ? `${l.ms} ms` : '—'}${l.ok ? '' : ` · ${tx('dxHealthFailed')}`}`}</Text>
                          ) : null}
                          <View style={{ flex: 1 }} />
                          <Chip label={l === 'busy' ? tx('dxRunning') : tx('dxMeasure')} onPress={l === 'busy' ? undefined : () => void measure(c.id, c.name, c.family, u, lk)} />
                          {key ? <Chip label={isPinned ? tx('dxUnpin') : tx('dxPin')} selected={isPinned} onPress={() => (isPinned ? unpin(c.id) : pin(c.id, u))} /> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {/* Réseaux personnalisés : l'ajout (avec vérification du Chain ID) vit dans l'écran Réseaux — pas de doublon. */}
      <View style={{ gap: spacing(1) }}>
        <SectionLabel>{t('customNetworks')}</SectionLabel>
        {chains.length > 0 ? (
          <Card>
            {chains.map((c, i) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{c.name}</Text>
                  <Text style={typography.muted}>{`${t('chainWord')} ${c.evmChainId ?? '—'} · ${c.nativeSymbol}`}</Text>
                </View>
                <KPressable onPress={() => removeChain(c.id)} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('removeWord')}</Text>
                </KPressable>
              </View>
            ))}
          </Card>
        ) : null}
        <Button label={t('addNetwork')} variant="outline" onPress={() => router.push('/networks')} />
        <Text style={typography.muted}>{t('customNetworksNote')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label={t('backupWord')} variant="outline" onPress={() => void onExport()} /></View>
          <View style={{ flex: 1 }}><Button label={t('restoreWord')} variant="outline" onPress={() => void onImport()} /></View>
        </View>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

const CATEGORIES: ('ALL' | LogEntry['category'])[] = ['ALL', 'RPC', 'TX', 'DAPP', 'WALLET', 'SYS'];
const subscribeLogger = (fn: () => void) => technicalLogger.subscribe(fn);

function ConsoleTab({ tx, colors, typography }: TabProps) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('ALL');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const tick = useThrottledTick(subscribeLogger, paused);
  const data = useMemo(() => {
    if (isDecoySession()) return [];
    return technicalLogger
      .getRecentLogs(300)
      .filter((l) => (cat === 'ALL' || l.category === cat) && (!errorsOnly || l.isError))
      .reverse();
    // `tick` : nouvelle entrée ; figé tant que la pause est active.
  }, [cat, errorsOnly, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, gap: spacing(1) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing(0.75) }}>
        {CATEGORIES.map((c) => <Chip key={c} label={c === 'ALL' ? tx('dxAll') : c} selected={cat === c} onPress={() => setCat(c)} />)}
        <Chip label={tx('dxErrorsOnly')} selected={errorsOnly} onPress={() => setErrorsOnly((v) => !v)} />
        <Chip label={paused ? tx('dxResume') : tx('dxPause')} selected={paused} onPress={() => setPaused((v) => !v)} />
      </ScrollView>
      <FlatList
        data={data}
        keyExtractor={(_l, i) => `${data.length - i}`}
        initialNumToRender={40}
        ListEmptyComponent={<Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(3) }]}>{tx('dxConsoleEmpty')}</Text>}
        renderItem={({ item }) => (
          <Text selectable style={{ color: item.isError ? colors.danger : colors.text, fontFamily: MONO, fontSize: fontSize.xxs, lineHeight: 15, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            {formatCondensedLog(item)}
          </Text>
        )}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Réseau (moniteur fetch)                                             */
/* ------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
const sizeLabel = (n?: number) => (n === undefined ? '' : n < 1024 ? ` · ${n} B` : ` · ${(n / 1024).toFixed(1)} kB`);
function formatNetEntry(e: NetEntry): string {
  return `${clock(e.t)} ${e.verb} ${e.host}${e.rpc ? ` ${e.rpc}` : ''} → ${e.status || e.err || 'ERR'} · ${e.ms} ms${sizeLabel(e.size)}`;
}

function TrafficTab({ tx, colors, typography }: TabProps) {
  const [paused, setPaused] = useState(false);
  const tick = useThrottledTick(subscribeNet, paused);
  const { entries, stats } = useMemo(() => {
    const e = isDecoySession() ? [] : [...netEntries()];
    return { stats: hostStats(e), entries: e.reverse() };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, gap: spacing(1) }}>
      <View style={{ flexDirection: 'row', gap: spacing(0.75) }}>
        <Chip label={paused ? tx('dxResume') : tx('dxPause')} selected={paused} onPress={() => setPaused((v) => !v)} />
        <Chip label={tx('dxClear')} onPress={clearNetEntries} />
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e, i) => `${e.t}-${entries.length - i}`}
        initialNumToRender={40}
        ListHeaderComponent={
          stats.length > 0 ? (
            <Card style={{ marginBottom: spacing(1) }}>
              <Text style={[typography.muted, { marginBottom: 4 }]}>{tx('dxPerHost')}</Text>
              {stats.slice(0, 12).map((s) => (
                <View key={s.host} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1), paddingVertical: 3 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: MONO, fontSize: fontSize.xxs }}>{s.host}</Text>
                  <Text style={{ color: s.failRate > 0.2 ? colors.danger : colors.textSecondary, fontFamily: MONO, fontSize: fontSize.xxs }}>
                    {`${s.count} · p50 ${s.p50} ms · ${Math.round(s.failRate * 100)}% ${tx('dxFailures')}`}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null
        }
        ListEmptyComponent={<Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(3) }]}>{tx('dxNetEmpty')}</Text>}
        renderItem={({ item }) => (
          <Text selectable style={{ color: item.status === 0 || item.status >= 400 ? colors.danger : colors.text, fontFamily: MONO, fontSize: fontSize.xxs, lineHeight: 15, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            {formatNetEntry(item)}
          </Text>
        )}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* État (lecture seule, liste blanche)                                 */
/* ------------------------------------------------------------------ */

/** Instantané NON sensible : compteurs et réglages de la liste blanche. Jamais d'adresse, de solde ni de secret. */
function stateSnapshot(): Record<string, string | number | boolean> {
  const w = useWallet.getState();
  const s = useSettings.getState();
  const types: Record<string, number> = {};
  for (const m of w.wallets) {
    const k = m.type ?? 'seed';
    types[k] = (types[k] ?? 0) + 1;
  }
  const out: Record<string, string | number | boolean> = {
    activeChain: w.activeChain,
    activeChainTestnet: isTestnetChain(w.activeChain),
    wallets: w.wallets.length,
    ...Object.fromEntries(Object.entries(types).map(([k, n]) => [`wallets.${k}`, n])),
    accounts: w.accounts.length,
    locked: !w.isUnlocked,
    walletConnectSessions: useWalletConnect.getState().sessions.length,
    customNetworks: useCustomChains.getState().chains.length,
    pinnedRpc: Object.keys(useRpcOverrides.getState().pins).length,
  };
  for (const k of SETTINGS_WHITELIST) out[`settings.${k}`] = s[k] as string | number | boolean;
  return out;
}

function StateTab({ tx, colors, typography }: TabProps) {
  // Re-rendu aux changements des seuls champs montrés (sélecteurs scalaires).
  useWallet((s) => `${s.activeChain}|${s.wallets.length}|${s.accounts.length}|${s.isUnlocked}`);
  useSettings((s) => SETTINGS_WHITELIST.map((k) => String(s[k])).join('|'));
  useWalletConnect((s) => s.sessions.length);
  const snap = stateSnapshot();
  return (
    <ScrollView contentContainerStyle={{ gap: spacing(1), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
      <Text style={typography.muted}>{tx('dxStateHint')}</Text>
      <Card>
        {Object.entries(snap).map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontFamily: MONO, fontSize: fontSize.xxs }}>{k}</Text>
            <Text style={{ color: colors.text, fontFamily: MONO, fontSize: fontSize.xxs }}>{String(v)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

async function collectExport(): Promise<unknown> {
  const decoy = isDecoySession();
  let rpc: unknown = [];
  try {
    rpc = (await collectDiagnosticData()).rpcConnectivity; // URL déjà masquées (maskRpcUrl)
  } catch {
    rpc = 'unavailable';
  }
  const journalErrors = decoy ? [] : journalLines().filter((l) => l.k === 'error' || l.k === 'crash').slice(-20).map(formatLine);
  return {
    format: 'kalyx-dev-export/1',
    generatedAt: new Date().toISOString(),
    context: {
      version: Constants.expoConfig?.version ?? '0.0.1',
      environment: __DEV__ ? 'development' : 'production',
      platform: `${Platform.OS} ${String(Platform.Version)}`,
      state: stateSnapshot(),
    },
    condensedLog: decoy ? [] : technicalLogger.getRecentLogs(120).map(formatCondensedLog),
    recentErrors: { technical: decoy ? [] : technicalLogger.getCondensedErrorLogs(20), journal: journalErrors },
    networkMonitor: decoy ? { hosts: [], recent: [] } : { hosts: hostStats(), recent: netEntries().slice(-60).map(formatNetEntry) },
    rpcDiagnostic: rpc,
  };
}

function ExportTab({ tx, colors, typography }: TabProps) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ text: string; blocked: boolean } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Assaini (sanitizeLog + adresses raccourcies) puis vérifié (detectSensitiveSecrets) : bloqué si un secret subsiste.
  const build = async () => {
    setBusy(true);
    try {
      const out = buildDiagnosticExport(await collectExport());
      if (alive.current) setPreview(out);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
      <Text style={typography.muted}>{tx('dxExportHint')}</Text>
      <Button label={tx('dxExportBuild')} onPress={() => void build()} loading={busy} />
      {preview?.blocked ? <Notice message={tx('dxExportBlocked')} /> : null}
      {preview && !preview.blocked ? (
        <>
          <Card>
            <Text selectable style={{ color: colors.text, fontFamily: MONO, fontSize: fontSize.xxs, lineHeight: 14 }}>{preview.text.length > 12000 ? `${preview.text.slice(0, 12000)}\n…` : preview.text}</Text>
          </Card>
          <Button label={tx('dxExportShare')} onPress={() => void Share.share({ message: preview.text }).catch(() => {})} />
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, divider, colors, typography }: { label: string; value: string; divider?: boolean; colors: Colors; typography: Typo }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{value}</Text>
    </View>
  );
}
