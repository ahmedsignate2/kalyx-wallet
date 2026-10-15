/**
 * ACHETER DE LA CRYPTO (MoonPay).
 *
 * Un écran à nous pour tout ce qui se décide AVANT le paiement — quelle crypto,
 * combien, comment payer, où ça arrive — avec le devis réel de MoonPay et ses
 * limites. Puis le widget MoonPay, en plein écran, déjà rempli : l'utilisateur
 * n'y fait plus que le paiement et, la première fois, la vérification
 * d'identité (chez MoonPay, jamais chez Kalyx).
 *
 * L'URL du widget est construite et SIGNÉE par notre serveur (la clé secrète
 * n'est pas dans l'app), liée à l'adresse de l'utilisateur et à l'IP de
 * l'appareil. Kalyx n'ajoute aucun frais : le devis affiché est celui de
 * MoonPay, frais compris.
 */
import { withWatchOnlyGate } from '../ui/WatchOnlyGate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Platform, TextInput, Linking, ActivityIndicator } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Text, Button, IconButton, Card, Sheet, Input, ListRow, TokenIcon, Skeleton, EmptyState, Pressable as KPressable } from '../ui/kit';
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
import { rampCurrencies, rampQuote, rampWidgetUrl, RampError, BUY_REDIRECT_URL, type RampEnv, type RampQuote } from '../lib/moonpay';
import {
  listChains,
  chainNameOf,
  chainIconUrl,
  shortAddress,
  formatFiat,
  formatNumber,
  buyableAssets,
  pickFiat,
  amountProblem,
  paymentMethodsFor,
  needsSystemBrowser,
  parseBuyRedirect,
  buyTrackerUrl,
  isMoonpayHost,
  type BuyAsset,
  type BuyPaymentMethod,
  type RampCurrency,
} from '../src';

const QUICK = [50, 100, 250, 500];

const PM: Record<BuyPaymentMethod, { key: 'pmCard' | 'pmApplePay' | 'pmGooglePay' | 'pmSepa' | 'pmBankTransfer'; icon: IconName }> = {
  credit_debit_card: { key: 'pmCard', icon: 'card' },
  apple_pay: { key: 'pmApplePay', icon: 'wallet' },
  google_pay: { key: 'pmGooglePay', icon: 'wallet' },
  sepa_bank_transfer: { key: 'pmSepa', icon: 'currency' },
  gbp_bank_transfer: { key: 'pmBankTransfer', icon: 'currency' },
};

function AssetIcon({ asset, size = 40 }: { asset: BuyAsset; size?: number }) {
  const logo = useFallbackLogo(asset.chainId, asset.contract ?? undefined, asset.contract ? null : nativeCoinLogo(asset.chainId));
  // Pastille du réseau, sauf pour la monnaie native de sa chaîne d'origine (ETH sur Ethereum, BTC…).
  const home = !asset.contract && ['ethereum', 'bitcoin', 'solana', 'ton'].includes(asset.chainId);
  return <TokenIcon symbol={asset.symbol} logo={logo} seed={asset.contract ?? asset.code} size={size} badge={home ? null : chainIconUrl(asset.chainId)} />;
}

function BuyScreenInner() {
  const t = useT();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ symbol?: string; chain?: string }>();
  const fiatPref = useSettings((s) => s.fiat);
  const account = useWallet((s) => s.accounts.find((a) => a.index === s.activeAccountIndex) ?? s.accounts[0]);

  const [currencies, setCurrencies] = useState<RampCurrency[] | null>(null);
  const [env, setEnv] = useState<RampEnv>('sandbox');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [asset, setAsset] = useState<BuyAsset | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [amountText, setAmountText] = useState('100');
  const [method, setMethod] = useState<BuyPaymentMethod>(Platform.OS === 'ios' ? 'apple_pay' : 'credit_debit_card');
  const [quote, setQuote] = useState<RampQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [done, setDone] = useState<{ transactionId: string; status: string } | null>(null);

  const chains = useMemo(() => listChains({ includeTestnets: false }), []);
  const load = () => {
    setLoadError(null);
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
  const fiat = useMemo(() => (currencies ? pickFiat(currencies, fiatPref) : null), [currencies, fiatPref]);
  const fiatCode = fiat?.code ?? 'usd';
  const fiatSym = fiatSymbol(fiatCode);
  const methods = useMemo(() => paymentMethodsFor(Platform.OS, fiatCode), [fiatCode]);
  useEffect(() => {
    if (!methods.includes(method)) setMethod(methods[0]);
  }, [methods, method]);

  // Pré-sélection : la crypto demandée (fiche token), sinon la première proposée.
  useEffect(() => {
    if (asset || assets.length === 0) return;
    const sym = String(params.symbol ?? '').toUpperCase();
    const ch = String(params.chain ?? '');
    setAsset(assets.find((a) => a.symbol === sym && (!ch || a.chainId === ch)) ?? assets.find((a) => a.symbol === sym) ?? assets[0]);
  }, [assets, asset, params.symbol, params.chain]);

  const chainCfg = asset ? chains.find((c) => c.id === asset.chainId) : undefined;
  const address = chainCfg ? addressForChain(account, chainCfg) : '';
  const amount = Number(amountText.replace(',', '.'));
  const problem = amountProblem(amount, fiat);
  const validAmount = Number.isFinite(amount) && amount > 0 && !problem;

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

  const continueToMoonpay = async () => {
    if (!asset || !address || !validAmount) return;
    setOpening(true);
    try {
      const r = await rampWidgetUrl({
        currencyCode: asset.code,
        walletAddress: address,
        baseCurrencyCode: fiatCode,
        baseCurrencyAmount: amount,
        paymentMethod: method,
        theme: mode === 'light' ? 'light' : 'dark',
      });
      technicalLogger.log('DAPP', 'Achat : widget MoonPay ouvert', { env: r.env, currency: asset.code, method });
      // Google Pay ne fonctionne pas dans une vue web : Chrome (même appareil, même IP).
      if (needsSystemBrowser(method)) await Linking.openURL(r.url);
      else setWidgetUrl(r.url);
    } catch (e) {
      setQuoteError(e instanceof RampError ? e.message : t('buyUnavailable'));
    } finally {
      setOpening(false);
    }
  };

  const onPurchaseReturned = (r: { transactionId: string; status: string }) => {
    setWidgetUrl(null);
    setDone(r);
    notifyAndLog('tx', t('buyPendingTitle'), asset ? `${amountText} ${fiatCode.toUpperCase()} → ${asset.symbol} (${chainNameOf(asset.chainId) ?? asset.chainId})` : undefined);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  /* ── Le widget, plein écran ─────────────────────────────────────────── */
  if (widgetUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SCREEN_MARGIN, height: 48 }}>
          <Text variant="bodyStrong">MoonPay{env === 'sandbox' ? ` · ${t('buyTestMode')}` : ''}</Text>
          <IconButton icon="close" label={t('close')} tone="glass" onPress={() => setWidgetUrl(null)} />
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
            const back = parseBuyRedirect(req.url, BUY_REDIRECT_URL);
            if (back) {
              onPurchaseReturned(back);
              return false;
            }
            if (req.isTopFrame === false) return /^(?:https|about|blob):/i.test(req.url);
            if (/^(?:about|blob):/i.test(req.url)) return true;
            let host = '';
            try {
              host = new URL(req.url).host;
            } catch {
              return false;
            }
            // MoonPay, et en HTTPS ce qu'il enchaîne (3-D Secure de la banque, PayPal…) : dans la page.
            if (req.url.startsWith('https://')) {
              if (!isMoonpayHost(host)) technicalLogger.log('DAPP', 'Achat : page tierce dans le widget', { host });
              return true;
            }
            void Linking.openURL(req.url).catch(() => {});
            return false;
          }}
        />
      </View>
    );
  }

  /* ── Achat lancé ────────────────────────────────────────────────────── */
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenDunes />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SCREEN_MARGIN, gap: space[5], paddingBottom: insets.bottom + space[6] }}>
          <EmptyState icon={done.status === 'failed' ? 'warning' : 'clock'} title={done.status === 'failed' ? t('buyFailedTitle') : t('buyPendingTitle')} body={fill(t('buyPendingBody'), { address: shortAddress(address) })} />
          <View style={{ gap: space[2] }}>
            <Button label={t('buyTrack')} variant="secondary" icon="arrowUpRight" onPress={() => void Linking.openURL(buyTrackerUrl(env, done.transactionId))} />
            <Button label={t('backToHome')} onPress={() => router.dismissTo('/home')} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const filtered = assets.filter((a) => {
    const q = query.trim().toLowerCase();
    return !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (chainNameOf(a.chainId) ?? '').toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenDunes />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t('back')} tone="glass" onPress={close} />
        <Text variant="title2" style={{ flex: 1 }}>{t('buyCrypto')}</Text>
        {currencies && env === 'sandbox' ? (
          <View style={{ paddingHorizontal: space[2], paddingVertical: 4, borderRadius: radii.full, backgroundColor: colors.warning }}>
            <Text variant="micro" style={{ color: '#1A1408', fontFamily: fontFamily.bold }}>{t('buyTestMode')}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SCREEN_MARGIN, gap: space[4], paddingBottom: insets.bottom + space[6] }}>
        {loadError ? (
          <Card>
            <EmptyState icon="warning" title={t('buyCrypto')} body={loadError} actionLabel={t('retry')} onAction={load} />
          </Card>
        ) : !currencies ? (
          <Card><View style={{ gap: space[3] }}><Skeleton width="50%" /><Skeleton width="100%" height={56} /><Skeleton width="70%" height={12} /></View></Card>
        ) : assets.length === 0 ? (
          <Card><EmptyState icon="info" title={t('buyCrypto')} body={t('buyNoAssets')} /></Card>
        ) : (
          <>
            {/* Montant */}
            <Card>
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('buyYouPay')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <TextInput
                    value={amountText}
                    onChangeText={(v) => setAmountText(v.replace(/[^0-9.,]/g, '').slice(0, 9))}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t('buyYouPay')}
                    style={{ flex: 1, fontFamily: fontFamily.bold, fontSize: 40, color: colors.text, padding: 0 }}
                  />
                  <Text variant="title2" tone="secondary">{fiatSym}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: space[2] }}>
                  {QUICK.map((q) => (
                    <KPressable
                      key={q}
                      onPress={() => setAmountText(String(q))}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: space[2], borderRadius: radii.full, backgroundColor: String(q) === amountText ? colors.text : colors.surface2 }}
                    >
                      <Text variant="caption" style={{ color: String(q) === amountText ? colors.bg : colors.text, fontFamily: fontFamily.semibold }}>{`${q} ${fiatSym}`}</Text>
                    </KPressable>
                  ))}
                </View>
                {fiat ? (
                  <Text variant="micro" tone={problem ? 'warning' : 'tertiary'}>
                    {problem === 'min'
                      ? fill(t('buyMin'), { amount: `${formatFiat(fiat.minBuyAmount ?? 0)} ${fiatSym}` })
                      : problem === 'max'
                        ? fill(t('buyMax'), { amount: `${formatFiat(fiat.maxBuyAmount ?? 0)} ${fiatSym}` })
                        : fill(t('buyLimits'), { min: `${formatFiat(fiat.minBuyAmount ?? 0)} ${fiatSym}`, max: `${formatFiat(fiat.maxBuyAmount ?? 0)} ${fiatSym}` })}
                  </Text>
                ) : null}
              </View>
            </Card>

            {/* Crypto achetée */}
            {asset ? (
              <KPressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={t('buyPickAsset')}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <AssetIcon asset={asset} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="caption" tone="secondary">{t('buyYouGet')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        {quoting && !quote ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
                        <Text variant="title2" tabular numberOfLines={1}>{quote ? `${formatNumber(quote.quoteCurrencyAmount)} ${asset.symbol}` : asset.symbol}</Text>
                      </View>
                      <Text variant="micro" tone="secondary" numberOfLines={1}>{chainNameOf(asset.chainId) ?? asset.chainId}</Text>
                    </View>
                    <Icon name="caretDown" size={16} color={colors.textTertiary} />
                  </View>
                </Card>
              </KPressable>
            ) : null}

            {/* Devis : frais de MoonPay, sans rien d'autre */}
            {quote ? (
              <Card padded={false}>
                <Line label={t('buyFees')} value={`${formatFiat(quote.feeAmount)} ${fiatSym}`} />
                <Line label={t('networkFee')} value={`${formatFiat(quote.networkFeeAmount)} ${fiatSym}`} />
                <Line label={t('buyTotal')} value={`${formatFiat(quote.totalAmount)} ${fiatSym}`} strong last />
              </Card>
            ) : null}
            {quoteError ? <Text variant="caption" style={{ color: colors.danger }}>{quoteError}</Text> : null}

            {/* Moyen de paiement */}
            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">{t('buyPayWith')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {methods.map((m) => {
                  const on = m === method;
                  return (
                    <KPressable
                      key={m}
                      onPress={() => setMethod(m)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radii.full, borderWidth: 1.5, borderColor: on ? colors.text : colors.border, backgroundColor: on ? colors.surface2 : 'transparent' }}
                    >
                      <Icon name={PM[m].icon} size={16} color={colors.text} />
                      <Text variant="caption" style={{ fontFamily: fontFamily.semibold }}>{t(PM[m].key)}</Text>
                    </KPressable>
                  );
                })}
              </View>
              {needsSystemBrowser(method) ? <Text variant="micro" tone="tertiary">{t('buyOpensBrowser')}</Text> : null}
            </View>

            {/* Destination */}
            <Card padded={false}>
              <Line label={t('buyReceiveOn')} value={address ? `${shortAddress(address)} · ${chainNameOf(asset?.chainId ?? '') ?? ''}` : t('buyNoAddress')} last />
            </Card>

            <Button
              label={t('buyContinue')}
              loading={opening}
              disabled={!asset || !address || !validAmount || opening}
              onPress={() => void continueToMoonpay()}
            />
            <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{env === 'sandbox' ? t('buyTestNote') : t('buyKycNote')}</Text>
          </>
        )}
      </ScrollView>

      <Sheet visible={picking} onClose={() => setPicking(false)}>
        <Text variant="title2">{t('buyPickAsset')}</Text>
        <Input value={query} onChangeText={setQuery} icon="search" placeholder={t('buySearch')} autoCorrect={false} autoCapitalize="none" />
        <View style={{ gap: space[1] }}>
          {filtered.map((a) => (
            <ListRow
              key={a.code}
              left={<AssetIcon asset={a} />}
              title={a.symbol}
              subtitle={`${a.name} · ${chainNameOf(a.chainId) ?? a.chainId}`}
              right={asset?.code === a.code ? <Icon name="checkmark" size={16} color={colors.text} weight="bold" /> : null}
              onPress={() => {
                setAsset(a);
                setPicking(false);
                setQuery('');
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function Line({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="caption" tone="secondary">{label}</Text>
      <Text variant={strong ? 'bodyStrong' : 'body'} tabular numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// Lecture seule : un portefeuille surveillé n'achète pas à son nom.
export default withWatchOnlyGate(BuyScreenInner);
