/**
 * ACHETER DE LA CRYPTO (MoonPay), en étapes simples :
 *
 *   1. le montant, au clavier, avec l'estimation en direct ;
 *   2. le token, puis 3. le réseau (seulement ceux où l'achat arrive vraiment) ;
 *   4. le moyen de paiement ; 5. le récapitulatif, frais compris ;
 *   puis le widget MoonPay (paiement, vérification d'identité la 1re fois) ;
 *   6. le suivi en direct ; 7. le succès ; 8. le détail ;
 *   9. « indisponible » si le pays n'est pas couvert ; 10. l'échec, avec une
 *   action immédiate.
 *
 * L'URL du widget est construite et SIGNÉE par notre serveur (la clé secrète
 * n'est pas dans l'app), liée à l'adresse de l'utilisateur et à l'IP de
 * l'appareil. Kalyx n'ajoute aucun frais : les chiffres sont ceux de MoonPay.
 */
import { withWatchOnlyGate } from '../ui/WatchOnlyGate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Platform, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, cancelAnimation } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { Text, Button, IconButton, Card, Sheet, TokenIcon, Skeleton, Pressable as KPressable, Input } from '../ui/kit';
import { getBuyEmail, setBuyEmail } from '../lib/payerProfile';
import { createStripeSession, isStripeSessionId, stripeNetworkOf, stripeOrMoonpayTx, stripeSession, StripeRampError } from '../lib/stripeOnramp';
import { isValidEmail } from '../src/domain/pay/payPrefill';
import { haptic } from '../lib/haptics';
import { Image } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useBuyHistory, type BuyRecord } from '../lib/buyHistory';
import { useFallbackLogo, nativeCoinLogo } from '../ui/kit/useFallbackLogo';
import { useTheme } from '../ui/theme';
import { Icon, type IconName } from '../ui/icon';
import { space, radii, SCREEN_MARGIN, fontFamily } from '../ui/tokens';
import { ScreenDunes } from '../ui/nova';
import { useT, useSettings, fiatSymbol } from '../lib/settingsStore';
import { fill } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { addressForChain } from '../lib/accountAddress';
import { notifyAndLog } from '../lib/notificationCenter';
import { technicalLogger } from '../lib/technicalLogger';
import { toast } from '../lib/toast';
import { useReduceMotion } from '../lib/reduceMotion';
import {
  rampCurrencies,
  rampQuote,
  rampWidgetUrl,
  rampTransaction,
  rampRegion,
  RampError,
  BUY_REDIRECT_URL,
  type RampEnv,
  type RampQuote,
  type RampTx,
} from '../lib/moonpay';
import {
  listChains,
  chainNameOf,
  chainIconUrl,
  shortAddress,
  formatFiat,
  formatNumber,
  buildExplorerTxUrl,
  embeddedTokenLogo,
  PAY_LOGO_PATH,
  decimalSeparator,
  buyableAssets,
  groupBuyTokens,
  networkFeeTier,
  isStablecoin,
  pickFiat,
  amountProblem,
  paymentMethodsFor,
  needsSystemBrowser,
  parseBuyRedirect,
  buyTrackerUrl,
  buyProgress,
  isMoonpayHost,
  rampWalletAddress,
  type BuyAsset,
  type BuyToken,
  type BuyPaymentMethod,
  type BuyStepState,
  type RampCurrency,
} from '../src';

/** Haut du contenu, en fraction de l'écran, étape par étape (mesuré sur la maquette). */
const TOP_AT: Partial<Record<Step, number>> = { review: 0.24, details: 0.24 };

type Step = 'amount' | 'review' | 'widget' | 'processing' | 'success' | 'details' | 'failed' | 'unavailable';

const UNSUPPORTED_URL = 'https://support.moonpay.com/customers/docs/moonpays-unsupported-countries';

const PM: Record<BuyPaymentMethod, { key: 'pmCard' | 'pmApplePay' | 'pmGooglePay' | 'pmSepa' | 'pmBankTransfer'; sub?: 'pmCardSub' | 'pmTransferSub'; icon?: IconName; badge?: string }> = {
  credit_debit_card: { key: 'pmCard', sub: 'pmCardSub', icon: 'card' },
  apple_pay: { key: 'pmApplePay', badge: ' Pay' },
  google_pay: { key: 'pmGooglePay', badge: 'G Pay' },
  sepa_bank_transfer: { key: 'pmSepa', sub: 'pmTransferSub', icon: 'bank' },
  gbp_bank_transfer: { key: 'pmBankTransfer', sub: 'pmTransferSub', icon: 'bank' },
};

/** Logo du token ; la pastille du réseau si ce n'est pas sa chaîne d'origine. */
function AssetIcon({ asset, size = 40, badge = true }: { asset: BuyAsset; size?: number; badge?: boolean }) {
  // Vrai logo embarqué (actif vérifié par MoonPay), sinon celui de la liste du réseau.
  const fallback = useFallbackLogo(asset.chainId, asset.contract ?? undefined, asset.contract ? null : nativeCoinLogo(asset.chainId));
  const logo = embeddedTokenLogo(asset.symbol) ?? fallback;
  const home = asset.chainId === 'ethereum' || (!asset.contract && ['bitcoin', 'solana', 'ton'].includes(asset.chainId));
  return <TokenIcon symbol={asset.symbol} logo={logo} seed={asset.contract ?? asset.code} size={size} badge={badge && !home ? chainIconUrl(asset.chainId) : null} />;
}

const MOONPAY_LOGO = require('../assets/brands/moonpay.png');

/** Logo MoonPay (avatar officiel de l'organisation). */
function MoonPayLogo({ size = 36 }: { size?: number }) {
  return <Image source={MOONPAY_LOGO} style={{ width: size, height: size, borderRadius: size * 0.28 }} accessibilityIgnoresInvertColors />;
}

/** Vrais logos des moyens de paiement (tracés officiels, couleur selon le thème). */
/** Logo Stripe : le « S » blanc sur le violet de la marque (dessiné ici, aucune image distante). */
function StripeLogo({ size = 36 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#635BFF', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: size * 0.55, lineHeight: size * 0.7 }}>S</Text>
    </View>
  );
}

function PayLogo({ method, height = 24 }: { method: BuyPaymentMethod; height?: number }) {
  const { colors, mode } = useTheme();
  const glyph = (d: string, fillColor: string, w = height) => (
    <SvgXml xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fillColor}" d="${d}"/></svg>`} width={w} height={w} />
  );
  const frame = (child: React.ReactNode) => (
    <View style={{ width: 44, height: 30, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: mode === 'dark' ? colors.surface2 : '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 1 }}>
      {child}
    </View>
  );
  switch (method) {
    case 'apple_pay':
      return frame(glyph(PAY_LOGO_PATH.applepay, mode === 'dark' ? '#FFFFFF' : '#000000', 30));
    case 'google_pay':
      return frame(glyph(PAY_LOGO_PATH.googlepay, mode === 'dark' ? '#FFFFFF' : '#3C4043', 30));
    case 'sepa_bank_transfer':
      return frame(glyph(PAY_LOGO_PATH.sepa, mode === 'dark' ? '#8EA6FF' : '#2350A9', 30));
    case 'credit_debit_card':
      return frame(
        <>
          {glyph(PAY_LOGO_PATH.visa, mode === 'dark' ? '#FFFFFF' : '#1A1F71', 20)}
          {/* Mastercard : deux disques et leur intersection */}
          <SvgXml
            xml={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 20"><circle cx="11" cy="10" r="8" fill="#EB001B"/><circle cx="21" cy="10" r="8" fill="#F79E1B"/><path fill="#FF5F00" d="M16 3.75a8 8 0 0 1 0 12.5 8 8 0 0 1 0-12.5"/></svg>'}
            width={18}
            height={12}
          />
        </>,
      );
    default:
      return frame(<Icon name="bank" size={18} color={colors.text} />);
  }
}

function Radio({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return on ? (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="checkmark" size={12} color={colors.bg} weight="bold" />
    </View>
  ) : (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.textTertiary }} />
  );
}

/** Clavier du montant : touches encadrées, virgule selon la langue, 2 décimales. */
function BoxKeypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const sep = decimalSeparator();
  const press = (k: string) => {
    haptic.selection();
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === sep) return onChange(value.includes(sep) ? value : (value || '0') + sep);
    const [int, dec] = value.split(sep);
    if (dec !== undefined && dec.length >= 2) return;
    if (dec === undefined && int.length >= 7) return;
    onChange(value === '0' ? k : value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', sep, '0', 'del'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {keys.map((k) => (
        <KPressable
          key={k}
          onPress={() => press(k)}
          accessibilityRole="button"
          accessibilityLabel={k === 'del' ? '⌫' : k}
          style={{ width: '31%', flexGrow: 1, height: 56, borderRadius: 14, backgroundColor: k === 'del' || k === sep ? 'transparent' : colors.surface2, alignItems: 'center', justifyContent: 'center' }}
        >
          {k === 'del' ? <Icon name="backspace" size={26} color={colors.text} /> : <Text style={{ fontFamily: fontFamily.semibold, fontSize: 28, lineHeight: 36, color: colors.text, includeFontPadding: false }}>{k}</Text>}
        </KPressable>
      ))}
    </View>
  );
}

/** Le montant saisi : il « répond » à chaque touche (petit rebond). */
function AmountText({ label, empty, size = 44 }: { label: string; empty: boolean; size?: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const k = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    k.value = withSequence(withTiming(1.06, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 260 }));
  }, [label, reduce, k]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return (
    <Animated.Text style={[{ fontFamily: fontFamily.bold, fontSize: size, color: empty ? colors.textTertiary : colors.text, fontVariant: ['tabular-nums'] }, st]} accessibilityRole="text">
      {label}
    </Animated.Text>
  );
}

/** Délai d'un moyen de paiement. */
const ETA: Record<BuyPaymentMethod, 'buyInstant' | 'pmTransferSub'> = {
  credit_debit_card: 'buyInstant',
  apple_pay: 'buyInstant',
  google_pay: 'buyInstant',
  sepa_bank_transfer: 'pmTransferSub',
  gbp_bank_transfer: 'pmTransferSub',
};

/** Durée de vie d'un devis à l'écran avant actualisation. */
const QUOTE_TTL = 30;

/** Montants rapides. */
const QUICK = [50, 100, 250];

/** Ligne de choix (token, réseau, moyen de paiement), encadrée quand elle est choisie. */
function ChoiceRow({ left, title, sub, on, onPress, aside }: { left: React.ReactNode; title: string; sub?: string; on: boolean; onPress: () => void; aside?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <KPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radii.lg, borderWidth: 1.5, borderColor: on ? colors.warm : 'transparent', backgroundColor: on ? colors.surface2 : 'transparent' }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
        {sub ? <Text variant="caption" tone="secondary" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {aside}
      <Radio on={on} />
    </KPressable>
  );
}

function Row({ label, value, left, strong, last, tone }: { label: string; value: string; left?: React.ReactNode; strong?: boolean; last?: boolean; tone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="caption" tone="secondary">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        {left}
        <Text variant={strong ? 'bodyStrong' : 'body'} tabular numberOfLines={1} style={{ textAlign: 'right', ...(tone ? { color: tone } : null) }}>{value}</Text>
      </View>
    </View>
  );
}

/** Anneau qui tourne autour du logo pendant le traitement. */
function ProgressRing({ children }: { children: React.ReactNode }) {
  const { colors, tints } = useTheme();
  const reduce = useReduceMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    spin.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduce, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const S = 156;
  const r = 72;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Svg width={S} height={S} style={{ position: 'absolute' }}>
        <Circle cx={S / 2} cy={S / 2} r={r} stroke={colors.border} strokeWidth={6} fill="none" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', width: S, height: S }, style]}>
        <Svg width={S} height={S}>
          <Circle cx={S / 2} cy={S / 2} r={r} stroke={tints.buy.ink} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.32} ${c}`} />
        </Svg>
      </Animated.View>
      {children}
    </View>
  );
}

/** Étapes du traitement. */
function Stepper({ labels, states }: { labels: string[]; states: BuyStepState[] }) {
  const { colors, tints } = useTheme();
  return (
    <View style={{ gap: space[3], alignSelf: 'stretch', paddingHorizontal: space[4] }}>
      {labels.map((l, i) => {
        const s = states[i] ?? 'todo';
        const bg = s === 'done' ? colors.up : s === 'failed' ? colors.danger : 'transparent';
        return (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: s === 'todo' || s === 'active' ? 2 : 0, borderColor: s === 'active' ? tints.buy.ink : colors.border }}>
              {s === 'done' ? <Icon name="checkmark" size={11} color="#FFFFFF" weight="bold" /> : null}
              {s === 'failed' ? <Icon name="close" size={11} color="#FFFFFF" weight="bold" /> : null}
              {s === 'active' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tints.buy.ink }} /> : null}
            </View>
            <Text variant="body" tone={s === 'todo' ? 'tertiary' : undefined}>{l}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Quelques confettis, posés (pas d'animation qui distrait). */
function Confetti() {
  const { tints } = useTheme();
  const bits = [
    { l: '12%', t: 8, r: '20deg', c: tints.earn.ink },
    { l: '82%', t: 18, r: '-30deg', c: tints.buy.ink },
    { l: '6%', t: 92, r: '50deg', c: tints.send.ink },
    { l: '90%', t: 98, r: '10deg', c: tints.earn.ink },
    { l: '22%', t: 150, r: '-15deg', c: tints.swap.ink },
    { l: '76%', t: 160, r: '35deg', c: tints.receive.ink },
  ];
  return (
    <>
      {bits.map((b, i) => (
        <View key={i} pointerEvents="none" style={{ position: 'absolute', left: b.l as `${number}%`, top: b.t, width: 10, height: 6, borderRadius: 3, backgroundColor: b.c, opacity: 0.8, transform: [{ rotate: b.r }] }} />
      ))}
    </>
  );
}

function BuyScreenInner() {
  const t = useT();
  const { colors, mode, tints } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ symbol?: string; chain?: string }>();
  const fiatPref = useSettings((s) => s.fiat);
  const account = useWallet((s) => s.accounts.find((a) => a.index === s.activeAccountIndex) ?? s.accounts[0]);

  const [step, setStep] = useState<Step>('amount');
  const [currencies, setCurrencies] = useState<RampCurrency[] | null>(null);
  const [env, setEnv] = useState<RampEnv>('sandbox');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [asset, setAsset] = useState<BuyAsset | null>(null);
  const [sheet, setSheet] = useState<'token' | 'network' | 'method' | null>(null);
  const [pendingToken, setPendingToken] = useState<BuyToken | null>(null);
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<BuyPaymentMethod>(Platform.OS === 'ios' ? 'apple_pay' : 'credit_debit_card');
  const [quote, setQuote] = useState<RampQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [tx, setTx] = useState<RampTx | null>(null);
  const [providerInfo, setProviderInfo] = useState(false);
  /** Fournisseur choisi au récapitulatif ; Stripe : session en cours et son mode (test ou réel). */
  const [provider, setProvider] = useState<'moonpay' | 'stripe'>('moonpay');
  const [stripe, setStripe] = useState<{ id: string; mode: 'test' | 'live' } | null>(null);
  const [checkingStripe, setCheckingStripe] = useState(false);
  const txOf = (id: string) => stripeOrMoonpayTx(id, rampTransaction);
  // Crypto ou réseau que Stripe ne livre pas : retour à MoonPay.
  useEffect(() => {
    if (provider === 'stripe' && asset && !stripeNetworkOf(asset.chainId)) setProvider('moonpay');
  }, [provider, asset]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /*
   * MES ACHATS À JOUR. Une commande quittée en cours restait « en cours » dans
   * la liste pour toujours (son statut n'était relu qu'en l'ouvrant) : à
   * l'ouverture de la liste, les commandes en cours sont relues.
   */
  useEffect(() => {
    if (!historyOpen) return;
    const pending = useBuyHistory.getState().items.filter((h) => buyProgress({ status: h.status }).outcome === 'pending').slice(0, 5);
    for (const h of pending) {
      void txOf(h.id)
        .then((next) => useBuyHistory.getState().upsert({ id: next.id, status: next.status, cryptoAmount: next.quoteCurrencyAmount, txHash: next.cryptoTransactionId }))
        .catch(() => {});
    }
  }, [historyOpen]);
  const [methodQuotes, setMethodQuotes] = useState<Partial<Record<BuyPaymentMethod, RampQuote | null>>>({});
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [ttl, setTtl] = useState(QUOTE_TTL);
  const history = useBuyHistory((h) => h.items);
  const upsertBuy = useBuyHistory((h) => h.upsert);
  useEffect(() => {
    void useBuyHistory.getState().load();
  }, []);
  const { height: winH } = useWindowDimensions();

  const chains = useMemo(() => listChains({ includeTestnets: false }), []);
  const load = () => {
    setLoadError(null);
    // Pays couvert ? (dans le doute, on laisse essayer : le widget tranchera)
    void rampRegion().then((r) => {
      if (r && !r.isBuyAllowed) setStep('unavailable');
    });
    rampCurrencies().then(
      (r) => {
        setCurrencies(r.currencies);
        setEnv(r.env);
      },
      (e: unknown) => setLoadError(e instanceof RampError && e.status === 503 ? t('buyNotConfigured') : t('buyUnavailable')),
    );
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assets = useMemo(() => (currencies ? buyableAssets(currencies, chains, { sandbox: env === 'sandbox' }) : []), [currencies, chains, env]);
  const tokens = useMemo(() => groupBuyTokens(assets), [assets]);
  const fiat = useMemo(() => (currencies ? pickFiat(currencies, fiatPref) : null), [currencies, fiatPref]);
  const fiatCode = fiat?.code ?? 'usd';
  const fiatSym = fiatSymbol(fiatCode);
  const methods = useMemo(() => paymentMethodsFor(Platform.OS, fiatCode), [fiatCode]);
  useEffect(() => {
    if (!methods.includes(method)) setMethod(methods[0]);
  }, [methods, method]);

  // Pré-sélection : la crypto demandée (fiche token), sinon l'USDC, sinon la première.
  useEffect(() => {
    if (asset || assets.length === 0) return;
    const sym = String(params.symbol ?? '').toUpperCase();
    const ch = String(params.chain ?? '');
    setAsset(
      assets.find((a) => a.symbol === sym && (!ch || a.chainId === ch)) ??
        assets.find((a) => a.symbol === sym) ??
        assets.find((a) => a.symbol === 'USDC' && a.chainId === 'base') ??
        assets[0],
    );
  }, [assets, asset, params.symbol, params.chain]);

  const chainCfg = asset ? chains.find((c) => c.id === asset.chainId) : undefined;
  const address = chainCfg ? addressForChain(account, chainCfg) : '';
  const amount = Number((amountText || '0').replace(',', '.'));
  const problem = amountProblem(amount, fiat);
  const validAmount = Number.isFinite(amount) && amount > 0 && !problem;
  const money = (v: number) => `${formatFiat(v)} ${fiatSym}`;
  const amountLabel = `${amountText || '0'} ${fiatSym}`;
  const cryptoLabel = (n: number | null | undefined) => `${n == null ? '—' : formatNumber(n)} ${asset?.symbol ?? ''}`;

  // Devis réel, recalculé à chaque changement (avec un léger délai de frappe).
  const seq = useRef(0);
  const quoteKey = useRef('');
  useEffect(() => {
    // Simple actualisation (même demande) : l'ancien devis reste affiché en attendant.
    const key = `${asset?.code}|${amount}|${fiatCode}|${method}`;
    if (key !== quoteKey.current) {
      quoteKey.current = key;
      setQuote(null);
    }
    setQuoteError(null);
    if (!asset || !validAmount) return;
    const id = ++seq.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      rampQuote({ currencyCode: asset.code, baseCurrencyCode: fiatCode, baseCurrencyAmount: amount, paymentMethod: method })
        .then((q) => id === seq.current && setQuote(q))
        .catch((e: unknown) => id === seq.current && setQuoteError(e instanceof RampError ? e.message : t('buyUnavailable')))
        .finally(() => id === seq.current && setQuoting(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [asset, amount, validAmount, fiatCode, method, t, quoteNonce]);

  // Récapitulatif : le devis vit QUOTE_TTL secondes, puis il est redemandé.
  useEffect(() => {
    if (step !== 'review') return;
    setTtl(QUOTE_TTL);
    const id = setInterval(() => {
      setTtl((v) => {
        if (v <= 1) {
          setQuoteNonce((n) => n + 1);
          return QUOTE_TTL;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // Moyens de paiement : le devis RÉEL de chacun, pour comparer les frais.
  useEffect(() => {
    if (sheet !== 'method' || !asset || !validAmount) return;
    let alive = true;
    setMethodQuotes({});
    for (const m of methods) {
      rampQuote({ currencyCode: asset.code, baseCurrencyCode: fiatCode, baseCurrencyAmount: amount, paymentMethod: m }).then(
        (q) => alive && setMethodQuotes((prev) => ({ ...prev, [m]: q })),
        () => alive && setMethodQuotes((prev) => ({ ...prev, [m]: null })),
      );
    }
    return () => {
      alive = false;
    };
  }, [sheet, asset, amount, validAmount, fiatCode, methods]);

  /*
   * E-MAIL MOONPAY, mémorisé sur l'appareil : le widget s'ouvre dessus, il ne
   * reste que le code reçu par e-mail (MoonPay garde l'identité vérifiée de son
   * côté, une fois pour toutes). Vide = rien n'est prérempli ni gardé.
   */
  const [email, setEmail] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  useEffect(() => {
    void getBuyEmail().then((e) => {
      if (e) {
        setEmail(e);
        setEmailSaved(true);
      }
    });
  }, []);
  const emailOk = !email.trim() || isValidEmail(email);

  const openStripe = async () => {
    if (!asset || !address || !validAmount) return;
    setOpening(true);
    try {
      const s = await createStripeSession({ chainId: asset.chainId, symbol: asset.symbol, address, fiat: fiatCode, amount });
      if (!s.url) throw new StripeRampError('no url', 502);
      technicalLogger.log('DAPP', 'Achat : page Stripe ouverte', { mode: s.mode, currency: asset.symbol, chain: asset.chainId });
      setStripe({ id: s.id, mode: s.mode });
      setWidgetUrl(s.url);
      setStep('widget');
    } catch (e) {
      toast.error(t('buyUnavailable'), e instanceof StripeRampError ? e.message : undefined);
    } finally {
      setOpening(false);
    }
  };

  /*
   * Page Stripe fermée : elle ne renvoie pas vers l'app. On relit la session :
   * payée (en cours de livraison ou livrée) → suivi ; refusée → échec ;
   * sinon (rien payé) → retour au récapitulatif, sans bruit.
   */
  const closeStripe = async () => {
    const cur = stripe;
    setWidgetUrl(null);
    if (!cur) return setStep('review');
    setCheckingStripe(true);
    try {
      const s = await stripeSession(cur.id);
      if (s.status === 'fulfillment_processing' || s.status === 'fulfillment_complete') onPurchaseReturned({ transactionId: s.id, status: 'pending' });
      else if (s.status === 'rejected') onPurchaseReturned({ transactionId: s.id, status: 'failed' });
      else setStep('review');
    } catch {
      setStep('review');
    } finally {
      setCheckingStripe(false);
    }
  };

  const openWidget = async () => {
    if (provider === 'stripe') return openStripe();
    if (!asset || !address || !validAmount || !emailOk) return;
    setOpening(true);
    try {
      const mail = email.trim() || undefined;
      if (mail) {
        void setBuyEmail(mail);
        setEmailSaved(true);
      }
      // Mode test : MoonPay livre du Bitcoin de test, il lui faut l'adresse tb1… (même clé).
      const r = await rampWidgetUrl({ currencyCode: asset.code, walletAddress: rampWalletAddress(asset.chainId, address, { sandbox: env === 'sandbox' }), baseCurrencyCode: fiatCode, baseCurrencyAmount: amount, paymentMethod: method, theme: mode === 'light' ? 'light' : 'dark', ...(mail ? { email: mail } : {}) });
      technicalLogger.log('DAPP', 'Achat : widget MoonPay ouvert', { env: r.env, currency: asset.code, method });
      // Google Pay ne fonctionne pas dans une vue web : Chrome (même appareil, même IP).
      if (needsSystemBrowser(method)) await Linking.openURL(r.url);
      else {
        setWidgetUrl(r.url);
        setStep('widget');
      }
    } catch (e) {
      toast.error(t('buyUnavailable'), e instanceof RampError ? e.message : undefined);
    } finally {
      setOpening(false);
    }
  };

  // Suivi en direct de la commande, jusqu'à son issue.
  useEffect(() => {
    if (!txId || step !== 'processing') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const next = await txOf(txId);
        if (!alive) return;
        setTx(next);
        upsertBuy({ id: next.id, status: next.status, cryptoAmount: next.quoteCurrencyAmount, txHash: next.cryptoTransactionId });
        const { outcome } = buyProgress(next);
        if (outcome === 'completed') {
          notifyAndLog('tx', t('buySuccessTitle'), `+${formatNumber(next.quoteCurrencyAmount ?? 0)} ${asset?.symbol ?? ''}`);
          setStep('success');
          return;
        }
        if (outcome === 'failed') {
          setStep('failed');
          return;
        }
      } catch {
        // Réseau coupé ou commande pas encore visible : on réessaie.
      }
      if (alive) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [txId, step, asset?.symbol, t, upsertBuy]);

  const onPurchaseReturned = (r: { transactionId: string; status: string }) => {
    setWidgetUrl(null);
    setTxId(r.transactionId);
    setTx(null);
    setStep(r.status === 'failed' ? 'failed' : 'processing');
    if (asset) {
      upsertBuy({ id: r.transactionId, at: Date.now(), fiatAmount: amount, fiat: fiatCode, code: asset.code, symbol: asset.symbol, name: asset.name, chainId: asset.chainId, contract: asset.contract, status: r.status, cryptoAmount: provider === 'stripe' ? null : quote?.quoteCurrencyAmount ?? null, txHash: null });
    }
    notifyAndLog('tx', t('buyPendingTitle'), asset ? `${amountLabel} → ${asset.symbol} (${chainNameOf(asset.chainId) ?? asset.chainId})` : undefined);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const back = () => {
    if (step === 'review') setStep('amount');
    else if (step === 'details') setStep('success');
    else if (step === 'widget') {
      if (provider === 'stripe') return void closeStripe();
      setWidgetUrl(null);
      setStep('review');
    } else close();
  };

  /* ── Widget MoonPay, plein écran ─────────────────────────────────────── */
  if (step === 'widget' && widgetUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SCREEN_MARGIN, height: 48 }}>
          <Text variant="bodyStrong">{provider === 'stripe' ? `Stripe${stripe?.mode === 'test' ? ` · ${t('buyTestMode')}` : ''}` : `MoonPay${env === 'sandbox' ? ` · ${t('buyTestMode')}` : ''}`}</Text>
          {checkingStripe ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <IconButton icon="close" label={t('close')} tone="glass" onPress={back} />}
        </View>
        <WebView
          source={{ uri: widgetUrl }}
          // Session MoonPay gardée d'un achat à l'autre : cookies persistants partagés (iOS), cookies de MoonPay acceptés (Android).
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          cacheEnabled
          // Vérification d'identité : caméra, vidéo d'instructions en ligne, envoi de documents.
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          /*
           * Caméra et micro : accordés d'office au SEUL site du widget (vérification
           * d'identité MoonPay). Toute autre page chargée ici — banque, PayPal,
           * redirection — doit les DEMANDER : avant, n'importe laquelle les recevait.
           */
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          // Pas d'accès aux fichiers locaux (file://) : l'envoi de documents passe par le sélecteur du système.
          allowFileAccess={false}
          // Apple Pay dans la vue web (iOS). Aucun script n'est injecté dans cette page.
          enableApplePay
          // Fenêtres surgissantes (PayPal, banques) : ouvertes sur place, où le filtre décide.
          setSupportMultipleWindows={false}
          originWhitelist={['https://*']}
          startInLoadingState
          onShouldStartLoadWithRequest={(req) => {
            const ret = parseBuyRedirect(req.url, BUY_REDIRECT_URL);
            if (ret) {
              onPurchaseReturned(ret);
              return false;
            }
            if (req.isTopFrame === false) return /^(?:https|about|blob):/i.test(req.url);
            if (/^(?:about|blob):/i.test(req.url)) return true;
            if (req.url.startsWith('https://')) {
              // MoonPay, et ce qu'il enchaîne (3-D Secure de la banque, PayPal…) : dans la page.
              try {
                const host = new URL(req.url).host;
                if (!isMoonpayHost(host)) technicalLogger.log('DAPP', 'Achat : page tierce dans le widget', { host });
              } catch {
                return false;
              }
              return true;
            }
            void Linking.openURL(req.url).catch(() => {});
            return false;
          }}
        />
      </View>
    );
  }

  const title =
    step === 'details' ? t('buyDetailsTitle') : t('buy');
  const showBack = step !== 'success' && step !== 'processing';

  const body = (() => {
    if (loadError) {
      return (
        <Centered>
          <IllusDisc icon="warning" />
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('buyUnavailableTitle')}</Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>{loadError}</Text>
          <Button label={t('retry')} variant="secondary" onPress={load} />
        </Centered>
      );
    }
    if (step === 'unavailable') {
      return (
        <Centered>
          <IllusDisc icon="faq" />
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('buyUnavailableTitle')}</Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>{t('buyUnavailableRegion')}</Text>
          <Button label={t('learnMore')} variant="secondary" onPress={() => void Linking.openURL(UNSUPPORTED_URL)} />
        </Centered>
      );
    }
    if (!currencies) {
      return <Card><View style={{ gap: space[3], alignItems: 'center' }}><Skeleton width="40%" height={40} /><Skeleton width="30%" height={12} /><Skeleton width="100%" height={220} /></View></Card>;
    }
    if (assets.length === 0 || !asset) {
      return (
        <Centered>
          <IllusDisc icon="faq" />
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('buyUnavailableTitle')}</Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>{t('buyNoAssets')}</Text>
        </Centered>
      );
    }

    if (step === 'amount') {
      const big = amountLabel.length > 8 ? 56 : 72;
      return (
        <View style={{ flex: 1, gap: space[3] }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2], minHeight: 200 }}>
            <AmountText label={amountLabel} empty={!amountText} size={big} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
              {quoting ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
              <Text variant="body" tone="secondary" tabular>{validAmount ? `≈ ${cryptoLabel(quote?.quoteCurrencyAmount)}` : ' '}</Text>
            </View>
            <KPressable
              onPress={() => setSheet('method')}
              accessibilityRole="button"
              accessibilityLabel={t('buyPaymentMethod')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radii.full, backgroundColor: colors.surface2, marginTop: space[2] }}
            >
              <PayLogo method={method} />
              <Text variant="bodyStrong">{t(PM[method].key)}</Text>
              <Icon name="caretDown" size={14} color={colors.textSecondary} />
            </KPressable>
            {fiat && problem ? (
              <Text variant="caption" tone="warning">
                {problem === 'min' ? fill(t('buyMin'), { amount: money(fiat.minBuyAmount ?? 0) }) : fill(t('buyMax'), { amount: money(fiat.maxBuyAmount ?? 0) })}
              </Text>
            ) : null}
            {quoteError ? <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{quoteError}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {QUICK.map((q) => (
              <KPressable
                key={q}
                onPress={() => setAmountText(String(q))}
                style={{ flex: 1, alignItems: 'center', paddingVertical: space[3], borderRadius: radii.full, backgroundColor: colors.surface2 }}
              >
                <Text variant="bodyStrong" tabular>{`${q} ${fiatSym}`}</Text>
              </KPressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <MoonPayLogo size={16} />
            <Text variant="caption" tone="tertiary">{fill(t('buyPoweredBy'), { provider: 'MoonPay' })}</Text>
          </View>
          <Button label={t('continueWord')} disabled={!validAmount || !address} onPress={() => setStep('review')} />
          {!address ? <Text variant="micro" tone="warning" style={{ textAlign: 'center' }}>{t('buyNoAddress')}</Text> : null}
          <BoxKeypad value={amountText} onChange={setAmountText} />
        </View>
      );
    }

    if (step === 'review') {
      const viaStripe = provider === 'stripe';
      // Devis MoonPay : il ne vaut pas pour Stripe, qui affiche ses propres frais sur sa page.
      const fees = quote && !viaStripe ? quote.feeAmount + quote.networkFeeAmount + quote.extraFeeAmount : null;
      const rate = quote && !viaStripe && quote.quoteCurrencyAmount > 0 ? quote.baseCurrencyAmount / quote.quoteCurrencyAmount : null;
      const stripeOk = !!stripeNetworkOf(asset.chainId);
      const stripeNote = t('buyStripeFees');
      return (
        <>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
              <AssetIcon asset={asset} size={48} />
              <View>
                <Text style={{ fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 34, color: colors.text }} tabular>{amountLabel}</Text>
                <Text variant="caption" tone="secondary" tabular>{viaStripe ? stripeNote : quote ? `≈ ${cryptoLabel(quote.quoteCurrencyAmount)}` : '…'}</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }} />
            <Row label={t('payToken')} value={asset.symbol} />
            <Row label={t('network')} value={chainNameOf(asset.chainId) ?? asset.chainId} left={<TokenIcon symbol="" logo={chainIconUrl(asset.chainId)} size={16} />} />
            {viaStripe ? null : <Row label={t('buyRate')} value={rate ? `1 ${asset.symbol} ≈ ${money(rate)}` : '—'} />}
            {viaStripe ? null : <Row label={t('buyProviderFees')} value={fees != null ? money(fees) : '—'} />}
            <Row label={t('buyKalyxFees')} value={money(0)} tone={colors.up} />
            {viaStripe ? null : <Row label={t('buyCryptoReceived')} value={quote ? `≈ ${cryptoLabel(quote.quoteCurrencyAmount)}` : '—'} />}
            <Row label={t('buyReceiveOn')} value={shortAddress(address)} last />
          </Card>
          {/* Fournisseur : MoonPay (devis ci-dessus) ou Stripe (frais affichés sur sa page) */}
          <View style={{ gap: space[1] }}>
            <Text variant="micro" tone="secondary">{t('buyProvider')}</Text>
            <ChoiceRow
              on={!viaStripe}
              onPress={() => setProvider('moonpay')}
              left={<MoonPayLogo size={36} />}
              title="MoonPay"
              sub={quote ? fill(t('buyFeeShort'), { amount: money(quote.feeAmount + quote.networkFeeAmount + quote.extraFeeAmount) }) : undefined}
              aside={<KPressable onPress={() => setProviderInfo(true)} accessibilityRole="button" accessibilityLabel="MoonPay" hitSlop={8}><Icon name="about" size={16} color={colors.textTertiary} /></KPressable>}
            />
            <ChoiceRow
              on={viaStripe}
              onPress={() => (stripeOk ? setProvider('stripe') : toast.info(t('buyStripeUnsupported')))}
              left={<StripeLogo size={36} />}
              title="Stripe"
              sub={stripeOk ? t('buyStripeSub') : t('buyStripeUnsupported')}
            />
          </View>
          {viaStripe ? null : <View style={{ gap: space[1] }}>
            <Input
              label={t('buyEmailLabel')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="name@example.com"
              error={emailOk ? null : t('payInfoInvalid')}
              right={emailSaved ? (
                <KPressable onPress={() => { void setBuyEmail(null); setEmail(''); setEmailSaved(false); }} accessibilityRole="button" hitSlop={8}>
                  <Text variant="caption" tone="danger">{t('buyEmailForget')}</Text>
                </KPressable>
              ) : undefined}
            />
            <Text variant="micro" tone="tertiary">{t('buyEmailHint')}</Text>
          </View>}
          {quoteError ? <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{quoteError}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {quoting ? <ActivityIndicator size="small" color={colors.textTertiary} /> : <Icon name="refresh" size={12} color={colors.textTertiary} />}
            <Text variant="micro" tone="tertiary" tabular>{fill(t('buyQuoteRefresh'), { s: ttl })}</Text>
          </View>
          <Button label={fill(t('buyCta'), { amount: amountLabel })} loading={opening} disabled={viaStripe ? opening || !stripeOk : !quote || opening || !emailOk} onPress={() => void openWidget()} />
          <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{env === 'sandbox' ? t('buyTestNote') : t('buyKycNote')}</Text>
        </>
      );
    }

    if (step === 'processing') {
      const p = tx ? buyProgress(tx) : { steps: ['active', 'todo', 'todo', 'todo'] as BuyStepState[] };
      return (
        <Centered>
          <ProgressRing>
            <AssetIcon asset={asset} size={56} badge={false} />
          </ProgressRing>
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('buyPendingTitle')}</Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>{t('buyProcessingBody')}</Text>
          <View style={{ height: space[3] }} />
          <Stepper labels={[t('buyStepPaid'), t('buyStepBuying'), t('buyStepSending'), t('buyStepFinal')]} states={p.steps} />
          <View style={{ height: space[3] }} />
          {txId && !isStripeSessionId(txId) ? <Button label={t('buyTrack')} variant="ghost" size="md" dense icon="arrowUpRight" onPress={() => void Linking.openURL(buyTrackerUrl(env, txId))} /> : null}
          <Button label={t('backToHome')} variant="secondary" onPress={() => router.dismissTo('/home')} />
        </Centered>
      );
    }

    if (step === 'success') {
      return (
        <Centered>
          <View style={{ alignSelf: 'stretch', alignItems: 'center', height: 180, justifyContent: 'center' }}>
            <Confetti />
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: mode === 'dark' ? 'rgba(46,190,120,0.18)' : '#DDF3E6', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.up, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="checkmark" size={34} color="#FFFFFF" weight="bold" />
              </View>
            </View>
          </View>
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('buySuccessTitle')}</Text>
          <Text style={{ fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 36, color: colors.text, textAlign: 'center' }} tabular>{`+${cryptoLabel(tx?.quoteCurrencyAmount)}`}</Text>
          {/* Mode test : la crypto de test part sur un réseau de TEST — elle n'apparaît pas dans les soldes principaux. */}
          {env === 'sandbox' ? <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{t('buyTestDelivery')}</Text> : null}
          <View style={{ height: space[4] }} />
          <Button label={t('buySeeWallet')} onPress={() => router.dismissTo('/home')} />
          <Button label={t('buyDetailsTitle')} variant="secondary" onPress={() => setStep('details')} />
        </Centered>
      );
    }

    if (step === 'details') {
      const hash = tx?.cryptoTransactionId ?? null;
      // Mode test : la transaction est sur un réseau de test, l'explorateur du réseau principal ne la connaît pas.
      const explorer = hash && chainCfg?.explorerUrl && env !== 'sandbox' ? buildExplorerTxUrl(chainCfg.explorerUrl, hash) : null;
      const status = tx ? buyProgress(tx).outcome : 'pending';
      return (
        <>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
              <AssetIcon asset={asset} size={48} />
              <View>
                <Text style={{ fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 32, color: colors.text }} tabular>{`+${cryptoLabel(tx?.quoteCurrencyAmount)}`}</Text>
                <Text variant="caption" tone="secondary" tabular>{tx?.baseCurrencyAmount != null ? `≈ ${money(tx.baseCurrencyAmount)}` : '—'}</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }} />
            <Row label={t('buyStatus')} value={status === 'completed' ? t('buyStatusDone') : status === 'failed' ? t('buyStatusFailed') : t('buyStatusPending')} tone={status === 'completed' ? colors.up : status === 'failed' ? colors.danger : undefined} />
            <KPressable
              onPress={() => {
                const v = hash ?? txId ?? '';
                if (!v) return;
                void Clipboard.setStringAsync(v);
                toast.success(t('copied'));
              }}
            >
              <Row label={t('buyTxId')} value={shortAddress(hash ?? txId ?? '—')} left={<Icon name="copy" size={14} color={colors.textSecondary} />} />
            </KPressable>
            <Row label={t('network')} value={chainNameOf(asset.chainId) ?? asset.chainId} left={<TokenIcon symbol="" logo={chainIconUrl(asset.chainId)} size={16} />} />
            <Row label={t('buyProvider')} value={isStripeSessionId(txId) ? 'Stripe' : 'MoonPay'} />
            <Row label={t('buyDate')} value={tx?.createdAt ? new Date(tx.createdAt).toLocaleString() : '—'} last />
          </Card>
          {explorer ? <Button label={t('viewOnExplorer')} variant="secondary" icon="arrowUpRight" onPress={() => void Linking.openURL(explorer)} /> : null}
          {txId && !isStripeSessionId(txId) ? <Button label={t('buyTrack')} variant="ghost" icon="arrowUpRight" onPress={() => void Linking.openURL(buyTrackerUrl(env, txId))} /> : null}
        </>
      );
    }

    // step === 'failed'
    return (
      <Centered>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: mode === 'dark' ? 'rgba(255,77,94,0.18)' : '#FBE0E0', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 30 }}>!</Text>
          </View>
        </View>
        <Text variant="title2" style={{ textAlign: 'center' }}>{t('buyFailedTitle')}</Text>
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>{t('buyFailedBody')}</Text>
        {tx?.failureReason ? <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{tx.failureReason}</Text> : null}
        <View style={{ height: space[3] }} />
        <Button label={t('retry')} loading={opening} onPress={() => void openWidget()} />
        <Button
          label={t('buyOtherMethod')}
          variant="secondary"
          onPress={() => {
            setStep('amount');
            setSheet('method');
          }}
        />
      </Centered>
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Saisie du montant : fond uni, rien ne gêne la lecture du chiffre. */}
      {step !== 'amount' ? <ScreenDunes /> : null}
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 56, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 44 }}>{showBack ? <IconButton icon="back" label={t('back')} tone="glass" onPress={back} /> : null}</View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {step === 'amount' && asset ? (
            <KPressable onPress={() => setSheet('token')} accessibilityRole="button" accessibilityLabel={t('buyPickToken')} style={{ alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text variant="bodyStrong">{fill(t('buyTitleToken'), { token: asset.symbol })}</Text>
                <Icon name="caretDown" size={12} color={colors.textSecondary} />
              </View>
              <Text variant="caption" tone="secondary">{fill(t('buyOnNetwork'), { network: chainNameOf(asset.chainId) ?? asset.chainId })}</Text>
            </KPressable>
          ) : (
            <Text variant="bodyStrong">{title}</Text>
          )}
          {currencies && env === 'sandbox' && step !== 'success' ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.full, backgroundColor: tints.earn.bg }}>
              <Text variant="micro" style={{ color: tints.earn.ink, fontFamily: fontFamily.bold, fontSize: 9 }}>TEST</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 44, alignItems: 'flex-end' }}>
          {step === 'amount' && history.length > 0 ? <IconButton icon="history" label={t('buyHistory')} tone="glass" onPress={() => setHistoryOpen(true)} /> : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: SCREEN_MARGIN, paddingTop: TOP_AT[step] ? Math.max(SCREEN_MARGIN, winH * TOP_AT[step]! - (insets.top + 56)) : step === 'amount' ? 0 : SCREEN_MARGIN, gap: space[3], paddingBottom: insets.bottom + (step === 'amount' ? space[2] : space[5]) }}>
        <Animated.View key={step} entering={FadeInDown.duration(240)} style={{ flexGrow: 1, gap: space[3] }}>
          {body}
        </Animated.View>
      </ScrollView>

      {/* Moyen de paiement : frais réels de chacun */}
      <Sheet visible={sheet === 'method'} onClose={() => setSheet(null)}>
        <Text variant="title2">{t('buyPaymentMethod')}</Text>
        <View style={{ gap: space[1] }}>
            {methods.map((m) => {
              const q = methodQuotes[m];
              const fee = (x: RampQuote) => x.feeAmount + x.networkFeeAmount + x.extraFeeAmount;
              const known = methods.map((k) => methodQuotes[k]).filter((x): x is RampQuote => !!x);
              const cheapest = !!q && known.length > 1 && known.every((x) => fee(q) <= fee(x)) && known.some((x) => fee(x) > fee(q));
              return (
              <ChoiceRow
                key={m}
                on={m === method}
                onPress={() => {
                  setMethod(m);
                  setSheet(null);
                }}
                title={t(PM[m].key)}
                sub={[PM[m].sub ? t(PM[m].sub) : t(ETA[m]), needsSystemBrowser(m) ? t('buyOpensBrowser') : null].filter(Boolean).join(' · ')}
                aside={
                  <View style={{ alignItems: 'flex-end', marginRight: space[1] }}>
                    {q === undefined ? <ActivityIndicator size="small" color={colors.textTertiary} /> : q ? <Text variant="caption" tabular>{fill(t('buyFeeShort'), { amount: money(fee(q)) })}</Text> : <Text variant="micro" tone="tertiary">—</Text>}
                    {cheapest ? (
                      <View style={{ marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.full, backgroundColor: tints.receive.bg }}>
                        <Text variant="micro" style={{ color: tints.receive.ink, fontFamily: fontFamily.bold }}>{t('buyCheapest')}</Text>
                      </View>
                    ) : null}
                  </View>
                }
                left={
                  <PayLogo method={m} />
                }
              />
              );
            })}
        </View>
      </Sheet>

      {/* Mes achats : reprendre le suivi d'une commande */}
      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)}>
        <Text variant="title2">{t('buyHistory')}</Text>
        <View style={{ gap: space[1] }}>
          {history.map((h) => (
            <HistoryRow
              key={h.id}
              item={h}
              onPress={() => {
                setHistoryOpen(false);
                setAsset({ code: h.code, symbol: h.symbol, name: h.name, chainId: h.chainId, contract: h.contract });
                setAmountText(String(h.fiatAmount).replace('.', decimalSeparator()));
                setTxId(h.id);
                setTx(null);
                const out = buyProgress({ status: h.status }).outcome;
                if (out === 'pending') setStep('processing');
                else {
                  void txOf(h.id).then(setTx, () => {});
                  setStep(out === 'failed' ? 'failed' : 'details');
                }
              }}
            />
          ))}
        </View>
      </Sheet>

      {/* Fournisseur : qui fait quoi, et ce que coûte l'achat */}
      <Sheet visible={providerInfo} onClose={() => setProviderInfo(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <MoonPayLogo size={40} />
          <Text variant="title2">MoonPay</Text>
        </View>
        <Text variant="body" tone="secondary">{t('buyKycNote')}</Text>
        {quote ? (
          <Card padded={false}>
            <Row label={t('buyProviderFees')} value={money(quote.feeAmount + quote.extraFeeAmount)} />
            <Row label={t('networkFee')} value={money(quote.networkFeeAmount)} last />
          </Card>
        ) : null}
        <Button label={t('close')} variant="secondary" onPress={() => setProviderInfo(false)} />
      </Sheet>

      {/* 2. Le token */}
      <Sheet visible={sheet === 'token'} onClose={() => setSheet(null)}>
        <Text variant="title2">{t('buyPickToken')}</Text>
        <View style={{ gap: space[1] }}>
          {tokens.map((tk) => (
            <ChoiceRow
              key={tk.symbol}
              on={asset?.symbol === tk.symbol}
              title={isStablecoin(tk.symbol) ? tk.symbol : tk.name}
              sub={isStablecoin(tk.symbol) ? t('buyStablecoin') : tk.symbol}
              left={<AssetIcon asset={tk.networks[0]} badge={false} />}
              onPress={() => {
                if (tk.networks.length === 1) {
                  setAsset(tk.networks[0]);
                  setSheet(null);
                } else {
                  setPendingToken(tk);
                  setSheet('network');
                }
              }}
            />
          ))}
        </View>
      </Sheet>

      {/* 3. Le réseau — uniquement ceux où l'achat arrive vraiment */}
      <Sheet visible={sheet === 'network'} onClose={() => setSheet(null)}>
        <Text variant="title2">{fill(t('buyPickNetwork'), { token: pendingToken?.symbol ?? '' })}</Text>
        <View style={{ gap: space[1] }}>
          {(pendingToken?.networks ?? []).map((n) => {
            const tier = networkFeeTier(n.chainId);
            return (
              <ChoiceRow
                key={n.code}
                on={asset?.code === n.code}
                title={chainNameOf(n.chainId) ?? n.chainId}
                sub={tier === 'high' ? t('buyFeesHigh') : tier === 'low' ? t('buyFeesLow') : t('buyFeesVariable')}
                left={<TokenIcon symbol={chainNameOf(n.chainId) ?? n.chainId} logo={chainIconUrl(n.chainId)} size={40} />}
                onPress={() => {
                  setAsset(n);
                  setSheet(null);
                }}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function HistoryRow({ item, onPress }: { item: BuyRecord; onPress: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const out = buyProgress({ status: item.status }).outcome;
  const asset: BuyAsset = { code: item.code, symbol: item.symbol, name: item.name, chainId: item.chainId, contract: item.contract };
  return (
    <KPressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
      <AssetIcon asset={asset} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{item.cryptoAmount != null ? `+${formatNumber(item.cryptoAmount)} ${item.symbol}` : item.symbol}</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>{`${formatFiat(item.fiatAmount)} ${fiatSymbol(item.fiat)} · ${new Date(item.at).toLocaleDateString()}`}</Text>
      </View>
      <Text variant="caption" style={{ color: out === 'completed' ? colors.up : out === 'failed' ? colors.danger : colors.textSecondary }}>
        {out === 'completed' ? t('buyStatusDone') : out === 'failed' ? t('buyStatusFailed') : t('buyStatusPending')}
      </Text>
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </KPressable>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: space[3], paddingVertical: space[4] }}>{children}</View>;
}

function IllusDisc({ icon }: { icon: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: 'center', width: 88, height: 88, borderRadius: 24, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={40} color={colors.textSecondary} />
      <View style={{ position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg }}>
        <Icon name="close" size={13} color="#FFFFFF" weight="bold" />
      </View>
    </View>
  );
}

// Lecture seule : un portefeuille surveillé n'achète pas à son nom.
export default withWatchOnlyGate(BuyScreenInner);
