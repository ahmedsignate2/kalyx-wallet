/**
 * Tableau de bord WEB (desktop) — « le téléphone est le coffre-fort, le web est
 * le tableau de bord ». Aucune seed / clé ici : on se connecte à l'app Kalyx via
 * WalletConnect (QR), on lit les adresses publiques, et on FORWARDE toute action
 * sensible à l'app qui signe. Layout desktop responsive (sidebar + contenu).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Image, TextInput, useWindowDimensions, ActivityIndicator, Animated, Easing, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { KalyxLogo } from '../KalyxLogo';
import { AuroraBackground } from '../AuroraBackground';
import { InteractiveChart } from '../InteractiveChart';
import { useTelegramBiometric } from './telegramBiometric';
import { useAsync } from './useAsync';
import { AgentPanel } from './AgentPanel';
import { MarketPanel } from './MarketPanel';
import { useAiStore } from '../../lib/aiStore';
import { AllocationDonut, foldSlices } from '../AllocationDonut';
import { Icon, type IconName } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useWebConnect } from '../../lib/webConnect';
import { toast } from '../../lib/toast';
import { useSettings, useT, fiatSymbol, FIATS } from '../../lib/settingsStore';
import { useContacts } from '../../lib/contactsStore';
import { LANGUAGES } from '../../lib/i18n';
import {
  getAdapter,
  listChains,
  getErc20Tokens,
  getNfts,
  getMarketChartPoints,
  getTokenPrices,
  getPrices,
  formatTokenAmount,
  chainIconUrl,
  getBestQuote,
  parseAmount,
  NATIVE_TOKEN,
  humanizeTx,
  type Erc20Token,
  type NftItem,
  type Balance,
  type TxSummary,
  type ChainConfig,
  type SwapQuote,
  type ChartPoint,
  type HumanTx,
} from '../../src';

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Or de marque Kalyx (déjà utilisé pour l'icône de notification, app.config.ts). */
const GOLD = '#DDB565';

/** Formate un montant en devise à la française pour l'euro (« 1,83 € », le
 *  symbole APRÈS avec une espace insécable) — Intl.NumberFormat gère aussi
 *  correctement les autres devises (symbole avant pour $, £…). */
function formatFiatAmount(amount: number, fiat: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: fiat.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiat.toUpperCase()}`;
  }
}

/** Couleur déterministe (HSL) dérivée d'une chaîne — même adresse de contrat
 *  → toujours la même couleur, différente d'un token à l'autre (au lieu du
 *  même cercle gris vide pour tous les tokens sans logo). */
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
}

/** Avatar de token sans logo officiel : 2 lettres sur fond coloré unique
 *  (dérivé de l'adresse du contrat) plutôt qu'un cercle gris vide anonyme. */
function TokenAvatar({ uri, label, seed, size = 32 }: { uri?: string; label: string; seed: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(seed), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.36, color: '#fff', fontFamily: fonts.bold }}>{(label || '?').slice(0, 2).toUpperCase()}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

/** Icône de réseau avec repli AUTO sur cercle lettré : chainIconUrl() renvoie
 *  volontairement `undefined` pour certains réseaux (doc : « → cercle lettré
 *  côté UI ») et l'icône distante peut aussi échouer au chargement (404,
 *  host bloqué) — un <Image> nu sans repli laissait une case vide. */
function ChainAvatar({ chain, size = 20 }: { chain: ChainConfig; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = chainIconUrl(chain.id);
  if (!uri || failed) {
    const letter = (chain.nativeSymbol || chain.name || '?').slice(0, 1).toUpperCase();
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.42, color: colors.text, fontFamily: fonts.bold }}>{letter}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glass }} />;
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

/** Montant décimal (ex. « 0.5 ») → unité brute (10^decimals), en BigInt, sans perte de précision. */
function toRaw(dec: string, decimals: number): bigint {
  const [int, frac = ''] = dec.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(int || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}
function toWei(dec: string): bigint {
  return toRaw(dec, 18);
}

/** Encode un appel ERC-20 `transfer(address,uint256)` (sélecteur 0xa9059cbb). */
function encodeErc20Transfer(to: string, raw: bigint): string {
  const addr = to.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amount = raw.toString(16).padStart(64, '0');
  return `0xa9059cbb${addr}${amount}`;
}

/** Encode un appel ERC-20 `approve(address,uint256)` (sélecteur 0x095ea7b3) —
 *  nécessaire avant un swap qui part d'un token (jamais du natif). */
function encodeErc20Approve(spender: string, raw: bigint): string {
  const addr = spender.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amount = raw.toString(16).padStart(64, '0');
  return `0x095ea7b3${addr}${amount}`;
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
  const loadAiState = useAiStore((s) => s.loadInitialState);

  useEffect(() => {
    init();
    // app/_layout.tsx saute tout le bootstrap natif sur web (pas de coffre
    // local ici) — mais l'état IA (clé BYOK persistée) doit quand même être
    // rechargé, sinon l'onglet Agent oublie la clé à chaque rafraîchissement.
    loadAiState();
    const doc = (globalThis as { document?: { title: string } }).document;
    if (doc) doc.title = 'Kalyx · Tableau de bord';
  }, [init, loadAiState]);

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
            <Text style={{ color: phase === 'ok' ? colors.onPrimary : colors.text, fontFamily: fonts.semibold }}>{t("aiClose")}</Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), width: '100%' }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.glassBorder }} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>ou</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.glassBorder }} />
            </View>
            <CopyUriButton uri={uri} />
            <Text style={[typography.muted, { textAlign: 'center', fontSize: 12 }]}>
              Collez ce lien dans Kalyx → WalletConnect → Coller, si le scan n'est pas pratique.
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
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            {status === 'connecting' ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="walletconnect" size={20} color={colors.onPrimary} />}
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
              {status === 'connecting' ? 'Connexion…' : 'Connecter Kalyx'}
            </Text>
          </Pressable>
        )}

        {error ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
      </View>
    </View>
  );
}

/** Copie le lien wc: — alternative au scan QR (même flux que « Coller » sur
 *  l'écran WalletConnect de l'app mobile). */
function CopyUriButton({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(uri);
    setCopied(true);
    toast.success('Lien copié !');
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Pressable
      onPress={copy}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing(1),
        borderRadius: radii.pill, borderWidth: 1, borderColor: copied ? colors.up : colors.glassBorder,
        paddingVertical: spacing(1), paddingHorizontal: spacing(2.5), opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.up : colors.textMuted} />
      <Text style={{ color: copied ? colors.up : colors.text, fontFamily: fonts.semibold, fontSize: 14 }}>
        {copied ? 'Lien copié' : 'Copier le lien de connexion'}
      </Text>
    </Pressable>
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

type MobileTab = 'home' | 'market' | 'wallet' | 'activity' | 'agent' | 'settings';
type ActionSheetKind = 'send' | 'receive' | 'swap';

/** Barre d'onglets mobile (téléphone uniquement) : évite d'empiler toutes les
 *  sections sur une seule page — chaque onglet ne montre que son contenu. */
function MobileTabBar({ tab, onChange }: { tab: MobileTab; onChange: (t: MobileTab) => void }) {
  const t = useT();
  const { colors } = useTheme();
  const items: { key: MobileTab; icon: IconName; label: string }[] = [
    { key: 'home', icon: 'home', label: t("navHome") },
    { key: 'market', icon: 'market', label: t("navMarket") },
    { key: 'wallet', icon: 'wallet', label: t("navWallet") },
    { key: 'activity', icon: 'history', label: t("activity") },
    { key: 'agent', icon: 'sparkles', label: 'Agent' },
    { key: 'settings', icon: 'menu', label: t("settings") },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingBottom: spacing(0.5) }}>
      {items.map((it) => {
        const on = it.key === tab;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing(1) }}>
            <Icon name={it.icon} size={20} color={on ? colors.accent : colors.textMuted} weight={on ? 'fill' : 'regular'} />
            <Text style={{ color: on ? colors.accent : colors.textMuted, fontFamily: fonts.medium, fontSize: 11 }} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Puce compacte « réseau actuel », ouvre le sélecteur en feuille plutôt que
 *  d'afficher les N réseaux connectés en dur dans le flux des Réglages. */
function CurrentNetworkChip({ chain, onPress, compact }: { chain: ChainConfig; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  if (compact) {
    // Pill discrète pour l'en-tête : juste le réseau, pas de libellé "Réseau
    // actuel" ni de sous-titre — l'utilisateur sait déjà ce qu'il regarde.
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.7 : 1 })}>
        <ChainAvatar chain={chain} size={16} />
        <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 12 }} numberOfLines={1}>{chain.name}</Text>
        <Icon name="chevron" size={11} color={colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg, padding: spacing(1.5), opacity: pressed ? 0.7 : 1 })}>
      <ChainAvatar chain={chain} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Réseau actuel</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 15 }} numberOfLines={1}>{chain.name}</Text>
      </View>
      <Icon name="chevron" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/** Cercle compact (icône + libellé), pas une carte rectangulaire individuelle
 *  — l'ergonomie universelle des wallets/apps fintech (Phantom, Revolut…)
 *  pour Recevoir/Envoyer/Swap, plutôt que 3 boîtes géantes empilées. */
function QuickAction({ icon, label, onPress, grow = true }: { icon: IconName; label: string; onPress: () => void; grow?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: grow ? 1 : undefined, width: grow ? undefined : 84, alignItems: 'center', gap: spacing(0.6), opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color={colors.onPrimary} />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** Feuille plein écran (Envoyer/Recevoir/Swap) — remplace tout l'écran sur
 *  mobile plutôt que d'empiler ces panneaux dans le flux, avec un retour. */
function ActionSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgDeep, zIndex: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), padding: spacing(2), borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
        <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glass }}>
          <Icon name="back" size={16} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontFamily: fonts.bold }}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}>{children}</ScrollView>
    </View>
  );
}

function Dashboard() {
  const t = useT();
  const { colors, typography } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1180; // 3 colonnes desktop
  const mid = width >= 760; // 2 colonnes
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const refresh = useWebConnect((s) => s.refresh);
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 700);
  };
  const chain = useMemo(() => chainById(selected), [selected]);
  const address = useMemo(() => accounts.find((a) => a.chainId === selected)?.address ?? '', [accounts, selected]);
  const isEvm = chain.family === 'evm';
  const worth = useNetWorth();
  // Sur téléphone (1 colonne), une barre d'onglets (Accueil/Portefeuille/
  // Activité/Réglages) remplace l'empilement de toutes les sections sur une
  // seule page ; Envoyer/Recevoir/Swap deviennent des feuilles plein écran
  // ouvertes depuis les actions rapides de l'Accueil.
  const narrow = !wide && !mid;
  const [tab, setTab] = useState<MobileTab>('home');
  const [sheet, setSheet] = useState<ActionSheetKind | null>(null);
  const [networkSheet, setNetworkSheet] = useState(false);

  // Blocs réutilisés, disposés différemment selon la largeur d'écran. Le
  // détail (data + calculs) est partagé via useHeroData : sur mobile, les 3
  // présentations (solde / widgets / tendance) sont réordonnées autour des
  // actions rapides sans dupliquer les appels réseau.
  const heroData = useHeroData({ worth, chain, address });
  const heroBlock = (
    <View style={{ gap: spacing(2) }}>
      <HeroTotalCard data={heroData} chain={chain} address={address} />
      <HeroWidgetsRow data={heroData} chain={chain} />
      <HeroTrendCard data={heroData} chain={chain} />
    </View>
  );
  const allocBlock = (
    <Zone title="Répartition du portefeuille" collapsible={narrow}><AllocationPanel worth={worth} /></Zone>
  );
  const tokensBlock = (
    <Zone title={t("tabTokens")}>
      {isEvm ? (
        <TokensPanel chain={chain} address={address} />
      ) : (
        <>
          <NativeBalanceCard chain={chain} address={address} />
          <Note text={`Les jetons ${chain.family === 'solana' ? 'SPL' : ''} de ${chain.name} arriveront bientôt ici — en attendant, ton solde ${chain.nativeSymbol} est à jour ci-dessus.`} />
        </>
      )}
    </Zone>
  );
  const nftBlock = (
    <Zone title={t("tabNft")} collapsible={narrow}>
      {isEvm ? <NftsPanel chain={chain} address={address} /> : <Note text={`Les NFT affichés ici concernent les réseaux EVM.`} />}
    </Zone>
  );
  const activityBlock = <Zone title={t("activity")} collapsible={narrow}><HistoryPanel chain={chain} address={address} /></Zone>;
  const securityBlock = <Zone title={t("security")}><SecurityPanel /></Zone>;
  const watchBlock = <Zone title="Watchlist" collapsible={narrow}><WatchlistPanel worth={worth} /></Zone>;
  const sendBlock = isEvm ? <Zone title={`Envoyer ${chain.nativeSymbol}`}><SendPanel chain={chain} address={address} /></Zone> : null;
  const swapBlock = isEvm ? <Zone title={t("swap")}><SwapPanel chain={chain} address={address} /></Zone> : null;
  const accountBlock = <AccountCard chain={chain} address={address} />;
  const networksBlock = <Zone title="Réseaux"><NetworkSelector vertical /></Zone>;
  const settingsBlock = <Zone title={t("settings")} collapsible={narrow}><SettingsPanel /></Zone>;
  const agentBlock = <Zone title="Agent" collapsible={narrow}><AgentPanel chain={chain} address={address} worth={worth} /></Zone>;
  const marketBlock = <Zone title={t("navMarket")} collapsible={narrow}><MarketPanel /></Zone>;

  const scrollContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ minHeight: '100%', alignItems: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.text} colors={[colors.text]} />}
    >
      <View style={{ width: '100%', maxWidth: 1440, padding: spacing(wide ? 3 : 2), gap: spacing(2) }}>
        {/* En-tête compact : un titre "Kalyx • Tableau de bord" en gros au
         * centre faisait "panneau d'admin" — l'utilisateur sait déjà où il
         * est. Logo + pastille de connexion (gauche), réseau (centre),
         * rafraîchir (droite) — une seule ligne, ~50 px de moins en hauteur. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(1) }}>
          <View>
            <KalyxLogo size={30} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.up, borderWidth: 2, borderColor: colors.bgDeep }} />
          </View>
          <CurrentNetworkChip chain={chain} onPress={() => setNetworkSheet(true)} compact />
          <Pressable onPress={refresh} hitSlop={6} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', opacity: pressed ? 0.6 : 1 })}>
            <Icon name="refresh" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {wide ? (
          /* ---- Desktop large : 3 colonnes, tout visible d'un coup ---- */
          <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'flex-start' }}>
            <View style={{ width: 260, gap: spacing(2) }}>
              {accountBlock}
              {networksBlock}
              {settingsBlock}
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
              {swapBlock}
              {agentBlock}
              {marketBlock}
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
              {swapBlock}
              {agentBlock}
              {marketBlock}
              {settingsBlock}
            </View>
          </View>
        ) : (
          /* ---- Mobile / étroit : onglets, un seul contenu à la fois ---- */
          <View style={{ gap: spacing(2) }}>
            {tab === 'home' ? (
              /* Ordre demandé : compte → solde → actions au pouce → tendance
               * → détails secondaires (widgets, répartition, watchlist) en
               * bas, repliables. Le sélecteur de réseau (moins fréquent que
               * Recevoir/Envoyer/Swap) est dans l'onglet Réglages. */
              <>
                <HeroTotalCard data={heroData} chain={chain} address={address} />
                <View style={{ flexDirection: 'row', gap: spacing(1.25), justifyContent: isEvm ? undefined : 'center' }}>
                  <QuickAction icon="receive" label={t("receive")} onPress={() => setSheet('receive')} grow={isEvm} />
                  {isEvm ? <QuickAction icon="send" label={t("send")} onPress={() => setSheet('send')} /> : null}
                  {isEvm ? <QuickAction icon="exchange" label={t("swapAction")} onPress={() => setSheet('swap')} /> : null}
                </View>
                <HeroTrendCard data={heroData} chain={chain} />
                <HeroWidgetsRow data={heroData} chain={chain} />
                {allocBlock}
                {watchBlock}
              </>
            ) : tab === 'market' ? (
              marketBlock
            ) : tab === 'wallet' ? (
              <>
                {tokensBlock}
                {nftBlock}
              </>
            ) : tab === 'activity' ? (
              activityBlock
            ) : tab === 'agent' ? (
              agentBlock
            ) : (
              <>
                {securityBlock}
                {settingsBlock}
              </>
            )}
          </View>
        )}

        {narrow ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing(1) }}>
            <Icon name="security" size={13} color={colors.textMuted} />
            <Text style={[typography.muted, { textAlign: 'center', fontSize: 12 }]}>
              Toutes les signatures se font sur votre téléphone Kalyx. Ce site n'a jamais accès à vos clés privées.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      {scrollContent}
      {narrow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing(0.75), backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.glassBorder }}>
          <Icon name="security" size={12} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 11 }}>
            Signatures faites sur ton téléphone Kalyx uniquement.
          </Text>
        </View>
      ) : null}
      {narrow ? <MobileTabBar tab={tab} onChange={setTab} /> : null}
      {narrow && sheet === 'receive' ? (
        <ActionSheet title={t("receive")} onClose={() => setSheet(null)}>
          <AccountCard chain={chain} address={address} defaultQr />
        </ActionSheet>
      ) : null}
      {narrow && sheet === 'send' ? (
        <ActionSheet title={t("send")} onClose={() => setSheet(null)}>
          {isEvm ? <SendPanel chain={chain} address={address} /> : <Note text="L'envoi n'est pas encore disponible sur ce réseau depuis le web." />}
        </ActionSheet>
      ) : null}
      {narrow && sheet === 'swap' ? (
        <ActionSheet title={t("swapAction")} onClose={() => setSheet(null)}>
          {isEvm ? <SwapPanel chain={chain} address={address} /> : <Note text="Le swap n'est disponible que sur les réseaux EVM." />}
        </ActionSheet>
      ) : null}
      {narrow && networkSheet ? (
        <ActionSheet title="Réseaux" onClose={() => setNetworkSheet(false)}>
          <NetworkSelector vertical onSelected={() => setNetworkSheet(false)} />
        </ActionSheet>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------------- Panels */

/** Style « verre » (fond très légèrement teinté + bordure fine) plutôt qu'un
 *  aplat gris à bordure épaisse — donne de la profondeur par calques au lieu
 *  d'empiler des boîtes dures. `colors.text` sert de base : quasi-blanc en
 *  thème sombre → un voile blanc à 3 % ; quasi-noir en clair → un voile noir
 *  à 3 % — s'adapte aux deux thèmes sans dupliquer la logique. */
function Card({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg, padding: spacing(2) }}>
      {children}
    </View>
  );
}

/** Zone du tableau de bord desktop : petit titre + contenu. */
/** `collapsible` : replie la section derrière son titre (repliée par défaut).
 *  Utilisé uniquement en mobile étroit, pour raccourcir la page sans toucher
 *  à la navigation — les sections secondaires (NFT, activité, watchlist…)
 *  n'ont pas besoin d'être visibles d'entrée sur un écran de téléphone. */
function Zone({ title, style, collapsible, children }: { title: string; style?: object; collapsible?: boolean; children: React.ReactNode }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const [open, setOpen] = useState(!collapsible);
  const Header = collapsible ? Pressable : View;
  return (
    <View style={[{ minWidth: 0, gap: spacing(1) }, style]}>
      <Header
        {...(collapsible ? { onPress: () => setOpen((v) => !v) } : {})}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) }}
      >
        <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: GOLD }} />
        <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 }}>{title}</Text>
        {collapsible ? (
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="caretDown" size={14} color={colors.textMuted} />
          </View>
        ) : null}
      </Header>
      {open ? children : null}
    </View>
  );
}

function Note({ text }: { text: string }) {
  const t = useT();
  const { typography } = useTheme();
  return <Card><Text style={typography.muted}>{text}</Text></Card>;
}

/** État vide soigné (icône + titre + sous-titre), centré — jamais de détail
 *  technique (clé API manquante, etc.) exposé à l'utilisateur. Remplit aussi
 *  l'espace d'un onglet court au lieu d'un petit encart en haut d'un grand vide. */
function EmptyState({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing(1), paddingVertical: spacing(6), minHeight: 220 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={colors.textMuted} />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 15 }}>{title}</Text>
      <Text style={[typography.muted, { textAlign: 'center', maxWidth: 260 }]}>{subtitle}</Text>
    </View>
  );
}

/** Barre grise pulsée (placeholder de chargement). */
/** Effet « shimmer » (bande de lumière qui balaie) plutôt qu'un simple pouls
 *  d'opacité — plus fluide, façon skeleton des apps fintech modernes. */
function Skeleton({ w = '100%', h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: object }) {
  const t = useT();
  const { colors } = useTheme();
  const gradId = `shimmer-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const band = Math.max(width * 0.5, 40);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-band, width] });
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[{ width: w as number, height: h, borderRadius: r, backgroundColor: colors.glassStrong, overflow: 'hidden' }, style]}>
      {width > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: band, transform: [{ translateX }] }}>
          <Svg width={band} height={h}>
            <Defs>
              <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.text} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.text} stopOpacity={0.14} />
                <Stop offset="1" stopColor={colors.text} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Rect width={band} height={h} fill={`url(#${gradId})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
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
            <Text style={{ color: on ? colors.onPrimary : colors.textMuted, fontFamily: fonts.semibold, fontSize: 12 }}>{p.l}</Text>
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
/** Données + calculs du bloc « héros », partagés par les 3 présentations
 *  (carte solde, ligne de widgets, carte tendance) — un seul jeu d'appels
 *  réseau, peu importe l'ordre dans lequel on les affiche à l'écran. */
function useHeroData({ worth, chain, address }: { worth: { data: NetWorth | null }; chain: ChainConfig; address: string }) {
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const sym = fiatSymbol(fiat);
  const [days, setDays] = useState('7');
  const { data: bal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  // Points horodatés (pas juste les prix) : le graphique est scrubable au
  // doigt/à la souris (InteractiveChart, déjà utilisé et testé côté app
  // mobile sur l'écran token) et affiche prix + heure exacts sous le curseur.
  const { data: points, loading } = useAsync<ChartPoint[]>(
    () => (chain.coingeckoId ? getMarketChartPoints(chain.coingeckoId, fiat, days) : Promise.resolve([])),
    [chain.coingeckoId, fiat, days, rev],
  );
  // Prix brut de l'actif natif (pas la valeur du portefeuille) : avec un petit
  // solde, « valeur = prix × solde » restait plate à ~0 quel que soit le
  // marché — le prix, lui, bouge réellement et correspond à ce qu'annonce le
  // titre « Tendance <réseau> ».
  const values = (points ?? []).map((p) => p.v);
  const first = values.length ? values[0] : 0;
  const cur = values.length ? values[values.length - 1] : 0;
  const pct = first > 0 ? ((cur - first) / first) * 100 : 0;
  const up = pct >= 0;
  const total = worth.data?.total ?? null;
  const today = worth.data?.change24h ?? 0;
  const todayUp = today >= 0;
  const slice = worth.data?.slices.find((s) => s.chain.id === chain.id);
  const nativeChange = slice?.change24h ?? 0;
  const price = slice?.price ?? (values.length ? values[values.length - 1] : 0);
  return { sym, days, setDays, bal, points, loading, values, pct, up, total, today, todayUp, nativeChange, price };
}
type HeroData = ReturnType<typeof useHeroData>;

/** Carte « Valeur totale » + variation du jour. */
/** Carte « héros » façon carte bancaire : coins très arrondis, dégradé
 *  discret (couleurs du thème — pas de violet/ambre hors charte, cf. tokens.ts
 *  « Plus de doré/violet »), œil masquer/révéler en haut à gauche, montant
 *  centré, pastille d'adresse cliquable en bas. Inspiré de Gram Wallet, adapté
 *  à l'identité visuelle Kalyx existante plutôt que copié telle quelle. */
function HeroTotalCard({ data, chain, address }: { data: HeroData; chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const { total, today, todayUp } = data;
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const tg = useTelegramBiometric();
  // Dans Telegram avec biométrie dispo : masqué par défaut, révélé par
  // empreinte/Face ID (via Telegram). Sinon : simple bascule au tap, comme
  // avant — jamais de secret réel derrière ce verrou, juste l'affichage.
  const isHidden = tg.available ? !tg.unlocked : hidden;
  const onToggleHidden = () => {
    if (tg.available) {
      if (tg.unlocked) tg.lock();
      else tg.unlock('Affiche ton solde Kalyx');
    } else {
      setHidden((v) => !v);
    }
  };
  const copyAddress = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    toast.success('Adresse copiée !');
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    // Bordure fine + halo doré diffus (identité Kalyx, ambre/or — cf. GOLD)
    // au lieu d'un bloc noir plat : la lueur amber/orange en haut donne du
    // relief sans dépendre d'un vrai blur (non supporté nativement en RN).
    <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: colors.text + '10', backgroundColor: colors.text + '06', overflow: 'hidden' }}>
      <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="heroGlow" cx="50%" cy="0%" r="85%">
            <Stop offset="0" stopColor={GOLD} stopOpacity={0.15} />
            <Stop offset="0.7" stopColor={GOLD} stopOpacity={0.03} />
            <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#heroGlow)" />
      </Svg>
      <View style={{ padding: spacing(2.5), alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
          <Pressable onPress={onToggleHidden} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.text + '08', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={isHidden ? 'eyeOff' : 'eye'} size={15} color={colors.textMuted} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {tg.available ? <Icon name={tg.biometricType === 'face' ? 'security' : 'lock'} size={15} color={colors.textMuted} /> : null}
        </View>
        <Text style={[typography.muted, { marginTop: spacing(1.5) }]}>Valeur totale</Text>
        {total == null ? (
          <Skeleton w={200} h={44} style={{ marginTop: 6 }} />
        ) : (
          <Text style={{ color: colors.text, fontSize: 42, fontFamily: fonts.extrabold, marginTop: 4, fontVariant: ['tabular-nums'] }}>
            {isHidden ? '••••••' : formatFiatAmount(total, fiat)}
          </Text>
        )}
        {total != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: 8 }}>
            <View style={{ backgroundColor: (todayUp ? colors.up : colors.down) + '22', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: todayUp ? colors.up : colors.down, fontFamily: fonts.bold, fontSize: 13 }}>
                {`${todayUp ? '+' : '-'}${Math.abs(today).toFixed(2)} %`}
              </Text>
            </View>
            <Text style={typography.muted}>{t("today")}</Text>
          </View>
        ) : null}
        {address ? (
          <Pressable onPress={copyAddress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(2), backgroundColor: colors.bgDeep + '88', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.pill, paddingVertical: 7, paddingLeft: 12, paddingRight: 14, opacity: pressed ? 0.7 : 1 })}>
            <ChainAvatar chain={chain} size={16} />
            <Text style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{short(address)}</Text>
            <Icon name={copied ? 'check' : 'copy'} size={12} color={copied ? colors.up : colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Ligne de widgets (solde natif, prix, variation 24 h) — détail secondaire. */
function HeroWidgetsRow({ data, chain }: { data: HeroData; chain: ChainConfig }) {
  const { colors } = useTheme();
  const { sym, bal, price, nativeChange } = data;
  return (
    <View style={{ flexDirection: 'row', gap: spacing(1.5), flexWrap: 'wrap' }}>
      <Widget label={`Solde ${chain.nativeSymbol}`} value={`${bal ? formatTokenAmount(bal.raw, bal.decimals) : '0'}`} />
      <Widget label={`Prix ${chain.nativeSymbol}`} value={price ? `${sym}${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'} />
      <Widget label="Variation 24 h" value={`${nativeChange >= 0 ? '+' : ''}${nativeChange.toFixed(2)} %`} valueColor={nativeChange >= 0 ? colors.up : colors.down} />
    </View>
  );
}

/** Carte « Tendance » (graphique + sélecteur de période). */
/** Date du point scrubbé — heure pour la période 24 h, date sinon (même
 *  convention que l'écran token de l'app mobile). */
function formatScrubDate(ts: number, days: string): string {
  const d = new Date(ts);
  return days === '1'
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function HeroTrendCard({ data, chain }: { data: HeroData; chain: ChainConfig }) {
  const { colors, typography } = useTheme();
  const { days, setDays, values, points, up, pct, loading, sym } = data;
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [w, setW] = useState(0);
  if (!chain.coingeckoId) return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>{`Tendance ${chain.name}`}</Text>
        {scrub ? (
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 13 }} numberOfLines={1}>
            {`${sym}${scrub.v.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ${formatScrubDate(scrub.t, days)}`}
          </Text>
        ) : values.length ? (
          <Text style={{ color: up ? colors.up : colors.down, fontFamily: fonts.semibold, fontSize: 13 }}>{up ? '+' : ''}{pct.toFixed(2)} %</Text>
        ) : null}
      </View>
      {loading && !values.length ? (
        <Skeleton h={150} r={radii.md} style={{ marginTop: spacing(1) }} />
      ) : (points?.length ?? 0) > 1 ? (
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginTop: spacing(1) }}>
          {w > 0 ? <InteractiveChart points={points!} color={up ? colors.up : colors.down} width={w} height={150} onScrub={setScrub} /> : null}
        </View>
      ) : (
        <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}><Text style={typography.muted}>Pas de données de prix.</Text></View>
      )}
      <PeriodToggle days={days} onChange={setDays} />
    </Card>
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
function NetworkSelector({ vertical, onSelected }: { vertical: boolean; onSelected?: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const setChain = useWebConnect((s) => s.setChain);
  const [q, setQ] = useState('');
  const chains = useMemo(() => accounts.map((a) => chainById(a.chainId)), [accounts]);
  const filtered = chains.filter((c) => !q || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const item = (c: ChainConfig) => {
    const on = c.id === selected;
    return (
      <Pressable
        key={c.id}
        onPress={() => { setChain(c.id); onSelected?.(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
      >
        <ChainAvatar chain={c} size={20} />
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
          <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un réseau…" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', fontSize: 13, paddingVertical: spacing(0.85) }} />
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
function AccountCard({ chain, address, defaultQr }: { chain: ChainConfig; address: string; defaultQr?: boolean }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const [showQr, setShowQr] = useState(!!defaultQr);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
        <ChainAvatar chain={chain} size={40} />
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

/** Réglages du tableau de bord : langue et devise d'affichage. Même store
 *  (lib/settingsStore.ts) que l'app mobile — un changement ici ne modifie que
 *  ce navigateur (persistance locale), jamais le téléphone. */
function SettingsPanel() {
  const t = useT();
  const { colors, typography } = useTheme();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const fiat = useSettings((s) => s.fiat);
  const setFiat = useSettings((s) => s.setFiat);
  const [open, setOpen] = useState<'lang' | 'fiat' | null>(null);
  const curLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];
  const curFiat = FIATS.find((f) => f.code === fiat) ?? FIATS[0];

  const row = (opts: {
    icon: 'language' | 'currency';
    label: string;
    value: string;
    section: 'lang' | 'fiat';
  }) => (
    <Pressable
      onPress={() => setOpen(open === opts.section ? null : opts.section)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(0.75) }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={opts.icon} size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={typography.muted}>{opts.label}</Text>
        <Text style={typography.bodyStrong} numberOfLines={1}>{opts.value}</Text>
      </View>
      <View style={{ transform: [{ rotate: open === opts.section ? '180deg' : '0deg' }] }}>
        <Icon name="caretDown" size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );

  return (
    <Card>
      {row({ icon: 'language', label: 'Langue', value: `${curLang.flag} ${curLang.name}`, section: 'lang' })}
      {open === 'lang' ? (
        <View style={{ gap: spacing(0.5), marginTop: spacing(0.5), marginBottom: spacing(1) }}>
          {LANGUAGES.map((l) => {
            const on = l.code === language;
            return (
              <Pressable
                key={l.code}
                onPress={() => { setLanguage(l.code); setOpen(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.85), borderRadius: radii.md, backgroundColor: on ? colors.glass : 'transparent', borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
              >
                <Text style={{ fontSize: 16 }}>{l.flag}</Text>
                <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.medium, fontSize: 13, flex: 1 }}>{l.name}</Text>
                {on ? <Icon name="check" size={14} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.glassBorder }} />

      {row({ icon: 'currency', label: 'Devise', value: `${curFiat.symbol} ${curFiat.name}`, section: 'fiat' })}
      {open === 'fiat' ? (
        <View style={{ gap: spacing(0.5), marginTop: spacing(0.5) }}>
          {FIATS.map((f) => {
            const on = f.code === fiat;
            return (
              <Pressable
                key={f.code}
                onPress={() => { setFiat(f.code); setOpen(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.85), borderRadius: radii.md, backgroundColor: on ? colors.glass : 'transparent', borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
              >
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14, width: 34 }}>{f.symbol}</Text>
                <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.medium, fontSize: 13, flex: 1 }}>{f.name}</Text>
                {on ? <Icon name="check" size={14} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

/** Watchlist : actifs natifs des réseaux connectés (prix + variation 24 h). */
function WatchlistPanel({ worth }: { worth: { data: NetWorth | null } }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
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
            <ChainAvatar chain={s.chain} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={typography.bodyStrong}>{s.chain.nativeSymbol}</Text>
              <Text style={typography.muted} numberOfLines={1}>{s.chain.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>{formatFiatAmount(s.price, fiat)}</Text>
              <View style={{ backgroundColor: (up ? colors.up : colors.down) + '1A', borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: up ? colors.up : colors.down, fontSize: 11, fontFamily: fonts.semibold }}>{`${up ? '+' : ''}${s.change24h.toFixed(2)} %`}</Text>
              </View>
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
    toast.success('Adresse copiée !');
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

/** Solde natif (SOL, BTC…) affiché dans l'onglet Portefeuille pour les
 *  réseaux non-EVM, où la liste de tokens (SPL, etc.) n'est pas encore
 *  câblée — vaut mieux un vrai solde que « propre aux réseaux EVM ». */
function NativeBalanceCard({ chain, address }: { chain: ChainConfig; address: string }) {
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const sym = fiatSymbol(fiat);
  const { data: bal, loading } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  const { data: prices } = useAsync<Record<string, { price: number; change24h: number }>>(
    () => (chain.coingeckoId ? getPrices([chain.coingeckoId], fiat) : Promise.resolve({})),
    [chain.coingeckoId, fiat, rev],
  );
  if (loading) return <SkeletonRows count={1} />;
  const price = chain.coingeckoId ? prices?.[chain.coingeckoId]?.price : undefined;
  const amount = bal ? Number(bal.raw) / 10 ** bal.decimals : 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
        <ChainAvatar chain={chain} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.bodyStrong}>{bal ? formatTokenAmount(bal.raw, bal.decimals) : '0'} {chain.nativeSymbol}</Text>
          <Text style={typography.muted} numberOfLines={1}>{chain.name}</Text>
        </View>
        {price ? <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{`${sym}${(amount * price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</Text> : null}
      </View>
    </Card>
  );
}

function TokensPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, loading } = useAsync<{ tokens: Erc20Token[]; prices: Record<string, number> }>(async () => {
    const tokens = await getErc20Tokens(chain, address);
    const prices = chain.coingeckoPlatform && tokens.length ? await getTokenPrices(chain.coingeckoPlatform, tokens.map((tk) => tk.contract), fiat) : {};
    return { tokens, prices };
  }, [chain.id, address, fiat, rev]);
  if (loading) return <SkeletonRows />;
  const tokens = data?.tokens ?? [];
  if (tokens.length === 0) return <EmptyState icon="wallet" title="Aucun token" subtitle="Les tokens de ce réseau apparaîtront ici dès qu'ils seront détectés." />;
  const prices = data?.prices ?? {};
  // Valeur $ par token, triés par valeur décroissante (plus gros en haut).
  const withValue = tokens
    .map((tk) => {
      const amount = Number(tk.raw) / 10 ** tk.decimals;
      const value = amount * (prices[tk.contract.toLowerCase()] ?? 0);
      return { tk, value };
    })
    .sort((a, b) => b.value - a.value);
  // Un token SANS logo officiel ET sans valorisation connue est presque
  // toujours un airdrop spam (le RPC renvoie tous les soldes ERC-20 sans
  // filtre) — relégué par défaut dans un accordéon fermé plutôt que de
  // polluer la liste principale de cercles gris vides.
  const verified = withValue.filter(({ tk, value }) => tk.logo || value > 0);
  const unverified = withValue.filter(({ tk, value }) => !tk.logo && value <= 0);
  return (
    <View style={{ gap: spacing(1) }}>
      <Card>
        {verified.length === 0 ? (
          <Text style={typography.muted}>Aucun token vérifié détecté.</Text>
        ) : (
          verified.map(({ tk, value }, i) => (
            <TokenRow
              key={tk.contract}
              token={tk}
              value={value}
              sym={sym}
              chain={chain}
              divider={i > 0}
              expanded={expanded === tk.contract}
              onToggle={() => setExpanded((cur) => (cur === tk.contract ? null : tk.contract))}
            />
          ))
        )}
      </Card>
      {unverified.length > 0 ? (
        <UnverifiedTokensAccordion rows={unverified} sym={sym} chain={chain} expanded={expanded} onToggle={setExpanded} />
      ) : null}
    </View>
  );
}

/** Accordéon fermé par défaut — les tokens sans logo ni valeur (spam probable). */
function UnverifiedTokensAccordion({
  rows, sym, chain, expanded, onToggle,
}: {
  rows: { tk: Erc20Token; value: number }[]; sym: string; chain: ChainConfig; expanded: string | null; onToggle: (id: string | null) => void;
}) {
  const { colors, typography } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), paddingVertical: spacing(0.75) }}>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="caretDown" size={13} color={colors.textFaint} />
        </View>
        <Text style={[typography.muted, { fontSize: 12 }]}>{`Tokens non vérifiés (${rows.length})`}</Text>
      </Pressable>
      {open ? (
        <Card>
          {rows.map(({ tk, value }, i) => (
            <TokenRow
              key={tk.contract}
              token={tk}
              value={value}
              sym={sym}
              chain={chain}
              divider={i > 0}
              expanded={expanded === tk.contract}
              onToggle={() => onToggle(expanded === tk.contract ? null : tk.contract)}
            />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** Ligne d'un token ERC-20 : dépliable pour révéler le contrat et un envoi
 *  dédié (encode `transfer(address,uint256)`, signé côté téléphone). */
function TokenRow({
  token, value, sym, chain, divider, expanded, onToggle,
}: {
  token: Erc20Token; value: number; sym: string; chain: ChainConfig; divider: boolean; expanded: boolean; onToggle: () => void;
}) {
  const t = useT();
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const contacts = useContacts((s) => s.contacts);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const balStr = formatTokenAmount(token.raw, token.decimals);
  const matchedContact = contacts.find((c) => c.address.toLowerCase() === to.trim().toLowerCase());

  const onSend = async () => {
    setErr(null); setMsg(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { setErr('Adresse EVM invalide (0x…).'); return; }
    const raw = amount.replace(',', '.').trim();
    if (!/^\d*\.?\d+$/.test(raw) || !(parseFloat(raw) > 0)) { setErr(t("errInvalidAmount")); return; }
    setBusy(true);
    setMsg('Validez la transaction dans l\'app Kalyx (PIN ou biométrie)…');
    try {
      const raw2 = toRaw(raw, token.decimals);
      const data = encodeErc20Transfer(to.trim(), raw2);
      const hash = await request('eth_sendTransaction', [{ to: token.contract, value: '0x0', data }]);
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
    <View style={{ borderTopWidth: divider ? 1 : 0, borderTopColor: colors.glassBorder }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25) }}>
        <TokenAvatar uri={token.logo} label={token.symbol} seed={token.contract} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={typography.bodyStrong}>{token.symbol}</Text>
          <Text style={typography.muted} numberOfLines={1}>{token.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{balStr}</Text>
          {value > 0 ? <Text style={typography.muted}>{sym}{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text> : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ paddingBottom: spacing(1.5), gap: spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }}>
            <Text style={[typography.muted, { flex: 1 }]} numberOfLines={1}>{short(token.contract)}</Text>
            <Pressable onPress={() => { Clipboard.setStringAsync(token.contract); toast.success('Adresse du contrat copiée !'); }} hitSlop={6} style={{ marginRight: spacing(1) }}>
              <Icon name="copy" size={14} color={colors.textMuted} />
            </Pressable>
            {chain.explorerUrl ? (
              <Pressable onPress={() => Linking.openURL(`${chain.explorerUrl}/token/${token.contract}`)} hitSlop={6}>
                <Icon name="forward" size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>{t("aiSend")}{token.symbol}</Text>
            {contacts.length ? (
              <Pressable onPress={() => setShowContacts((v) => !v)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="contacts" size={13} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{t("addressBook")}</Text>
              </Pressable>
            ) : null}
          </View>
          {showContacts && contacts.length ? (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' }}>
              <ScrollView style={{ maxHeight: 160 }}>
                {contacts.map((c) => (
                  <Pressable key={c.id} onPress={() => { setTo(c.address); setShowContacts(false); }} style={({ pressed }) => ({ paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), backgroundColor: pressed ? colors.glass : 'transparent' })}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{c.name}</Text>
                    <Text style={typography.muted} numberOfLines={1}>{short(c.address)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <TextInput value={to} onChangeText={setTo} placeholder="0x…" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: 14, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }} />
          {matchedContact ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing(0.5) }}>
              <Icon name="check" size={12} color={colors.up} />
              <Text style={{ color: colors.up, fontSize: 12, fontFamily: fonts.medium }}>{matchedContact.name}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>{`Montant (${token.symbol})`}</Text>
            <Pressable onPress={() => setAmount(balStr)} hitSlop={6}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{`Solde ${balStr} · Max`}</Text>
            </Pressable>
          </View>
          <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 14, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }} />
          <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.2), opacity: pressed || busy ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>{busy ? 'En attente de l\'app…' : t("aiSend")}</Text>
          </Pressable>
          {msg ? <Text style={{ color: colors.accent }}>{msg}</Text> : null}
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        </View>
      ) : null}
    </View>
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
  if (!data || data.length === 0) return <EmptyState icon="nft" title="Aucun NFT" subtitle="Les NFT de ce réseau apparaîtront ici dès qu'ils seront détectés." />;
  const isRawAddress = (s: string) => /^0x[a-fA-F0-9]{20,}$/.test(s || '');
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {data.map((n) => (
        <Pressable
          key={`${n.contract}-${n.tokenId}`}
          onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/token/${n.contract}?a=${n.tokenId}`)}
          // Largeur en % (pas fixe) : garantit une vraie grille à 2 colonnes
          // même sur un écran étroit — un width fixe de 160 px ne laissait
          // tenir qu'UNE carte par ligne sur mobile (bannières pleine largeur).
          style={({ pressed }) => ({ width: '47%', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, overflow: 'hidden', opacity: pressed ? 0.75 : 1 })}
        >
          <Image source={{ uri: n.image }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.glassStrong }} resizeMode="cover" />
          <View style={{ padding: spacing(1) }}>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }} numberOfLines={1}>{n.name}</Text>
            {n.collection && !isRawAddress(n.collection) ? <Text style={typography.muted} numberOfLines={1}>{n.collection}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function toneColor(tone: HumanTx['tone'], colors: ReturnType<typeof useTheme>['colors']): string {
  return tone === 'up' ? colors.up : tone === 'down' ? colors.text : tone === 'danger' ? colors.danger : colors.textMuted;
}

/** Historique humanisé (humanizeTx, partagé avec l'app) : « Interaction avec
 *  X » pour les appels de contrat au lieu d'un montant « +0 SOL » trompeur,
 *  et les transferts entrants à 0 (poussière/airdrop spam) sont masqués. */
function HistoryPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const { data, loading } = useAsync<TxSummary[]>(() => getAdapter(chain.id).getHistory(address), [chain.id, address, rev]);
  if (loading) return <SkeletonRows count={5} />;
  const rows = (data ?? [])
    .map((tx) => ({ tx, h: humanizeTx(tx, { nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals }) }))
    .filter(({ h }) => !h.spam);
  if (!rows.length) return <EmptyState icon="history" title="Aucune activité" subtitle="Tes transactions récentes s'afficheront ici." />;
  return (
    <Card>
      {rows.slice(0, 30).map(({ tx, h }, i) => (
        <Pressable
          key={tx.hash}
          onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/tx/${tx.hash}`)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={h.icon} size={16} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={typography.bodyStrong} numberOfLines={1}>{`${h.title}${h.failed ? ' · échoué' : ''}`}</Text>
            <Text style={typography.muted} numberOfLines={1}>{h.subtitle ?? `${short(tx.hash)} · ${ago(tx.timestamp)}`}</Text>
          </View>
          {h.amount ? <Text style={{ color: toneColor(h.tone, colors), fontFamily: fonts.semibold }} numberOfLines={1}>{h.amount}</Text> : null}
        </Pressable>
      ))}
    </Card>
  );
}

interface TokenOption { address: string; symbol: string; decimals: number; logo?: string }

/** Sélecteur de token (natif + tokens détenus) pour le panneau Swap : bouton +
 *  liste dépliable, dans le style de SettingsPanel/AccountCard. */
function TokenPickerRow({
  label, options, selected, onSelect, open, onToggle,
}: {
  label: string; options: TokenOption[]; selected: TokenOption | null; onSelect: (o: TokenOption) => void; open: boolean; onToggle: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <View>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(0.5) }}>
        <Text style={typography.muted}>{label}</Text>
        <View style={{ flex: 1 }} />
        {selected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {selected.logo ? <Image source={{ uri: selected.logo }} style={{ width: 20, height: 20, borderRadius: 10 }} /> : null}
            <Text style={{ color: colors.text, fontFamily: fonts.bold }}>{selected.symbol || short(selected.address)}</Text>
          </View>
        ) : (
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>Choisir</Text>
        )}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="caretDown" size={13} color={colors.textMuted} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ marginTop: spacing(0.5), marginBottom: spacing(0.5), backgroundColor: colors.bgElevated, borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' }}>
          <ScrollView style={{ maxHeight: 200 }}>
            {options.map((o) => {
              const on = selected?.address === o.address;
              return (
                <Pressable key={o.address} onPress={() => onSelect(o)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), backgroundColor: pressed || on ? colors.glass : 'transparent' })}>
                  {o.logo ? <Image source={{ uri: o.logo }} style={{ width: 22, height: 22, borderRadius: 11 }} /> : <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.glassStrong }} />}
                  <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.medium, fontSize: 13, flex: 1 }} numberOfLines={1}>{o.symbol || short(o.address)}</Text>
                  {on ? <Icon name="check" size={13} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** Swap intra-réseau (LI.FI, même agrégateur que l'app) : devis lu ici, mais
 *  approbation + transaction toujours forwardées et signées sur le téléphone.
 *  Limité aux tokens EVM du réseau sélectionné (pas de bridge cross-chain ici). */
function SwapPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const rev = useWebConnect((s) => s.rev);
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  const { data: tokenData } = useAsync<Erc20Token[]>(() => getErc20Tokens(chain, address), [chain.id, address, rev]);
  const { data: nativeBal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  const heldTokens = tokenData ?? [];
  const nativeOption: TokenOption = { address: NATIVE_TOKEN, symbol: chain.nativeSymbol, decimals: chain.nativeDecimals };
  const options: TokenOption[] = [nativeOption, ...heldTokens.map((tk) => ({ address: tk.contract, symbol: tk.symbol, decimals: tk.decimals, logo: tk.logo }))];

  const [fromAddr, setFromAddr] = useState(NATIVE_TOKEN);
  const [toAddr, setToAddr] = useState<string | null>(null);
  const [toCustom, setToCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [amount, setAmount] = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fromOpt = options.find((o) => o.address === fromAddr) ?? nativeOption;
  const toOpt = options.find((o) => o.address === toAddr) ?? null;
  const customValid = /^0x[a-fA-F0-9]{40}$/.test(toCustom.trim());
  const toEffective = toOpt?.address ?? (customValid ? toCustom.trim() : null);

  const fromBalRaw = fromOpt.address === NATIVE_TOKEN
    ? (nativeBal?.raw ?? 0n)
    : (heldTokens.find((tk) => tk.contract.toLowerCase() === fromOpt.address.toLowerCase())?.raw ?? 0n);
  const fromBalStr = formatTokenAmount(fromBalRaw, fromOpt.decimals);

  // Devis LI.FI (même agrégateur que l'app) avec anti-rebond : on attend une
  // pause de saisie avant d'interroger, pour ne pas spammer l'API à chaque frappe.
  useEffect(() => {
    setQuote(null); setQuoteErr(null);
    const raw = amount.replace(',', '.').trim();
    if (!toEffective || toEffective.toLowerCase() === fromOpt.address.toLowerCase() || !/^\d*\.?\d+$/.test(raw) || !(parseFloat(raw) > 0)) return;
    setQuoting(true);
    const id = setTimeout(() => {
      (async () => {
        try {
          const parsed = parseAmount(raw, fromOpt.decimals);
          const q = await getBestQuote({
            fromChainId: chain.id,
            toChainId: chain.id,
            fromToken: fromOpt.address,
            toToken: toEffective,
            fromAmount: parsed.raw.toString(),
            fromAddress: address,
            toAddress: address,
            slippage: 0.005,
          });
          setQuote(q);
        } catch (e) {
          setQuoteErr(e instanceof Error ? e.message : 'Aucune route trouvée.');
        } finally {
          setQuoting(false);
        }
      })();
    }, 600);
    return () => clearTimeout(id);
  }, [fromOpt.address, toEffective, amount, chain.id, address, rev]);

  const onFlip = () => {
    if (!toEffective) return;
    const prevFrom = fromOpt.address;
    setFromAddr(toEffective);
    if (options.some((o) => o.address === prevFrom)) { setToAddr(prevFrom); setToCustom(''); }
    else { setToAddr(null); setToCustom(prevFrom); setShowCustom(true); }
    setAmount(''); setQuote(null); setMsg(null); setErr(null);
  };

  const onSwap = async () => {
    if (!quote || quote.tx.type !== 'evm') return;
    setErr(null); setMsg(null); setBusy(true);
    try {
      if (quote.approvalAddress) {
        setStep('Approbation du token dans l\'app Kalyx…');
        const data = encodeErc20Approve(quote.approvalAddress, quote.fromAmount);
        await request('eth_sendTransaction', [{ to: fromOpt.address, value: '0x0', data }]);
      }
      setStep('Validez l\'échange dans l\'app Kalyx…');
      const tx = quote.tx;
      const hash = await request('eth_sendTransaction', [{ to: tx.to, value: '0x' + tx.value.toString(16), data: tx.data }]);
      setMsg(`Échange envoyé : ${short(hash)}`);
      setAmount(''); setQuote(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refusé ou échoué.');
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  if (!chain.evmChainId) {
    return <Note text={`Le swap n'est disponible que sur les réseaux EVM pris en charge par Kalyx.`} />;
  }

  return (
    <Card>
      <TokenPickerRow label="Tu donnes" options={options} selected={fromOpt} open={picker === 'from'} onToggle={() => setPicker(picker === 'from' ? null : 'from')} onSelect={(o) => { setFromAddr(o.address); setPicker(null); setQuote(null); }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -4 }}>
        <Pressable onPress={() => setAmount(fromBalStr)} hitSlop={6}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{`Solde ${fromBalStr} · Max`}</Text>
        </Pressable>
      </View>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4, marginBottom: spacing(1) }} />

      <View style={{ alignItems: 'center', marginVertical: -spacing(0.5) }}>
        <Pressable onPress={onFlip} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder }}>
          <Icon name="convert" size={15} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={{ marginTop: spacing(1) }}>
        <TokenPickerRow label="Tu reçois" options={options} selected={toOpt} open={picker === 'to'} onToggle={() => setPicker(picker === 'to' ? null : 'to')} onSelect={(o) => { setToAddr(o.address); setShowCustom(false); setToCustom(''); setPicker(null); }} />
        <Pressable onPress={() => setShowCustom((v) => !v)} hitSlop={6}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12, marginTop: 2 }}>{showCustom ? 'Choisir dans la liste' : 'Autre token (adresse de contrat)'}</Text>
        </Pressable>
        {showCustom ? (
          <TextInput
            value={toCustom}
            onChangeText={(v) => { setToCustom(v); setToAddr(null); }}
            placeholder="0x…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={{ color: colors.text, fontSize: 14, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1), marginTop: spacing(0.5) }}
          />
        ) : null}
      </View>

      {quoting ? <Text style={[typography.muted, { marginTop: spacing(1) }]}>Recherche du meilleur prix…</Text> : null}
      {quoteErr ? <Text style={{ color: colors.danger, marginTop: spacing(1) }}>{quoteErr}</Text> : null}
      {quote && quote.tx.type === 'evm' ? (
        <View style={{ marginTop: spacing(1.25), gap: spacing(0.6) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>Tu reçois au moins</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.bold }}>{`${formatTokenAmount(quote.toAmountMin, quote.toToken.decimals)} ${quote.toToken.symbol}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>Frais réseau estimés</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{`≈ ${sym}${quote.gasCostUsd.toFixed(2)}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>Frais Kalyx</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{`${((quote.kalyxFeeApplied ?? 0) * 100).toFixed(2)} %`}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>Fournisseur</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{quote.toolName}</Text>
          </View>
        </View>
      ) : null}

      <Pressable onPress={onSwap} disabled={!quote || busy || quoting} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.4), opacity: pressed || busy || !quote || quoting ? 0.6 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>{busy ? (step ?? 'En attente de l\'app…') : t("swapAction")}</Text>
      </Pressable>
      {msg ? <Text style={{ color: colors.accent, marginTop: spacing(1) }}>{msg}</Text> : null}
      {err ? <Text style={{ color: colors.danger, marginTop: spacing(1) }}>{err}</Text> : null}
    </Card>
  );
}

function SendPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const rev = useWebConnect((s) => s.rev);
  const contacts = useContacts((s) => s.contacts);
  const { data: bal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  const balStr = bal ? formatTokenAmount(bal.raw, bal.decimals) : '0';
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const matchedContact = contacts.find((c) => c.address.toLowerCase() === to.trim().toLowerCase());

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>{t("labelRecipient")}</Text>
        {contacts.length ? (
          <Pressable onPress={() => setShowContacts((v) => !v)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="contacts" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{t("addressBook")}</Text>
          </Pressable>
        ) : null}
      </View>
      {showContacts && contacts.length ? (
        <View style={{ marginTop: 4, marginBottom: spacing(1), backgroundColor: colors.bgElevated, borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' }}>
          <ScrollView style={{ maxHeight: 180 }}>
            {contacts.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => { setTo(c.address); setShowContacts(false); }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), backgroundColor: pressed ? colors.glass : 'transparent' })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>{c.name}</Text>
                  <Text style={typography.muted} numberOfLines={1}>{short(c.address)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <TextInput value={to} onChangeText={setTo} placeholder="0x…" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4 }} />
      {matchedContact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Icon name="check" size={12} color={colors.up} />
          <Text style={{ color: colors.up, fontSize: 12, fontFamily: fonts.medium }}>{matchedContact.name}</Text>
        </View>
      ) : null}
      <View style={{ height: spacing(1) }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>Montant ({chain.nativeSymbol})</Text>
        <Pressable onPress={() => setAmount(balStr)} hitSlop={6}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{`Solde ${balStr} · Max`}</Text>
        </Pressable>
      </View>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4 }} />
      <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.4), opacity: pressed || busy ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>{busy ? 'En attente de l\'app…' : t("aiSend")}</Text>
      </Pressable>
      {msg ? <Text style={{ color: colors.accent, marginTop: spacing(1) }}>{msg}</Text> : null}
      {err ? <Text style={{ color: colors.danger, marginTop: spacing(1) }}>{err}</Text> : null}
    </Card>
  );
}
