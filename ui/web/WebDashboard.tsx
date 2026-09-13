/**
 * Tableau de bord WEB (desktop) — « le téléphone est le coffre-fort, le web est
 * le tableau de bord ». Aucune seed / clé ici : on se connecte à l'app Kalyx via
 * WalletConnect (QR), on lit les adresses publiques, et on FORWARDE toute action
 * sensible à l'app qui signe. Layout desktop responsive (sidebar + contenu).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, TextInput, useWindowDimensions, ActivityIndicator, Animated, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { KalyxLogo } from '../KalyxLogo';
import { AuroraBackground } from '../AuroraBackground';
import { AllocationDonut, foldSlices } from '../AllocationDonut';
import { Icon } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useWebConnect } from '../../lib/webConnect';
import { useSettings, useT, fiatSymbol } from '../../lib/settingsStore';
import {
  getAdapter,
  listChains,
  getErc20Tokens,
  getNfts,
  getMarketChart,
  getTokenPrices,
  getPrices,
  formatTokenAmount,
  chainIconUrl,
  type Erc20Token,
  type NftItem,
  type Balance,
  type TxSummary,
  type ChainConfig,
} from '../../src';

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Horodatage relatif court (ts en secondes). */
function ago(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** Montant décimal (ex. « 0.5 ») → wei (10^18), en BigInt, sans perte de précision. */
function toWei(dec: string): bigint {
  const [int, frac = ''] = dec.split('.');
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18);
  return BigInt(int || '0') * 10n ** 18n + BigInt(fracPadded || '0');
}

/** Config d'une chaîne Kalyx par son id (repli Ethereum). */
function chainById(id: string | null): ChainConfig {
  const all = listChains();
  return all.find((c) => c.id === id) ?? all.find((c) => c.id === 'ethereum')!;
}

export function WebDashboard() {
  const t = useT();
  const { colors } = useTheme();
  const status = useWebConnect((s) => s.status);
  const init = useWebConnect((s) => s.init);

  useEffect(() => {
    init();
    const doc = (globalThis as { document?: { title: string } }).document;
    if (doc) doc.title = 'Kalyx · Tableau de bord';
  }, [init]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <AuroraBackground intensity={0.55} />
      {status === 'connected' ? <Dashboard /> : <ConnectView />}
      <SigningModal />
    </View>
  );
}

/** Popup plein écran « Signature requise — ouvrez Kalyx ». Piloté par `pending`
 *  du store : s'affiche dès qu'une action est envoyée au téléphone, se referme
 *  seul au succès (retour au tableau de bord), reste sur erreur pour explication. */
function SigningModal() {
  const t = useT();
  const { colors, typography } = useTheme();
  const pending = useWebConnect((s) => s.pending);
  const dismiss = useWebConnect((s) => s.dismissPending);
  if (!pending) return null;
  const { phase, label, detail } = pending;
  const accent = phase === 'ok' ? colors.up : phase === 'err' ? colors.danger : colors.accent;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,6,12,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.lg, padding: spacing(3), alignItems: 'center', gap: spacing(1.25) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'await' ? (
            <ActivityIndicator color={accent} />
          ) : (
            <Icon name={phase === 'ok' ? 'check' : 'warning'} size={28} color={accent} />
          )}
        </View>
        <Text style={{ color: colors.text, fontSize: 19, fontFamily: fonts.bold, textAlign: 'center' }}>
          {phase === 'ok' ? 'Validé' : phase === 'err' ? 'Non signé' : 'Signature requise'}
        </Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          {phase === 'await'
            ? `${label}. Ouvrez l'app Kalyx sur votre téléphone et validez avec votre PIN ou votre biométrie.`
            : detail ?? ''}
        </Text>
        {phase === 'await' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(0.5) }}>
            <Icon name="bell" size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
              Vous pouvez aussi appuyer sur la notification Kalyx.
            </Text>
          </View>
        ) : null}
        {phase !== 'await' ? (
          <Pressable onPress={dismiss} style={({ pressed }) => ({ marginTop: spacing(1), alignSelf: 'stretch', alignItems: 'center', backgroundColor: phase === 'ok' ? colors.accent : 'transparent', borderWidth: 1, borderColor: phase === 'ok' ? colors.accent : colors.glassBorder, borderRadius: radii.pill, paddingVertical: spacing(1.2), opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: phase === 'ok' ? '#fff' : colors.text, fontFamily: fonts.semibold }}>{t("aiClose")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Connexion */

function ConnectView() {
  const t = useT();
  const { colors, typography } = useTheme();
  const status = useWebConnect((s) => s.status);
  const uri = useWebConnect((s) => s.uri);
  const error = useWebConnect((s) => s.error);
  const connect = useWebConnect((s) => s.connect);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <View style={{ alignItems: 'center', gap: spacing(2), maxWidth: 420 }}>
        <KalyxLogo size={72} />
        <Text style={{ color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, textAlign: 'center' }}>
          Connecter votre portefeuille Kalyx
        </Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          Le téléphone est le coffre-fort, ce site est votre tableau de bord. Aucune clé n'est stockée ici —
          vous approuvez la connexion depuis l'app Kalyx avec votre PIN ou votre biométrie.
        </Text>

        {!uri ? (
          <View style={{ gap: spacing(0.75), alignSelf: 'stretch', marginTop: spacing(0.5) }}>
            {[
              'Aucune clé privée sur ce PC',
              'Chaque signature validée sur votre téléphone',
              'Lecture seule : soldes, tokens, NFT, historique',
            ].map((line) => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <Icon name="check" size={16} color={colors.up} />
                <Text style={[typography.muted, { flex: 1 }]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {uri ? (
          <View style={{ alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1) }}>
            <View style={{ backgroundColor: '#fff', padding: spacing(2), borderRadius: radii.lg }}>
              <QRCode value={uri} size={220} />
            </View>
            <Text style={[typography.muted, { textAlign: 'center' }]}>
              Ouvrez Kalyx sur votre téléphone, allez dans l'onglet WalletConnect, puis scannez ce QR.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={connect}
            disabled={status === 'connecting'}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: spacing(1),
              backgroundColor: colors.accent, borderRadius: radii.pill,
              paddingVertical: spacing(1.5), paddingHorizontal: spacing(3),
              opacity: pressed || status === 'connecting' ? 0.7 : 1, marginTop: spacing(1),
            })}
          >
            {status === 'connecting' ? <ActivityIndicator color="#fff" /> : <Icon name="walletconnect" size={20} color="#fff" />}
            <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
              {status === 'connecting' ? 'Connexion…' : 'Connecter Kalyx'}
            </Text>
          </Pressable>
        )}

        {error ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Dashboard */

/** Valeur d'une chaîne connectée (natif + tokens) pour le net worth cross-chain. */
interface ChainWorth {
  chain: ChainConfig;
  address: string;
  price: number; // prix spot de l'actif natif (fiat)
  native: number; // valeur fiat de l'actif natif
  tokens: number; // valeur fiat des tokens ERC-20 (EVM)
  value: number; // native + tokens
  change24h: number; // variation 24h de l'actif natif (%)
}
interface NetWorth {
  total: number;
  change24h: number; // variation 24h pondérée par la valeur native
  slices: ChainWorth[];
}

/** Agrège la valeur de TOUTES les chaînes connectées (une source unique pour le
 *  total, le donut de répartition et la watchlist). Prix natifs en un seul appel. */
function useNetWorth(): { data: NetWorth | null; loading: boolean } {
  const accounts = useWebConnect((s) => s.accounts);
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const key = accounts.map((a) => `${a.chainId}:${a.address}`).join(',');
  return useAsync<NetWorth>(async () => {
    if (!accounts.length) return { total: 0, change24h: 0, slices: [] };
    const entries = accounts.map((a) => ({ acc: a, chain: chainById(a.chainId) }));
    const ids = [...new Set(entries.map((e) => e.chain.coingeckoId).filter(Boolean))] as string[];
    const prices = await getPrices(ids, fiat); // { coingeckoId: { price, change24h } }
    const slices = await Promise.all(
      entries.map(async ({ acc, chain }): Promise<ChainWorth> => {
        let native = 0;
        let change24h = 0;
        let tokens = 0;
        let price = 0;
        try {
          const bal = await getAdapter(chain.id).getBalance(acc.address);
          const p = chain.coingeckoId ? prices[chain.coingeckoId] : undefined;
          price = p?.price ?? 0;
          native = (Number(bal.raw) / 10 ** bal.decimals) * price;
          change24h = p?.change24h ?? 0;
        } catch {
          /* réseau indisponible : chaîne à 0 */
        }
        if (chain.family === 'evm' && chain.coingeckoPlatform) {
          try {
            const tks = await getErc20Tokens(chain, acc.address);
            if (tks.length) {
              const tp = await getTokenPrices(chain.coingeckoPlatform, tks.map((t) => t.contract), fiat);
              tokens = tks.reduce((s, t) => s + (Number(t.raw) / 10 ** t.decimals) * (tp[t.contract.toLowerCase()] ?? 0), 0);
            }
          } catch {
            /* pas de clé / indispo : tokens à 0 */
          }
        }
        return { chain, address: acc.address, price, native, tokens, value: native + tokens, change24h };
      }),
    );
    const total = slices.reduce((s, x) => s + x.value, 0);
    const nativeSum = slices.reduce((s, x) => s + x.native, 0);
    const change24h = nativeSum > 0 ? slices.reduce((s, x) => s + x.change24h * x.native, 0) / nativeSum : 0;
    return { total, change24h, slices };
  }, [key, fiat, rev]);
}

function Dashboard() {
  const t = useT();
  const { colors, typography } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1180; // 3 colonnes desktop
  const mid = width >= 760; // 2 colonnes
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const disconnect = useWebConnect((s) => s.disconnect);
  const refresh = useWebConnect((s) => s.refresh);
  const chain = useMemo(() => chainById(selected), [selected]);
  const address = useMemo(() => accounts.find((a) => a.chainId === selected)?.address ?? '', [accounts, selected]);
  const isEvm = chain.family === 'evm';
  const worth = useNetWorth();

  // Blocs réutilisés, disposés différemment selon la largeur d'écran.
  const heroBlock = <HeroValue worth={worth} chain={chain} address={address} />;
  const allocBlock = (
    <Zone title="Répartition du portefeuille"><AllocationPanel worth={worth} /></Zone>
  );
  const tokensBlock = (
    <Zone title={t("tabTokens")}>
      {isEvm ? <TokensPanel chain={chain} address={address} /> : <Note text={`Les tokens (ERC-20) sont propres aux réseaux EVM. Sur ${chain.name}, consulte le solde et l'historique.`} />}
    </Zone>
  );
  const nftBlock = (
    <Zone title={t("tabNft")}>
      {isEvm ? <NftsPanel chain={chain} address={address} /> : <Note text={`Les NFT affichés ici concernent les réseaux EVM.`} />}
    </Zone>
  );
  const activityBlock = <Zone title={t("activity")}><HistoryPanel chain={chain} address={address} /></Zone>;
  const securityBlock = <Zone title={t("security")}><SecurityPanel /></Zone>;
  const watchBlock = <Zone title="Watchlist"><WatchlistPanel worth={worth} /></Zone>;
  const sendBlock = isEvm ? <Zone title={`Envoyer ${chain.nativeSymbol}`}><SendPanel chain={chain} address={address} /></Zone> : null;
  const accountBlock = <AccountCard chain={chain} address={address} />;
  const networksBlock = <Zone title="Réseaux"><NetworkSelector vertical={mid} /></Zone>;

  return (
    <ScrollView contentContainerStyle={{ minHeight: '100%', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 1440, padding: spacing(wide ? 3 : 2), gap: spacing(2) }}>
        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
            <KalyxLogo size={36} />
            <Text style={{ color: colors.text, fontSize: 22, fontFamily: fonts.extrabold }}>Kalyx · Tableau de bord</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.pill, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.85) }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.up }} />
              <Text style={{ color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 }}>Téléphone connecté</Text>
            </View>
            <Pressable onPress={refresh} hitSlop={6} style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}>
              <Icon name="refresh" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={disconnect} style={({ pressed }) => ({ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.85), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold }}>{t("disconnect")}</Text>
            </Pressable>
          </View>
        </View>

        {wide ? (
          /* ---- Desktop large : 3 colonnes, tout visible d'un coup ---- */
          <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' }}>
            <View style={{ width: 260, gap: spacing(2) }}>
              {accountBlock}
              {networksBlock}
            </View>
            <View style={{ flex: 1.7, minWidth: 0, gap: spacing(2) }}>
              {heroBlock}
              {allocBlock}
              {tokensBlock}
              {nftBlock}
            </View>
            <View style={{ width: 360, gap: spacing(2) }}>
              {securityBlock}
              {watchBlock}
              {activityBlock}
              {sendBlock}
            </View>
          </View>
        ) : mid ? (
          /* ---- Tablette / petit desktop : 2 colonnes ---- */
          <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' }}>
            <View style={{ flex: 1.6, minWidth: 0, gap: spacing(2) }}>
              {heroBlock}
              {allocBlock}
              {tokensBlock}
              {nftBlock}
              {activityBlock}
            </View>
            <View style={{ width: 320, gap: spacing(2) }}>
              {accountBlock}
              {networksBlock}
              {securityBlock}
              {watchBlock}
              {sendBlock}
            </View>
          </View>
        ) : (
          /* ---- Mobile / étroit : une colonne empilée ---- */
          <View style={{ gap: spacing(2) }}>
            {accountBlock}
            {networksBlock}
            {heroBlock}
            {allocBlock}
            {securityBlock}
            {watchBlock}
            {tokensBlock}
            {nftBlock}
            {activityBlock}
            {sendBlock}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing(1) }}>
          <Icon name="security" size={13} color={colors.textMuted} />
          <Text style={[typography.muted, { textAlign: 'center', fontSize: 12 }]}>
            Toutes les signatures se font sur votre téléphone Kalyx. Ce site n'a jamais accès à vos clés privées.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* --------------------------------------------------------------------- Panels */

function Card({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.lg, padding: spacing(2) }}>
      {children}
    </View>
  );
}

/** Zone du tableau de bord desktop : petit titre + contenu. */
function Zone({ title, style, children }: { title: string; style?: object; children: React.ReactNode }) {
  const t = useT();
  const { colors, typography } = useTheme();
  return (
    <View style={[{ minWidth: 0, gap: spacing(1) }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) }}>
        <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: colors.accent }} />
        <Text style={[typography.section, { fontSize: 13 }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Note({ text }: { text: string }) {
  const t = useT();
  const { typography } = useTheme();
  return <Card><Text style={typography.muted}>{text}</Text></Card>;
}

/** Barre grise pulsée (placeholder de chargement). */
function Skeleton({ w = '100%', h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: object }) {
  const t = useT();
  const { colors } = useTheme();
  const op = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        // Web uniquement : le driver natif n'existe pas → false (évite un warning).
        Animated.timing(op, { toValue: 0.85, duration: 700, useNativeDriver: false }),
        Animated.timing(op, { toValue: 0.4, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[{ width: w as number, height: h, borderRadius: r, backgroundColor: colors.glassStrong, opacity: op }, style]} />;
}

/** Lignes de chargement (icône ronde + 2 barres + valeur), pour tokens/historique. */
function SkeletonRows({ count = 4 }: { count?: number }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <Card>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
          <Skeleton w={32} h={32} r={16} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w={90} h={12} />
            <Skeleton w={140} h={10} />
          </View>
          <Skeleton w={60} h={12} />
        </View>
      ))}
    </Card>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

/** Graphique en aire (une série : valeur du portefeuille), style sparkline. */
function AreaChart({ values, up }: { values: number[]; up: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const h = 130;
  const stroke = up ? colors.up : colors.down;
  let line = '';
  let area = '';
  if (w > 0 && values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const n = values.length;
    const X = (i: number) => (w * i) / (n - 1);
    const Y = (v: number) => h - 8 - ((v - min) / span) * (h - 16);
    line = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    area = `${line} L${w.toFixed(1)},${h} L0,${h} Z`;
  }
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h, marginTop: spacing(1) }}>
      {w > 0 && line ? (
        <Svg width={w} height={h}>
          <Defs>
            <SvgGradient id="kalyxGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          <Path d={area} fill="url(#kalyxGrad)" />
          <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

const PERIODS: { k: string; l: string }[] = [
  { k: '1', l: '24 h' },
  { k: '7', l: '7 j' },
  { k: '30', l: '1 mois' },
];
function PeriodToggle({ days, onChange }: { days: string; onChange: (d: string) => void }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing(0.5), marginTop: spacing(1) }}>
      {PERIODS.map((p) => {
        const on = p.k === days;
        return (
          <Pressable key={p.k} onPress={() => onChange(p.k)} style={{ paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.6), borderRadius: radii.pill, backgroundColor: on ? colors.accent : 'transparent', borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}>
            <Text style={{ color: on ? '#fff' : colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 }}>{p.l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Petite tuile de statistique (label + valeur + sous-titre). */
function Widget({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 128, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.lg, padding: spacing(1.5) }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: valueColor ?? colors.text, fontSize: 18, fontFamily: fonts.bold, marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Bloc « héros » : valeur totale cross-chain + variation du jour + widgets +
 *  graphique de tendance du réseau sélectionné (24 h / 7 j / 1 mois). */
function HeroValue({ worth, chain, address }: { worth: { data: NetWorth | null }; chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const sym = fiatSymbol(fiat);
  const [days, setDays] = useState('7');
  const { data: bal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  const { data: prices, loading } = useAsync<number[]>(
    () => (chain.coingeckoId ? getMarketChart(chain.coingeckoId, fiat, days) : Promise.resolve([])),
    [chain.coingeckoId, fiat, days, rev],
  );
  const balNum = bal ? Number(bal.raw) / 10 ** bal.decimals : 0;
  const values = (prices ?? []).map((p) => p * balNum);
  const first = values.length ? values[0] : 0;
  const cur = values.length ? values[values.length - 1] : 0;
  const pct = first > 0 ? ((cur - first) / first) * 100 : 0;
  const up = pct >= 0;
  const total = worth.data?.total ?? null;
  const today = worth.data?.change24h ?? 0;
  const todayUp = today >= 0;
  const slice = worth.data?.slices.find((s) => s.chain.id === chain.id);
  const nativeChange = slice?.change24h ?? 0;
  const price = slice?.price ?? (prices && prices.length ? prices[prices.length - 1] : 0);

  return (
    <View style={{ gap: spacing(2) }}>
      <Card>
        <Text style={typography.muted}>Valeur totale</Text>
        {total == null ? (
          <Skeleton w={240} h={46} style={{ marginTop: 6 }} />
        ) : (
          <Text style={{ color: colors.text, fontSize: 46, fontFamily: fonts.extrabold, marginTop: 2, fontVariant: ['tabular-nums'] }}>
            {`${sym}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </Text>
        )}
        {total != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: 6 }}>
            <View style={{ backgroundColor: (todayUp ? colors.up : colors.down) + '22', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: todayUp ? colors.up : colors.down, fontFamily: fonts.bold, fontSize: 13 }}>
                {`${todayUp ? '+' : '-'}${Math.abs(today).toFixed(2)} %`}
              </Text>
            </View>
            <Text style={typography.muted}>{t("today")}</Text>
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing(1.5), flexWrap: 'wrap' }}>
        <Widget label={`Solde ${chain.nativeSymbol}`} value={`${bal ? formatTokenAmount(bal.raw, bal.decimals) : '0'}`} sub={chain.name} />
        <Widget label={`Prix ${chain.nativeSymbol}`} value={price ? `${sym}${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'} />
        <Widget label="Variation 24 h" value={`${nativeChange >= 0 ? '+' : ''}${nativeChange.toFixed(2)} %`} valueColor={nativeChange >= 0 ? colors.up : colors.down} />
      </View>

      {chain.coingeckoId ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>{`Tendance ${chain.name}`}</Text>
            {values.length ? (
              <Text style={{ color: up ? colors.up : colors.down, fontFamily: fonts.semibold, fontSize: 13 }}>{up ? '+' : ''}{pct.toFixed(2)} %</Text>
            ) : null}
          </View>
          {loading && !values.length ? (
            <Skeleton h={150} r={radii.md} style={{ marginTop: spacing(1) }} />
          ) : values.length > 1 ? (
            <AreaChart values={values} up={up} />
          ) : (
            <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}><Text style={typography.muted}>Pas de données de prix.</Text></View>
          )}
          <PeriodToggle days={days} onChange={setDays} />
        </Card>
      ) : null}
    </View>
  );
}

/** Donut de répartition du portefeuille par réseau (natif + tokens). */
function AllocationPanel({ worth }: { worth: { data: NetWorth | null } }) {
  const t = useT();
  const { typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  if (!worth.data) return <SkeletonRows count={3} />;
  const slices = foldSlices(worth.data.slices.map((s) => ({ label: s.chain.name, value: s.value })));
  if (!slices.length || worth.data.total <= 0) {
    return <Card><Text style={typography.muted}>Pas encore de valeur à répartir. Vos soldes apparaîtront ici dès qu'ils seront chargés.</Text></Card>;
  }
  return (
    <Card>
      <AllocationDonut
        slices={slices}
        size={152}
        thickness={16}
        centerTitle="Total"
        centerValue={`${sym}${worth.data.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        formatValue={(v) => `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
      />
    </Card>
  );
}

/** Sélecteur de réseau : liste verticale (desktop) ou puces horizontales (étroit),
 *  avec recherche au-delà de ~6 réseaux. */
function NetworkSelector({ vertical }: { vertical: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const setChain = useWebConnect((s) => s.setChain);
  const [q, setQ] = useState('');
  const chains = useMemo(() => accounts.map((a) => chainById(a.chainId)), [accounts]);
  const filtered = chains.filter((c) => !q || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const item = (c: ChainConfig) => {
    const t = useT();
    const on = c.id === selected;
    return (
      <Pressable
        key={c.id}
        onPress={() => setChain(c.id)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), borderRadius: radii.md, backgroundColor: on ? colors.glass : 'transparent', borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
      >
        <Image source={{ uri: chainIconUrl(c.id) }} style={{ width: 20, height: 20, borderRadius: 10 }} />
        <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.semibold, fontSize: 13, flex: vertical ? 1 : 0 }} numberOfLines={1}>{c.name}</Text>
        {on && vertical ? <Icon name="check" size={14} color={colors.accent} /> : null}
      </Pressable>
    );
  };
  return (
    <View style={{ gap: spacing(1) }}>
      {chains.length > 6 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.pill, paddingHorizontal: spacing(1.25) }}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un réseau…" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: spacing(0.85) }} />
        </View>
      ) : null}
      {vertical ? (
        <View style={{ gap: spacing(0.5) }}>{filtered.map(item)}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(0.75) }}>{filtered.map(item)}</ScrollView>
      )}
    </View>
  );
}

/** Carte compte : nom + réseau + adresse (copier) + QR code dépliable. */
function AccountCard({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const [showQr, setShowQr] = useState(false);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
        <Image source={{ uri: chainIconUrl(chain.id) }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.bodyStrong}>Compte principal</Text>
          <Text style={typography.muted} numberOfLines={1}>{chain.name}</Text>
        </View>
        <Pressable onPress={() => setShowQr((v) => !v)} hitSlop={6} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: showQr ? colors.accent : colors.glassBorder, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="scan" size={18} color={showQr ? colors.accent : colors.textMuted} />
        </Pressable>
      </View>
      {showQr && address ? (
        <View style={{ alignItems: 'center', marginTop: spacing(1.5), gap: spacing(1) }}>
          <View style={{ backgroundColor: '#fff', padding: spacing(1.5), borderRadius: radii.md }}>
            <QRCode value={address} size={168} />
          </View>
          <Text style={typography.muted}>{`Adresse ${chain.nativeSymbol} · ${chain.name}`}</Text>
        </View>
      ) : null}
      <CopyAddress address={address} />
    </Card>
  );
}

/** Panneau Sécurité : met en avant le modèle « le téléphone est le coffre-fort ». */
function SecurityPanel() {
  const t = useT();
  const { colors, typography } = useTheme();
  const peerName = useWebConnect((s) => s.peerName);
  const connectedAt = useWebConnect((s) => s.connectedAt);
  const lastActivity = useWebConnect((s) => s.lastActivity);
  const accounts = useWebConnect((s) => s.accounts);
  const disconnect = useWebConnect((s) => s.disconnect);
  const guarantees: { label: string; value: string }[] = [
    { label: 'Clés privées', value: 'Jamais sur ce PC' },
    { label: 'Signatures', value: 'Sur votre téléphone' },
    { label: 'Ce site', value: 'Lecture seule' },
  ];
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.up + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={19} color={colors.up} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.bodyStrong} numberOfLines={1}>{peerName ?? 'Portefeuille Kalyx'}</Text>
          <Text style={typography.muted} numberOfLines={1}>{`Coffre-fort connecté${connectedAt ? ` · ${ago(Math.floor(connectedAt / 1000))}` : ''}`}</Text>
        </View>
      </View>

      <View style={{ gap: spacing(0.85), marginTop: spacing(1.5) }}>
        {guarantees.map((g) => (
          <View key={g.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
            <Icon name="check" size={15} color={colors.up} />
            <Text style={[typography.muted, { flex: 1 }]}>{g.label}</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{g.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: spacing(1.5) }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>Dernière activité</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{ago(Math.floor(lastActivity / 1000))}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(0.5) }}>
        <Text style={typography.muted}>Réseaux partagés</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{accounts.length}</Text>
      </View>

      <Pressable onPress={disconnect} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', borderRadius: radii.pill, paddingVertical: spacing(1.1), borderWidth: 1, borderColor: colors.danger + '66', opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>Déconnecter cet appareil</Text>
      </Pressable>
    </Card>
  );
}

/** Watchlist : actifs natifs des réseaux connectés (prix + variation 24 h). */
function WatchlistPanel({ worth }: { worth: { data: NetWorth | null } }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  if (!worth.data) return <SkeletonRows count={3} />;
  // Dé-duplication par coingeckoId (un seul ETH même si plusieurs réseaux EVM).
  const seen = new Set<string>();
  const rows = worth.data.slices.filter((s) => {
    const id = s.chain.coingeckoId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return s.price > 0;
  });
  if (!rows.length) return <Card><Text style={typography.muted}>Watchlist indisponible (prix non chargés).</Text></Card>;
  return (
    <Card>
      {rows.map((s, i) => {
        const up = s.change24h >= 0;
        return (
          <View key={s.chain.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
            <Image source={{ uri: chainIconUrl(s.chain.id) }} style={{ width: 30, height: 30, borderRadius: 15 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={typography.bodyStrong}>{s.chain.nativeSymbol}</Text>
              <Text style={typography.muted} numberOfLines={1}>{s.chain.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>{`${sym}${s.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</Text>
              <Text style={{ color: up ? colors.up : colors.down, fontSize: 12, fontFamily: fonts.medium }}>{`${up ? '+' : ''}${s.change24h.toFixed(2)} %`}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** Adresse copiable avec retour visuel « Copié ». */
function CopyAddress({ address }: { address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Pressable onPress={copy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(1.25), alignSelf: 'flex-start' }}>
      <Text style={[typography.muted, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{address}</Text>
      <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.up : colors.textMuted} />
      {copied ? <Text style={{ color: colors.up, fontSize: 12, fontFamily: fonts.semibold }}>Copié</Text> : null}
    </Pressable>
  );
}

function TokensPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  const { data, loading } = useAsync<{ tokens: Erc20Token[]; prices: Record<string, number> }>(async () => {
    const tokens = await getErc20Tokens(chain, address);
    const prices = chain.coingeckoPlatform && tokens.length ? await getTokenPrices(chain.coingeckoPlatform, tokens.map((t) => t.contract), fiat) : {};
    return { tokens, prices };
  }, [chain.id, address, fiat, rev]);
  if (loading) return <SkeletonRows />;
  const tokens = data?.tokens ?? [];
  if (tokens.length === 0) return <Card><Text style={typography.muted}>Aucun token détecté (clé Alchemy requise pour l'EVM).</Text></Card>;
  const prices = data?.prices ?? {};
  // Valeur $ par token, triés par valeur décroissante (plus gros en haut).
  const rows = tokens
    .map((t) => {
      const amount = Number(t.raw) / 10 ** t.decimals;
      const value = amount * (prices[t.contract.toLowerCase()] ?? 0);
      return { t, value };
    })
    .sort((a, b) => b.value - a.value);
  return (
    <Card>
      {rows.map(({ t, value }, i) => (
        <View key={t.contract} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
          {t.logo ? <Image source={{ uri: t.logo }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.glassStrong }} />}
          <View style={{ flex: 1 }}>
            <Text style={typography.bodyStrong}>{t.symbol}</Text>
            <Text style={typography.muted} numberOfLines={1}>{t.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{formatTokenAmount(t.raw, t.decimals)}</Text>
            {value > 0 ? <Text style={typography.muted}>{sym}{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function NftsPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const { data, loading } = useAsync<NftItem[]>(() => getNfts(chain, address), [chain.id, address, rev]);
  if (loading) return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w={160} h={196} r={radii.md} />)}
    </View>
  );
  if (!data || data.length === 0) return <Card><Text style={typography.muted}>Aucun NFT sur ce réseau.</Text></Card>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {data.map((n) => (
        <Pressable
          key={`${n.contract}-${n.tokenId}`}
          onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/token/${n.contract}?a=${n.tokenId}`)}
          style={({ pressed }) => ({ width: 160, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.md, overflow: 'hidden', opacity: pressed ? 0.75 : 1 })}
        >
          <Image source={{ uri: n.image }} style={{ width: '100%', height: 160, backgroundColor: colors.glassStrong }} resizeMode="cover" />
          <View style={{ padding: spacing(1) }}>
            <Text style={typography.bodyStrong} numberOfLines={1}>{n.name}</Text>
            <Text style={typography.muted} numberOfLines={1}>{n.collection}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function HistoryPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const { data, loading } = useAsync<TxSummary[]>(() => getAdapter(chain.id).getHistory(address), [chain.id, address, rev]);
  if (loading) return <SkeletonRows count={5} />;
  if (!data || data.length === 0) return <Card><Text style={typography.muted}>Aucune transaction (clé Etherscan requise pour l'EVM).</Text></Card>;
  return (
    <Card>
      {data.slice(0, 30).map((tx, i) => (
        <Pressable
          key={tx.hash}
          onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/tx/${tx.hash}`)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ flex: 1 }}>
            <Text style={typography.bodyStrong}>{`${tx.direction === 'in' ? 'Reçu' : t("sendTitle")}${tx.status === 'failed' ? ' · échoué' : ''}`}</Text>
            <Text style={typography.muted} numberOfLines={1}>{`${short(tx.hash)} · ${ago(tx.timestamp)}`}</Text>
          </View>
          <Text style={{ color: tx.direction === 'in' ? colors.up : colors.text, fontFamily: fonts.semibold }}>
            {`${tx.direction === 'in' ? '+' : '-'}${formatTokenAmount(tx.value, chain.nativeDecimals)} ${chain.nativeSymbol}`}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

function SendPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const rev = useWebConnect((s) => s.rev);
  const { data: bal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  const balStr = bal ? formatTokenAmount(bal.raw, bal.decimals) : '0';
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSend = async () => {
    setErr(null); setMsg(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { setErr('Adresse EVM invalide (0x…).'); return; }
    // Accepte la virgule décimale (clavier FR) et valide le format.
    const raw = amount.replace(',', '.').trim();
    if (!/^\d*\.?\d+$/.test(raw) || !(parseFloat(raw) > 0)) { setErr(t("errInvalidAmount")); return; }
    setBusy(true);
    setMsg('Validez la transaction dans l\'app Kalyx (PIN ou biométrie)…');
    try {
      const wei = toWei(raw); // décimal → wei sans perte de précision (BigInt)
      const hash = await request('eth_sendTransaction', [{ to: to.trim(), value: '0x' + wei.toString(16) }]);
      setMsg(`Transaction envoyée : ${short(hash)}`);
      setTo(''); setAmount('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refusé ou échoué.');
      setMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={typography.bodyStrong}>{t("aiSend")}{chain.nativeSymbol}</Text>
      <Text style={[typography.muted, { marginBottom: spacing(1) }]}>La transaction est signée dans l'app Kalyx — ce site ne signe jamais.</Text>
      <Text style={typography.muted}>{t("labelRecipient")}</Text>
      <TextInput value={to} onChangeText={setTo} placeholder="0x…" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4, marginBottom: spacing(1) }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>Montant ({chain.nativeSymbol})</Text>
        <Pressable onPress={() => setAmount(balStr)} hitSlop={6}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{`Solde ${balStr} · Max`}</Text>
        </Pressable>
      </View>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4 }} />
      <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.4), opacity: pressed || busy ? 0.7 : 1 })}>
        <Text style={{ color: '#fff', fontFamily: fonts.bold }}>{busy ? 'En attente de l\'app…' : t("aiSend")}</Text>
      </Pressable>
      {msg ? <Text style={{ color: colors.accent, marginTop: spacing(1) }}>{msg}</Text> : null}
      {err ? <Text style={{ color: colors.danger, marginTop: spacing(1) }}>{err}</Text> : null}
    </Card>
  );
}
