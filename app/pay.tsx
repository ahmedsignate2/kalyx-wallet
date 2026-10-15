/**
 * Paiement marchand (WalletConnect Pay).
 *
 * Trois temps visibles : on montre CE QU'ON PAIE et À QUI avant tout, on laisse
 * choisir avec quel actif, puis on signe. Le formulaire de capture de données
 * — exigé par la réglementation sur certaines options — est HÉBERGÉ et affiché
 * dans une WebView : ses champs évoluent sans nous prévenir, et une copie
 * native empêcherait de payer le jour où elle diverge.
 */
import { withWatchOnlyGate } from '../ui/WatchOnlyGate';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, Button, ListRow, IconButton, Skeleton, EmptyState, Chip, Pressable as KPressable, Card, TokenIcon, LogoImage, Sheet } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { Icon } from '../ui/icon';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { usePay, payAmountText, type PayOption } from '../lib/walletconnectPay';
import { useT, useSettings, fiatSymbol } from '../lib/settingsStore';
import { fill } from '../lib/i18n';
import { toast } from '../lib/toast';
import { technicalLogger } from '../lib/technicalLogger';
import { friendlyTxError, UserFacingError } from '../lib/txError';
import {
  formatTokenAmount,
  formatNumber,
  shortAddress,
  listChains,
  chainNameOf,
  buildExplorerTxUrl,
  needsCollect,
  payEligibleHoldings,
  payAcceptedChains,
  splitByAcceptance,
  payRequestedUsd,
  isShortForPayment,
  evmChainOfCaip,
  chainIconUrl,
  formatFiat,
  isWalletError,
  type ChainConfig,
} from '../src';
import { useWallet } from '../lib/walletStore';
import { usePortfolioStore } from '../lib/portfolio';
import { useShallow } from 'zustand/react/shallow';
import { ScreenDunes, IconDisc } from '../ui/nova';
import type { Holding } from '../lib/portfolio/portfolioStore';

/** Une ligne « moyen de paiement » : une option du service, ou un solde trop faible. */
interface MethodRow {
  key: string;
  symbol: string;
  logo?: string;
  badge?: string;
  network: string;
  balance: string;
  fiat?: string;
  option?: PayOption;
  /** Solde sur un réseau accepté, sous le montant demandé : grisé. */
  short?: boolean;
}

const NO_HOLDINGS: readonly Holding[] = [];

/** Ligne libellé / valeur du récapitulatif. */
function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="caption" tone="secondary">{label}</Text>
      <Text variant="bodyStrong" tabular numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/** Logos de réseaux qui se chevauchent, « +N » au-delà de `max`. */
function ChainLogos({ ids, max = 3 }: { ids: readonly string[]; max?: number }) {
  const { colors } = useTheme();
  const shown = ids.slice(0, max);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((id, i) => (
        <View key={id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 14, borderWidth: 2, borderColor: colors.surface1 }}>
          <TokenIcon symbol={chainNameOf(id) ?? id} logo={chainIconUrl(id)} size={24} />
        </View>
      ))}
      {ids.length > max ? <Text variant="micro" tone="secondary" style={{ marginLeft: 4 }}>{`+${ids.length - max}`}</Text> : null}
    </View>
  );
}

/** Domaines autorisés dans la WebView de capture. */
const COLLECT_HOST = 'pay.walletconnect.com';

function PayScreenInner() {
  const t = useT();
  // `mode` sert à accorder le formulaire hébergé au thème actif de l'app.
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ link?: string }>();

  const {
    phase,
    options,
    selected,
    collectUrl,
    result,
    failure,
    detail,
    payer,
    collectedIds,
    settledChain,
    open,
    select,
    collected,
    recheck,
    confirm,
    reset,
  } = usePay(useShallow((s) => ({ phase: s.phase, options: s.options, selected: s.selected, collectUrl: s.collectUrl, result: s.result, failure: s.failure, detail: s.detail, payer: s.payer, collectedIds: s.collectedIds, settledChain: s.settledChain, open: s.open, select: s.select, collected: s.collected, recheck: s.recheck, confirm: s.confirm, reset: s.reset })));

  /*
   * LA TRADUCTION SE FAIT ICI, à partir d'un code. Le magasin portait des
   * phrases en français en dur : elles sortaient telles quelles à l'écran
   * quelle que soit la langue, alors que les clés existaient déjà.
   */
  const failureTitle =
    failure === 'NO_OPTION'
      ? detail === 'expired'
        ? t('payExpiredTitle')
        : detail === 'succeeded'
          ? t('payAlreadyPaidTitle')
          : t('payNoOptionTitle')
      : failure === 'UNAVAILABLE'
        ? t('payUnavailable')
        : failure === 'INFO_NOT_ENOUGH'
          ? t('payInfoSentTitle')
          : t('payFailed');
  const payError = usePay((s) => s.error);
  const failureBody = (() => {
    switch (failure) {
      case 'UNAVAILABLE':
        // Pas d'APK sur iOS : on y met l'app à jour depuis l'App Store / TestFlight.
        return Platform.OS === 'ios' ? t('payUnavailableBodyIos') : t('payUnavailableBody');
      case 'NO_EVM_ACCOUNT':
        return t('payNoEvmAccount');
      case 'NO_OPTION':
        /*
         * Zéro option a plusieurs causes, et elles n'ont rien à voir. Le statut
         * de la demande, quand le service le donne, tranche : expirée ou déjà
         * réglée, ce n'est pas une question de solde — et laisser croire le
         * contraire envoie l'utilisateur chercher un problème inexistant.
         */
        if (detail === 'expired') return t('payExpired');
        if (detail === 'succeeded') return t('payAlreadyPaid');
        /*
         * On NE SAIT PAS si l'utilisateur ne détient aucun jeton accepté ou s'il
         * n'en a pas assez pour le montant demandé : le service ne le dit pas.
         * Affirmer « tu n'en as aucun » serait faux dans le second cas — et
         * c'est précisément ce que disait la version précédente à quelqu'un qui
         * avait de l'USDC sur Base. On montre donc le MONTANT DEMANDÉ et on
         * laisse l'utilisateur juger.
         */
        return options?.info
          ? `${t('payRequested')} ${formatTokenAmount(BigInt(options.info.amount.value || '0'), options.info.amount.display.decimals)} ${options.info.amount.display.assetSymbol}. ${t('payNoOptionBody')}`
          : t('payNoOptionBody');
      case 'INFO_REQUIRED':
        return t('payInfoRequiredBody');
      /*
       * Les informations SONT parties. Le dire explicitement évite de laisser
       * croire que la saisie a échoué — et c'est l'état qui remplace la boucle
       * où le même formulaire revenait sans fin.
       */
      case 'INFO_NOT_ENOUGH':
        return t('payInfoSentBody');
      case 'ACTION_REFUSED':
        return `${t('payActionRefused')}${detail ? ` (${detail})` : ''}`;
      case 'FAILED':
        // Traduit d'après l'erreur réelle ; le message brut reste dessous, en petit.
        return payError ? friendlyTxError(payError, t) : t('payFailedBody');
      default:
        return undefined;
    }
  })();
  /*
   * Un CONSTAT, pas une panne : ni « rien pour payer » ni « informations
   * envoyées » ne signalent une erreur de l'app ou de l'utilisateur. Un triangle
   * d'alerte ferait chercher un problème là où le service se contente de dire
   * qu'il n'a rien à proposer.
   */
  const stating = failure === 'NO_OPTION' || failure === 'INFO_NOT_ENOUGH';

  /*
   * DE QUOI EXPLIQUER, pas seulement constater.
   *
   * L'écran disait ce que Pay accepte EN GÉNÉRAL et se taisait sur ce que
   * l'utilisateur détient. Il a fallu cinq heures et un détour par un navigateur
   * pour découvrir qu'un paiement n'acceptait que des actifs sur Ethereum alors
   * que les fonds étaient sur Base — alors que l'app connaissait les deux.
   */
  const accounts = useWallet((w) => w.accounts);
  const holdings = usePortfolioStore((s) => s.holdings);
  const chains = useMemo(() => listChains({ includeTestnets: false }), []);
  const evmChainIdOf = useCallback((id: string) => chains.find((c) => c.id === id)?.evmChainId, [chains]);
  const nameOfEvm = useCallback(
    (evmChainId: number) => chains.find((c) => c.evmChainId === evmChainId)?.name,
    [chains],
  );
  const chainOfEvm = useCallback((evm: number): ChainConfig | undefined => chains.find((c) => c.evmChainId === evm), [chains]);
  /*
   * Les soldes connus sont ceux du compte AFFICHÉ : si le paiement est tenté
   * depuis un autre compte, on n'en montre aucun plutôt que ceux d'un autre.
   */
  const activeIndex = useWallet((w) => w.activeAccountIndex);
  const payerHoldings = payer && payer.index === activeIndex ? holdings : NO_HOLDINGS;
  const holdingOf = (chainId: string, symbol: string) =>
    payerHoldings.find((h) => h.chainId === chainId && h.symbol.toUpperCase() === symbol.toUpperCase());
  const eligible = useMemo(() => payEligibleHoldings(payerHoldings, evmChainIdOf), [payerHoldings, evmChainIdOf]);
  /*
   * LES RÉSEAUX DE CE PAIEMENT, pas ceux du service en général : c'est eux qui
   * pilotent le message et le tri des soldes (src/domain/pay/payAssets).
   */
  const accepted = useMemo(
    () => payAcceptedChains({ link: params.link ? String(params.link) : null, options: options?.options }),
    [params.link, options],
  );
  const acceptedNames = useMemo(() => accepted.map((n) => nameOfEvm(n) ?? `eip155:${n}`), [accepted, nameOfEvm]);
  const { onAccepted, elsewhere } = useMemo(() => splitByAcceptance(eligible, accepted, evmChainIdOf), [eligible, accepted, evmChainIdOf]);
  const requestedUsd = payRequestedUsd(options?.info?.amount);
  const fiat = useSettings((s) => s.fiat);
  const fiatSym = fiatSymbol(fiat);
  const [step, setStep] = useState<'choose' | 'review'>('choose');
  const [showAll, setShowAll] = useState(false);
  const [fundsSheet, setFundsSheet] = useState(false);
  const onlyOn = t('payOnlyOn').split('{networks}');
  const copyDiagnostic = () => {
    void Clipboard.setStringAsync(usePay.getState().diagnostic());
    toast.success(t('copied'));
  };
  /** Comptes autres que celui qui vient d'être interrogé. */
  const otherAccounts = useMemo(() => accounts.filter((a) => a.index !== payer?.index), [accounts, payer?.index]);
  const [asking, setAsking] = useState(false);

  const openLink = useEffectEvent((link: string) => {
    void open(link, { theme: mode === 'light' ? 'light' : 'dark' });
  });
  useEffect(() => {
    const link = params.link ? String(params.link) : '';
    setStep('choose');
    if (link) openLink(link);
    return () => reset();
  }, [params.link, reset]);

  const info = options?.info;
  const expiresIn = useMemo(() => {
    if (!info?.expiresAt) return null;
    const left = info.expiresAt * 1000 - Date.now();
    return left > 0 ? Math.round(left / 1000) : 0;
  }, [info?.expiresAt]);

  const requestedText = info ? payAmountText(info.amount) ?? '' : '';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  /** Montant d'une option, décimales appliquées. */
  const amountOf = (o: PayOption) => formatTokenAmount(BigInt(o.amount.value || '0'), o.amount.display.decimals);

  /* ── Capture de données : formulaire hébergé ───────────────────────────── */
  if (collectUrl) {
    /*
     * TOUT CE QUE LE FORMULAIRE DIT EST TRACÉ.
     *
     * Le formulaire compte plusieurs pages, et « Continuer » n'aboutissait pas.
     * Sans trace, on ne peut que théoriser — et j'ai déjà donné trois causes
     * fausses à ce paiement. On enregistre donc les messages du pont, les
     * navigations refusées et les erreurs de chargement. Rien de personnel n'y
     * figure : des types de messages et des hôtes, jamais le contenu des champs.
     */
    const onMessage = (e: WebViewMessageEvent) => {
      const raw = e.nativeEvent.data;
      try {
        const data = JSON.parse(raw) as { type?: string; error?: string };
        technicalLogger.log('DAPP', 'Pay : message du formulaire', { type: data.type ?? '(sans type)' });
        if (data.type === 'IC_COMPLETE') collected();
        else if (data.type === 'IC_ERROR') {
          technicalLogger.log('DAPP', 'Pay : formulaire en erreur', { error: data.error ?? '' });
          toast.error(t('payFailed'), data.error);
        }
      } catch {
        // Message non JSON : le formulaire en émet d'autres. On note sa taille,
        // jamais son contenu — il pourrait porter des données personnelles.
        technicalLogger.log('DAPP', 'Pay : message non JSON du formulaire', { length: raw.length });
      }
    };
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenDunes />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_MARGIN, height: 48 }}>
          <IconButton icon="back" label={t('back')} tone="glass" onPress={close} />
        </View>
        {/*
          CE QUI PART, ET CHEZ QUI. L'utilisateur s'apprête à saisir son nom
          légal, sa date de naissance et son lieu de résidence dans une page
          hébergée par un tiers. Le lui dire avant n'est pas une politesse :
          c'est la seule chose qui distingue un consentement d'une surprise.
        */}
        <View style={{ paddingHorizontal: SCREEN_MARGIN, paddingBottom: space[3] }}>
          <Text variant="caption" tone="secondary">{t('payCollectNotice')}</Text>
        </View>
        <WebView
          source={{ uri: collectUrl }}
          onMessage={onMessage}
          /*
           * Les liens externes (CGU, confidentialité) partent dans le
           * navigateur système : les suivre dans cette WebView sortirait
           * l'utilisateur du formulaire sans moyen d'y revenir.
           */
          /*
           * « * » : sinon `blob:`/`about:srcdoc` (hors liste blanche par défaut)
           * partaient en Linking.openURL sans passer par le filtre ci-dessous.
           */
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(req) => {
            /*
             * SOUS-CADRES : sur iOS ce filtre voit aussi les iframes (captcha,
             * 3-D Secure de la banque), hébergés ailleurs. Les renvoyer vers
             * Safari cassait le paiement : ils restent dans la page s'ils sont
             * chiffrés. Android n'appelle ce filtre que pour le cadre principal.
             */
            if (req.isTopFrame === false) return /^(?:https|about|blob):/i.test(req.url);
            /*
             * LES SCHÉMAS INTERNES PASSENT. On refusait tout ce qui n'était pas
             * `https://`, donc aussi `about:blank` et `blob:` — que les pages à
             * plusieurs étapes utilisent couramment pour enchaîner. Ils ne
             * chargent rien de distant : les bloquer ne protégeait de rien et
             * pouvait figer le formulaire sur sa première page.
             */
            if (/^(?:about|blob):/i.test(req.url)) return true;
            if (!req.url.startsWith('https://')) {
              technicalLogger.log('DAPP', 'Pay : navigation refusée (schéma)', {
                scheme: req.url.split(':')[0],
              });
              return false;
            }
            const host = req.url.slice('https://'.length).split(/[/?#]/)[0].toLowerCase();
            if (host === COLLECT_HOST || host.endsWith(`.${COLLECT_HOST}`)) return true;
            // Hôte tiers : on note lequel, puis on l'ouvre dehors.
            technicalLogger.log('DAPP', 'Pay : navigation sortie vers le navigateur', { host });
            void Linking.openURL(req.url);
            return false;
          }}
          /*
           * `window.open` DOIT NAVIGUER SUR PLACE.
           *
           * Android autorise par défaut les fenêtres multiples, et sans
           * gestionnaire un `window.open` ou un `target="_blank"` ne fait
           * RIEN — silencieusement. C'est exactement l'allure d'un bouton
           * « Continuer » mort. En refusant les fenêtres multiples, la
           * navigation se fait dans cette vue, où la règle ci-dessus décide.
           */
          setSupportMultipleWindows={false}
          onError={(e) =>
            technicalLogger.log('DAPP', 'Pay : échec de chargement du formulaire', {
              code: String(e.nativeEvent.code ?? ''),
              description: e.nativeEvent.description ?? '',
            })
          }
          onHttpError={(e) =>
            technicalLogger.log('DAPP', 'Pay : réponse HTTP en erreur', {
              status: String(e.nativeEvent.statusCode ?? ''),
            })
          }
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
        />
      </View>
    );
  }

  /* ── Paiement abouti : un écran À PART ENTIÈRE ──────────────────────────
   *
   * Un retour anticipé, comme pour le formulaire : l'argent est parti, il ne
   * reste que ce qui compte — combien, à qui, sur quel réseau, et la preuve.
   */
  if (phase === 'done' && result) {
    const settled = chains.find((c) => c.id === settledChain);
    const txId = result.info?.txId;
    const explorerUrl = settled?.explorerUrl && txId ? buildExplorerTxUrl(settled.explorerUrl, txId) : null;
    const paid = result.info?.optionAmount ?? selected?.amount;
    const ok = result.status === 'succeeded';
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenDunes />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SCREEN_MARGIN, gap: space[5], paddingBottom: insets.bottom + space[6] }}>
          <View style={{ alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? colors.up : colors.surface3 }}>
                <Icon name={ok ? 'checkmark' : 'clock'} size={30} color={ok ? '#FFFFFF' : colors.text} weight="bold" />
              </View>
            </View>
            <Text variant="title2" style={{ textAlign: 'center' }}>{ok ? t('paySentTitle') : t('payProcessing')}</Text>
            {info ? (
              <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
                {`${requestedText} · ${t('towards')} ${info.merchant.name}`}
              </Text>
            ) : null}
          </View>

          <Card padded={false}>
            {paid ? <SummaryRow label={t('payPaidWith')} value={`${formatTokenAmount(BigInt(paid.value || '0'), paid.display.decimals)} ${paid.display.assetSymbol}`} /> : null}
            {settled?.name || paid?.display.networkName ? <SummaryRow label={t('network')} value={settled?.name ?? paid?.display.networkName ?? ''} /> : null}
            {info ? <SummaryRow label={t('payMerchant')} value={info.merchant.name} /> : null}
            {txId ? <SummaryRow label={t('payTxId')} value={shortAddress(txId)} last /> : null}
          </Card>

          <View style={{ gap: space[2] }}>
            {/* LA PREUVE : sans lien d'explorateur, l'utilisateur n'a que notre parole. */}
            {explorerUrl ? <Button label={t('payViewTx')} variant="secondary" icon="arrowUpRight" onPress={() => void Linking.openURL(explorerUrl)} /> : null}
            <Button label={t('backToHome')} onPress={() => router.dismissTo('/home')} />
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── Lignes « moyen de paiement » ──────────────────────────────────────── */
  const optionRows: MethodRow[] = (options?.options ?? []).map((o) => {
    const evm = evmChainOfCaip(o.account) ?? evmChainOfCaip(o.amount.unit);
    const chain = evm !== undefined ? chainOfEvm(evm) : undefined;
    const held = chain ? holdingOf(chain.id, o.amount.display.assetSymbol) : undefined;
    return {
      key: o.id,
      symbol: o.amount.display.assetSymbol,
      logo: o.amount.display.iconUrl ?? held?.logo,
      badge: o.amount.display.networkIconUrl ?? (chain ? chainIconUrl(chain.id) : undefined),
      network: o.amount.display.networkName ?? chain?.name ?? '',
      balance: held ? formatNumber(held.amount) : `${amountOf(o)}`,
      fiat: held && held.fiat > 0 ? `≈ ${formatFiat(held.fiat)} ${fiatSym}` : undefined,
      option: o,
    };
  });
  /*
   * SOLDES TROP FAIBLES sur un réseau accepté : montrés grisés, jamais
   * sélectionnables. L'utilisateur voit qu'on a regardé, et pourquoi ça ne passe
   * pas — au lieu de se demander si l'app connaît ses fonds.
   */
  const shortRows: MethodRow[] = onAccepted
    .filter((h) => isShortForPayment(h, requestedUsd))
    .filter((h) => !optionRows.some((r) => r.symbol.toUpperCase() === h.symbol && r.network === (chainNameOf(h.chainId) ?? '')))
    .map((h) => {
      const full = holdingOf(h.chainId, h.symbol);
      return {
        key: `short:${h.chainId}:${h.symbol}`,
        symbol: h.symbol,
        logo: full?.logo,
        badge: chainIconUrl(h.chainId),
        network: chainNameOf(h.chainId) ?? h.chainId,
        balance: formatNumber(h.amount),
        fiat: full && full.fiat > 0 ? `≈ ${formatFiat(full.fiat)} ${fiatSym}` : undefined,
        short: true,
      };
    });
  const rows = [...optionRows, ...shortRows];
  const visibleRows = showAll ? rows : rows.slice(0, 3);

  const renderMethod = (r: MethodRow) => {
    const o = r.option;
    const active = !!o && selected?.id === o.id;
    const needsInfo = !!o && needsCollect(o, collectedIds);
    return (
      <KPressable
        key={r.key}
        disabled={r.short || phase === 'signing'}
        onPress={() => o && select(o, mode === 'light' ? 'light' : 'dark')}
        accessibilityRole="radio"
        accessibilityState={{ selected: active, disabled: !!r.short }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          padding: space[3],
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: active ? colors.text : colors.border,
          backgroundColor: active ? colors.surface2 : 'transparent',
          opacity: r.short ? 0.55 : 1,
        }}
      >
        <TokenIcon symbol={r.symbol} logo={r.logo} size={40} badge={r.badge} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{r.symbol}</Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {[r.network, needsInfo ? t('payInfoRequired') : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong" tabular>{r.balance}</Text>
          {r.short ? (
            <Text variant="caption" style={{ color: colors.danger }}>{t('payInsufficient')}</Text>
          ) : r.fiat ? (
            <Text variant="caption" tone="secondary" tabular>{r.fiat}</Text>
          ) : null}
        </View>
        {!r.short ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? colors.text : colors.textTertiary, alignItems: 'center', justifyContent: 'center' }}>
            {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text }} /> : null}
          </View>
        ) : null}
      </KPressable>
    );
  };

  /* ── Carte du marchand : ce qu'on paie et à qui, toujours en tête ─────── */
  const merchantCard = info ? (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {info.merchant.iconUrl ? (
          <LogoImage uri={info.merchant.iconUrl} size={48} style={{ borderRadius: 14, backgroundColor: colors.surface2 }} />
        ) : (
          <IconDisc name="buy" size={48} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{info.merchant.name}</Text>
          <Text variant="caption" tone="secondary" tabular>{fill(t('payAmountRequested'), { amount: requestedText })}</Text>
        </View>
        {expiresIn != null ? (
          <Text variant="micro" tone={expiresIn < 60 ? 'warning' : 'tertiary'} tabular>
            {`${t('payExpiresIn')} ${Math.floor(Math.max(0, expiresIn) / 60)}:${String(Math.max(0, expiresIn) % 60).padStart(2, '0')}`}
          </Text>
        ) : null}
      </View>
    </Card>
  ) : null;

  /* ── Pas de fonds utilisables : l'explication, CONTEXTUELLE ───────────── */
  const noFunds = failure === 'NO_OPTION' && detail !== 'expired' && detail !== 'succeeded';
  const shortOnAccepted = onAccepted.filter((h) => isShortForPayment(h, requestedUsd));
  const insufficient = noFunds && accepted.length > 0 && shortOnAccepted.length > 0;
  const acceptedText = acceptedNames.join(', ');
  const firstAccepted = accepted.length > 0 ? chainOfEvm(accepted[0]) : undefined;
  /** Synthèse des fonds hors réseau accepté : « 2,7387 USDC sur 8 réseaux ». */
  const elsewhereSummary = (() => {
    const pool = accepted.length > 0 ? elsewhere : eligible;
    if (pool.length === 0) return null;
    const bySymbol = new Map<string, number>();
    for (const h of pool) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + h.amount);
    const [sym, total] = [...bySymbol.entries()].sort((a, b) => b[1] - a[1])[0];
    const nets = new Set(pool.map((h) => h.chainId)).size;
    return { pool, text: fill(t('payFundsTotal'), { amount: `${formatNumber(total)} ${sym}`, n: nets }) };
  })();

  /**
   * Vers le réseau accepté : un pont depuis le plus gros solde réglable s'il y en
   * a un (l'écran Swap sait faire passer d'un réseau à l'autre), sinon l'écran
   * Recevoir sur ce réseau.
   */
  const fundAccepted = (from?: { chainId: string; symbol: string }) => {
    if (!firstAccepted) return;
    const source = from ?? elsewhere[0];
    const setActiveChain = useWallet.getState().setActiveChain;
    if (source) {
      setActiveChain(source.chainId);
      router.push({ pathname: '/swap', params: { to: source.symbol, toChain: firstAccepted.id } });
    } else {
      setActiveChain(firstAccepted.id);
      router.push('/receive');
    }
  };

  const reviewing = step === 'review' && !!selected && !collectUrl && phase !== 'error' && phase !== 'loading';
  const selectedRow = selected ? optionRows.find((r) => r.option?.id === selected.id) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenDunes />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t('back')} tone="glass" onPress={reviewing ? () => setStep('choose') : close} />
        <Text variant="title2">{reviewing ? t('payReviewTitle') : t('qrPayTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, gap: space[4], paddingBottom: insets.bottom + space[6] }}>
        {phase === 'loading' ? (
          <>
            <Card><View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}><Skeleton width={48} height={48} /><View style={{ flex: 1, gap: space[2] }}><Skeleton width="60%" /><Skeleton width="40%" height={12} /></View></View></Card>
            <Card><View style={{ gap: space[3] }}><Skeleton width="100%" height={44} /><Skeleton width="100%" height={44} /></View></Card>
          </>
        ) : null}

        {/* ── Récapitulatif avant de signer ── */}
        {reviewing && selected ? (
          <>
            <View style={{ alignItems: 'center', gap: space[2], paddingTop: space[2] }}>
              <TokenIcon symbol={selected.amount.display.assetSymbol} logo={selectedRow?.logo} size={72} badge={selectedRow?.badge} />
              <Text variant="caption" tone="secondary">{[selected.amount.display.assetSymbol, selectedRow?.network].filter(Boolean).join(' · ')}</Text>
              <Text variant="title1" tabular style={{ textAlign: 'center' }}>{requestedText}</Text>
              <Text variant="body" tone="secondary" tabular>{`≈ ${amountOf(selected)} ${selected.amount.display.assetSymbol}`}</Text>
            </View>
            <Card padded={false}>
              {selectedRow?.network ? <SummaryRow label={t('network')} value={selectedRow.network} /> : null}
              <SummaryRow label={t('payToken')} value={selected.amount.display.assetSymbol} />
              {info ? <SummaryRow label={t('payMerchant')} value={info.merchant.name} /> : null}
              {payer ? <SummaryRow label={t('payAccountUsed')} value={shortAddress(payer.evmAddress)} /> : null}
              {selected.etaS ? <SummaryRow label={t('payEta')} value={`~${selected.etaS} s`} last /> : null}
            </Card>
            <View style={{ gap: space[2] }}>
              <Button label={t('payConfirmPayment')} loading={phase === 'signing'} disabled={phase === 'signing'} onPress={() => setAsking(true)} />
              <Button label={t('back')} variant="ghost" disabled={phase === 'signing'} onPress={() => setStep('choose')} />
            </View>
          </>
        ) : null}

        {/* ── Choix du moyen de paiement ── */}
        {!reviewing && phase !== 'loading' && phase !== 'error' && (info || rows.length > 0) ? (
          <>
            {merchantCard}
            {rows.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Text variant="bodyStrong">{t('payChooseMethod')}</Text>
                <View style={{ gap: space[2] }}>{visibleRows.map(renderMethod)}</View>
                {rows.length > 3 ? (
                  <Button
                    label={showAll ? t('payShowLess') : fill(t('payShowMore'), { n: rows.length - 3 })}
                    variant="ghost"
                    size="md"
                    dense
                    onPress={() => setShowAll((v) => !v)}
                  />
                ) : null}
              </View>
            ) : null}
            <View style={{ gap: space[2] }}>
              <Button
                label={requestedText ? fill(t('payPayAmount'), { amount: requestedText }) : t('payConfirm')}
                disabled={!selected || needsCollect(selected, collectedIds) || phase === 'signing'}
                onPress={() => setStep('review')}
              />
              <Button label={t('cancel')} variant="ghost" onPress={close} />
            </View>
          </>
        ) : null}

        {/* ── Aucun fonds / solde insuffisant ── */}
        {phase === 'error' && noFunds ? (
          <>
            {merchantCard}
            <View style={{ alignItems: 'center', gap: space[3], paddingTop: space[2] }}>
              {insufficient ? (
                <IconDisc name="warning" tone="danger" size={72} />
              ) : (
                <LinearGradient colors={['#FF9A5A', '#B07CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '800' }}>!</Text>
                </LinearGradient>
              )}
              <Text variant="title2" style={{ textAlign: 'center' }}>{insufficient ? t('payInsufficientTitle') : t('payNoFundsTitle')}</Text>
              {insufficient ? (
                <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
                  {fill(t('payInsufficientBody'), { network: acceptedText, amount: requestedText })}
                </Text>
              ) : accepted.length > 0 ? (
                <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
                  {onlyOn[0]}
                  <Text variant="body" style={{ fontWeight: '700' }}>{acceptedText}</Text>
                  {onlyOn[1]}
                </Text>
              ) : (
                <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
                  {fill(t('payNoFundsUnknown'), { amount: requestedText })}
                </Text>
              )}
            </View>

            {insufficient ? (
              <View style={{ gap: space[2] }}>
                {shortOnAccepted.map((h) => {
                  const full = holdingOf(h.chainId, h.symbol);
                  return renderMethod({
                    key: `ins:${h.chainId}:${h.symbol}`,
                    symbol: h.symbol,
                    logo: full?.logo,
                    badge: chainIconUrl(h.chainId),
                    network: chainNameOf(h.chainId) ?? h.chainId,
                    balance: formatNumber(h.amount),
                    short: true,
                  });
                })}
              </View>
            ) : (
              <Card padded={false}>
                <View style={{ flexDirection: 'row' }}>
                  {accepted.length > 0 ? (
                    <View style={{ flex: 1, padding: space[4], gap: space[2], borderRightWidth: elsewhereSummary ? 1 : 0, borderRightColor: colors.border }}>
                      <Text variant="micro" tone="secondary">{t('payAcceptedNetwork')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        <ChainLogos ids={accepted.map((n) => chainOfEvm(n)?.id).filter((x): x is string => !!x)} />
                        <Text variant="bodyStrong" numberOfLines={2} style={{ flexShrink: 1 }}>{acceptedText}</Text>
                      </View>
                    </View>
                  ) : null}
                  {elsewhereSummary ? (
                    <KPressable onPress={() => setFundsSheet(true)} style={{ flex: 1.3, padding: space[4], gap: space[2] }} accessibilityRole="button">
                      <Text variant="micro" tone="secondary">{accepted.length > 0 ? t('payFundsElsewhere') : t('payFundsCompatible')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        <ChainLogos ids={[...new Set(elsewhereSummary.pool.map((h) => h.chainId))]} max={3} />
                        <View style={{ flex: 1 }} />
                        <Icon name="chevron" size={16} color={colors.textTertiary} />
                      </View>
                      <Text variant="caption" tabular>{elsewhereSummary.text}</Text>
                    </KPressable>
                  ) : accepted.length === 0 ? (
                    <View style={{ flex: 1, padding: space[4] }}>
                      <Text variant="caption" tone="secondary">{t('payHoldNone')}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            )}

            <View style={{ gap: space[2] }}>
              {firstAccepted ? (
                <Button
                  label={fill(insufficient ? t('payAddFundsOn') : t('payTransferTo'), { network: firstAccepted.name })}
                  icon={elsewhere.length > 0 ? 'arrowsDownUp' : 'receive'}
                  onPress={() => fundAccepted()}
                />
              ) : null}
              <Button label={t('back')} variant={firstAccepted ? 'ghost' : 'primary'} onPress={close} />
            </View>

            {/*
              PAYER DEPUIS UN AUTRE COMPTE, sans rescanner : les fonds ne sont pas
              toujours sur le compte qu'on regarde.
            */}
            {otherAccounts.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">
                  {`${t('payOtherAccount')} · ${t('payAccountUsed')} ${payer ? shortAddress(payer.evmAddress) : '—'}`}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {otherAccounts.map((a) => (
                    <Chip
                      key={a.index}
                      label={shortAddress(a.evmAddress)}
                      selected={false}
                      onPress={() => {
                        const link = params.link ? String(params.link) : '';
                        if (link) void open(link, { theme: mode === 'light' ? 'light' : 'dark', accountIndex: a.index });
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <Button label={t('payCopyDiagnostic')} variant="ghost" size="md" dense onPress={copyDiagnostic} />
          </>
        ) : null}

        {/* ── Autres échecs : expirée, déjà réglée, service indisponible… ── */}
        {phase === 'error' && !noFunds ? (
          <Card>
            {/*
              LA RELANCE PLUTÔT QUE LE RETOUR. Quand la vérification est en cours
              d'examen, « Retour » oblige à rescanner le QR pour savoir où elle
              en est. Dans ce seul cas l'action principale redemande les options.
            */}
            <EmptyState
              icon={stating ? 'info' : 'warning'}
              title={failureTitle}
              body={failureBody}
              actionLabel={failure === 'INFO_NOT_ENOUGH' ? t('retry') : t('back')}
              onAction={failure === 'INFO_NOT_ENOUGH' ? () => void recheck() : close}
            />
            {failure === 'FAILED' && detail ? (
              <Text variant="micro" tone="tertiary" selectable numberOfLines={3} style={{ textAlign: 'center' }}>{detail}</Text>
            ) : null}
            <Button label={t('payCopyDiagnostic')} variant="ghost" size="md" dense onPress={copyDiagnostic} />
          </Card>
        ) : null}
      </ScrollView>

      {/* Fonds réglables hors du réseau accepté, réseau par réseau. */}
      <Sheet visible={fundsSheet} onClose={() => setFundsSheet(false)}>
        <Text variant="title2">{accepted.length > 0 ? t('payFundsSheetTitle') : t('payFundsCompatible')}</Text>
        <View style={{ gap: space[1] }}>
          {(elsewhereSummary?.pool ?? []).map((h) => {
            const full = holdingOf(h.chainId, h.symbol);
            return (
              <ListRow
                key={`${h.chainId}:${h.symbol}`}
                left={<TokenIcon symbol={h.symbol} logo={full?.logo} size={40} badge={chainIconUrl(h.chainId)} />}
                title={chainNameOf(h.chainId) ?? h.chainId}
                subtitle={h.symbol}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong" tabular>{formatNumber(h.amount)}</Text>
                      {full && full.fiat > 0 ? <Text variant="caption" tone="secondary" tabular>{`≈ ${formatFiat(full.fiat)} ${fiatSym}`}</Text> : null}
                    </View>
                    {firstAccepted ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null}
                  </View>
                }
                onPress={
                  firstAccepted
                    ? () => {
                        setFundsSheet(false);
                        fundAccepted(h);
                      }
                    : undefined
                }
              />
            );
          })}
        </View>
      </Sheet>

      <ConfirmUnlock
        visible={asking}
        title={t('payConfirm')}
        subtitle={info?.merchant.name}
        perform={async (unlock) => {
          await confirm(unlock);
          const r = usePay.getState();
          // `confirm` ne lève pas : elle publie l'erreur dans le magasin. On la
          // relaie, parce que ConfirmUnlock distingue un PIN faux d'un échec
          // d'exécution à partir de ce qui est LEVÉ.
          if (r.phase === 'error') {
            // Un code PIN faux doit rester reconnaissable ; le reste est traduit.
            if (isWalletError(r.error)) throw r.error;
            throw new UserFacingError(r.failure === 'ACTION_REFUSED' ? t('payActionRefused') : friendlyTxError(r.error ?? new Error(r.detail ?? ''), t));
          }
        }}
        onDone={() => setAsking(false)}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}

// Lecture seule : rien à signer ni à recevoir à son nom ici (ui/WatchOnlyGate).
export default withWatchOnlyGate(PayScreenInner);
