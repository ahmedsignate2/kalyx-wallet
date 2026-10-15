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
import { View, ScrollView, Platform, Linking, ActivityIndicator } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { Text, Button, IconButton, Card, Sheet, TokenIcon, Skeleton, AmountKeypad, Pressable as KPressable } from '../ui/kit';
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
  type BuyAsset,
  type BuyToken,
  type BuyPaymentMethod,
  type BuyStepState,
  type RampCurrency,
} from '../src';

/** Place laissée aux dunes au-dessus des cartes (comme la maquette). */
const TOP_GAP = 96;

type Step = 'amount' | 'method' | 'review' | 'widget' | 'processing' | 'success' | 'details' | 'failed' | 'unavailable';

const UNSUPPORTED_URL = 'https://support.moonpay.com/customers/docs/moonpays-unsupported-countries';

const PM: Record<BuyPaymentMethod, { key: 'pmCard' | 'pmApplePay' | 'pmGooglePay' | 'pmSepa' | 'pmBankTransfer'; sub?: 'pmCardSub' | 'pmTransferSub'; icon?: IconName; badge?: string }> = {
  credit_debit_card: { key: 'pmCard', sub: 'pmCardSub', icon: 'card' },
  apple_pay: { key: 'pmApplePay', badge: ' Pay' },
  google_pay: { key: 'pmGooglePay', badge: 'G Pay' },
  sepa_bank_transfer: { key: 'pmSepa', sub: 'pmTransferSub', icon: 'currency' },
  gbp_bank_transfer: { key: 'pmBankTransfer', sub: 'pmTransferSub', icon: 'currency' },
};

/** Logo du token ; la pastille du réseau si ce n'est pas sa chaîne d'origine. */
function AssetIcon({ asset, size = 40, badge = true }: { asset: BuyAsset; size?: number; badge?: boolean }) {
  const logo = useFallbackLogo(asset.chainId, asset.contract ?? undefined, asset.contract ? null : nativeCoinLogo(asset.chainId));
  const home = !asset.contract && ['ethereum', 'bitcoin', 'solana', 'ton'].includes(asset.chainId);
  return <TokenIcon symbol={asset.symbol} logo={logo} seed={asset.contract ?? asset.code} size={size} badge={badge && !home ? chainIconUrl(asset.chainId) : null} />;
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

/** Ligne de choix (token, réseau, moyen de paiement), encadrée quand elle est choisie. */
function ChoiceRow({ left, title, sub, on, onPress }: { left: React.ReactNode; title: string; sub?: string; on: boolean; onPress: () => void }) {
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
  const S = 132;
  const r = 60;
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
  const [sheet, setSheet] = useState<'token' | 'network' | null>(null);
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
  const cryptoLabel = (n: number | null | undefined) => `${formatNumber(n ?? 0)} ${asset?.symbol ?? ''}`;

  // Devis réel, recalculé à chaque changement (avec un léger délai de frappe).
  const seq = useRef(0);
  useEffect(() => {
    setQuote(null);
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
  }, [asset, amount, validAmount, fiatCode, method, t]);

  const openWidget = async () => {
    if (!asset || !address || !validAmount) return;
    setOpening(true);
    try {
      const r = await rampWidgetUrl({ currencyCode: asset.code, walletAddress: address, baseCurrencyCode: fiatCode, baseCurrencyAmount: amount, paymentMethod: method, theme: mode === 'light' ? 'light' : 'dark' });
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
        const next = await rampTransaction(txId);
        if (!alive) return;
        setTx(next);
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
  }, [txId, step, asset?.symbol, t]);

  const onPurchaseReturned = (r: { transactionId: string; status: string }) => {
    setWidgetUrl(null);
    setTxId(r.transactionId);
    setTx(null);
    setStep(r.status === 'failed' ? 'failed' : 'processing');
    notifyAndLog('tx', t('buyPendingTitle'), asset ? `${amountLabel} → ${asset.symbol} (${chainNameOf(asset.chainId) ?? asset.chainId})` : undefined);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const back = () => {
    if (step === 'method') setStep('amount');
    else if (step === 'review') setStep('method');
    else if (step === 'details') setStep('success');
    else if (step === 'widget') {
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
          <Text variant="bodyStrong">MoonPay{env === 'sandbox' ? ` · ${t('buyTestMode')}` : ''}</Text>
          <IconButton icon="close" label={t('close')} tone="glass" onPress={back} />
        </View>
        <WebView
          source={{ uri: widgetUrl }}
          // Vérification d'identité : caméra, vidéo d'instructions en ligne, envoi de documents.
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowFileAccess
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

  /* Résumé en tête (moyen de paiement, et sous les feuilles de choix). */
  const hero = (
    <View style={{ alignItems: 'center', gap: 4, paddingVertical: space[4] }}>
      <Text style={{ fontFamily: fontFamily.bold, fontSize: 40, color: colors.text }} tabular>{amountLabel}</Text>
      <Text variant="caption" tone="secondary" tabular>{quote ? `≈ ${cryptoLabel(quote.quoteCurrencyAmount)}` : `≈ — ${asset?.symbol ?? ''}`}</Text>
      {asset && step !== 'amount' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <TokenIcon symbol={chainNameOf(asset.chainId) ?? ''} logo={chainIconUrl(asset.chainId)} size={14} />
          <Text variant="micro" tone="secondary">{`${asset.symbol} • ${chainNameOf(asset.chainId) ?? asset.chainId}`}</Text>
        </View>
      ) : null}
    </View>
  );

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
      return (
        <>
          <Card>
            <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[2] }}>
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 44, color: amountText ? colors.text : colors.textTertiary }} tabular>{amountLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
                {quoting ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
                <Text variant="caption" tone="secondary" tabular>{`≈ ${cryptoLabel(quote?.quoteCurrencyAmount ?? 0)}`}</Text>
              </View>
              <KPressable
                onPress={() => setSheet('token')}
                accessibilityRole="button"
                accessibilityLabel={t('buyPickToken')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: 6, paddingRight: space[3], paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surface2, marginTop: space[1] }}
              >
                <AssetIcon asset={asset} size={24} />
                <Text variant="bodyStrong">{asset.symbol}</Text>
                <Icon name="caretDown" size={14} color={colors.textSecondary} />
              </KPressable>
              {fiat ? (
                <Text variant="micro" tone={problem ? 'warning' : 'tertiary'} style={{ marginTop: space[1] }}>
                  {problem === 'min'
                    ? fill(t('buyMin'), { amount: money(fiat.minBuyAmount ?? 0) })
                    : problem === 'max'
                      ? fill(t('buyMax'), { amount: money(fiat.maxBuyAmount ?? 0) })
                      : fill(t('buyLimits'), { min: money(fiat.minBuyAmount ?? 0), max: money(fiat.maxBuyAmount ?? 0) })}
                </Text>
              ) : null}
            </View>
          </Card>
          <View style={{ flex: 1, minHeight: space[4] }} />
          <AmountKeypad value={amountText} onChange={(v) => setAmountText(v.slice(0, 9))} maxDecimals={2} />
          {quoteError ? <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{quoteError}</Text> : null}
          <Button label={t('continueWord')} disabled={!validAmount || !address} onPress={() => setStep('method')} />
          {!address ? <Text variant="micro" tone="warning" style={{ textAlign: 'center' }}>{t('buyNoAddress')}</Text> : null}
        </>
      );
    }

    if (step === 'method') {
      return (
        <>
          {hero}
          <Card>
            <View style={{ gap: space[1] }}>
              <Text variant="bodyStrong" style={{ marginBottom: space[1] }}>{t('buyPaymentMethod')}</Text>
              {methods.map((m) => (
                <ChoiceRow
                  key={m}
                  on={m === method}
                  onPress={() => setMethod(m)}
                  title={t(PM[m].key)}
                  sub={PM[m].sub ? t(PM[m].sub) : needsSystemBrowser(m) ? t('buyOpensBrowser') : undefined}
                  left={
                    <View style={{ width: 40, height: 28, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface1 }}>
                      {PM[m].badge ? <Text style={{ fontFamily: fontFamily.bold, fontSize: 11, color: colors.text }}>{PM[m].badge}</Text> : <Icon name={PM[m].icon ?? 'card'} size={18} color={colors.text} />}
                    </View>
                  }
                />
              ))}
            </View>
          </Card>
          <View style={{ flex: 1, minHeight: space[4] }} />
          <Button label={t('continueWord')} onPress={() => setStep('review')} />
        </>
      );
    }

    if (step === 'review') {
      const fees = quote ? quote.feeAmount + quote.networkFeeAmount + quote.extraFeeAmount : null;
      const rate = quote && quote.quoteCurrencyAmount > 0 ? quote.baseCurrencyAmount / quote.quoteCurrencyAmount : null;
      return (
        <>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
              <AssetIcon asset={asset} size={48} />
              <View>
                <Text style={{ fontFamily: fontFamily.bold, fontSize: 26, color: colors.text }} tabular>{amountLabel}</Text>
                <Text variant="caption" tone="secondary" tabular>{quote ? `≈ ${cryptoLabel(quote.quoteCurrencyAmount)}` : '…'}</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }} />
            <Row label={t('payToken')} value={asset.symbol} />
            <Row label={t('network')} value={chainNameOf(asset.chainId) ?? asset.chainId} left={<TokenIcon symbol="" logo={chainIconUrl(asset.chainId)} size={16} />} />
            <Row label={t('buyRate')} value={rate ? `1 ${asset.symbol} ≈ ${money(rate)}` : '—'} />
            <Row label={t('buyProviderFees')} value={fees != null ? money(fees) : '—'} />
            <Row label={t('buyCryptoReceived')} value={quote ? `≈ ${cryptoLabel(quote.quoteCurrencyAmount)}` : '—'} />
            <Row label={t('buyReceiveOn')} value={shortAddress(address)} last />
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7D00FE', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: 15 }}>M</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="micro" tone="secondary">{t('buyProvider')}</Text>
                <Text variant="bodyStrong">MoonPay</Text>
              </View>
              <Text variant="micro" tone="secondary">{t(PM[method].key)}</Text>
            </View>
          </Card>
          {quoteError ? <Text variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{quoteError}</Text> : null}
          <View style={{ flex: 1, minHeight: space[4] }} />
          <Button label={fill(t('buyCta'), { amount: amountLabel })} loading={opening} disabled={!quote || opening} onPress={() => void openWidget()} />
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
          {txId ? <Button label={t('buyTrack')} variant="ghost" size="md" dense icon="arrowUpRight" onPress={() => void Linking.openURL(buyTrackerUrl(env, txId))} /> : null}
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
          <Text style={{ fontFamily: fontFamily.bold, fontSize: 28, color: colors.text, textAlign: 'center' }} tabular>{`+${cryptoLabel(tx?.quoteCurrencyAmount ?? quote?.quoteCurrencyAmount)}`}</Text>
          <View style={{ height: space[4] }} />
          <Button label={t('buySeeWallet')} onPress={() => router.dismissTo('/home')} />
          <Button label={t('buyDetailsTitle')} variant="secondary" onPress={() => setStep('details')} />
        </Centered>
      );
    }

    if (step === 'details') {
      const hash = tx?.cryptoTransactionId ?? null;
      const explorer = hash && chainCfg?.explorerUrl ? buildExplorerTxUrl(chainCfg.explorerUrl, hash) : null;
      const status = tx ? buyProgress(tx).outcome : 'pending';
      return (
        <>
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
              <AssetIcon asset={asset} size={48} />
              <View>
                <Text style={{ fontFamily: fontFamily.bold, fontSize: 24, color: colors.text }} tabular>{`+${cryptoLabel(tx?.quoteCurrencyAmount)}`}</Text>
                <Text variant="caption" tone="secondary" tabular>{`≈ ${money(tx?.baseCurrencyAmount ?? amount)}`}</Text>
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
            <Row label={t('buyProvider')} value="MoonPay" />
            <Row label={t('buyDate')} value={tx?.createdAt ? new Date(tx.createdAt).toLocaleString() : '—'} last />
          </Card>
          {explorer ? <Button label={t('viewOnExplorer')} variant="secondary" icon="arrowUpRight" onPress={() => void Linking.openURL(explorer)} /> : null}
          {txId ? <Button label={t('buyTrack')} variant="ghost" icon="arrowUpRight" onPress={() => void Linking.openURL(buyTrackerUrl(env, txId))} /> : null}
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
        <Button label={t('buyOtherMethod')} variant="secondary" onPress={() => setStep('method')} />
      </Centered>
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenDunes />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 44 }}>{showBack ? <IconButton icon="back" label={t('back')} tone="glass" onPress={back} /> : null}</View>
        <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>{title}</Text>
        <View style={{ width: 44, alignItems: 'flex-end' }}>
          {currencies && env === 'sandbox' && step !== 'success' ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: radii.full, backgroundColor: tints.earn.bg }}>
              <Text variant="micro" style={{ color: tints.earn.ink, fontFamily: fontFamily.bold, fontSize: 9 }}>TEST</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: SCREEN_MARGIN, paddingTop: step === 'amount' || step === 'method' || step === 'review' || step === 'details' ? TOP_GAP : SCREEN_MARGIN, gap: space[3], paddingBottom: insets.bottom + space[5] }}>
        {body}
      </ScrollView>

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
