import { haptic } from "../lib/haptics";
import { sound } from "../lib/sound";
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, ScrollView, Pressable as RNPressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, Button, IconButton, Surface, Divider, TokenIcon, AmountKeypad, Chip, Sheet, HoldButton, CountdownRing, Skeleton, EmptyState } from '../ui/kit';
import { BridgeProgress } from '../ui/BridgeProgress';
import { SuccessModal } from '../ui/SuccessModal';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { friendlyTxError } from '../lib/txError';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius, springs } from '../ui/tokens';
import { useWallet, type SwapStatus, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import {
  getAdapter,
  getErc20Tokens,
  getBestQuote,
  parseAmount,
  formatTokenAmount,
  formatInputAmount,
  formatAmount,
  formatFiat,
  isWalletError,
  NATIVE_TOKEN,
  KALYX_FEE,
  listChains,
  estimateGasReserve,
  type GasReserve,
  type SwapQuote,
  EvmChainAdapter,
  SolanaChainAdapter,
} from '../src';
import { useTokenStore, type Tok } from '../lib/tokenStore';
import { TokenPicker } from '../ui/TokenPicker';

/** Durée de validité d'un devis avant auto-actualisation (s). */
const QUOTE_TTL_S = 30;

// Clés i18n des étapes du swap (traduites à l'affichage via t()).
const STATUS_KEY = {
  approving: 'stApproving',
  approvalWait: 'stApprovalWait',
  swapping: 'stSwapping',
  confirming: 'stConfirming',
} as const;

function isNativeTokenAddress(address?: string): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return (
    a === '0x0000000000000000000000000000000000000000' ||
    a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    a === '11111111111111111111111111111111' ||
    a === NATIVE_TOKEN.toLowerCase()
  );
}

export default function Swap() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const activeChain = useWallet((s) => s.activeChain);
  const account = useWallet((s) => s.account);
  const executeSwap = useWallet((s) => s.executeSwap);
  const chain = getAdapter(activeChain).config;

  const fetchTokens = useTokenStore(s => s.fetchTokens);
  const tokensByChain = useTokenStore(s => s.tokensByChain);
  const loadingTokens = useTokenStore(s => s.loading);

  useEffect(() => {
    fetchTokens(activeChain);
  }, [activeChain, fetchTokens]);
  const available = !chain.testnet && (chain.family === 'evm' || chain.family === 'solana');

  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [toChain, setToChain] = useState(activeChain); // chaîne de destination (bridge)
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pickerState, setPickerState] = useState<{ visible: boolean; side: 'from' | 'to' }>({ visible: false, side: 'from' });
  const [slippage, setSlippage] = useState('0.005');
  const [countdown, setCountdown] = useState(0);
  const [stale, setStale] = useState(false);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [selectedTokenBalance, setSelectedTokenBalance] = useState<bigint | null>(null);
  /**
   * Réserve de gas DYNAMIQUE (estimée sur le RPC du réseau actif) : ce qu'on
   * garde de natif pour que la tx passe. `null` = pas encore chargée.
   */
  const [gasReserve, setGasReserve] = useState<GasReserve | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGasReserve(null);
    estimateGasReserve(getAdapter(activeChain)).then((r) => {
      if (!cancelled) setGasReserve(r);
    });
    return () => {
      cancelled = true;
    };
  }, [activeChain]);
  const reserveRaw = gasReserve?.raw ?? 0n;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Succès : hash + résumé (capturés avant reset) pour l'écran animé.
  const [success, setSuccess] = useState<{ hash: string; summary: string; isBridge?: boolean; fromChain?: string; toChain?: string } | null>(null);
  const [held, setHeld] = useState<Tok[]>([]);
  const params = useLocalSearchParams<{ contract?: string; to?: string }>();

  // Récupère le solde natif de la chaîne active
  useEffect(() => {
    let cancelled = false;
    if (!account?.address) {
      setNativeBalance(null);
      return;
    }
    getAdapter(activeChain)
      .getBalance(account.address)
      .then((b) => {
        if (!cancelled) setNativeBalance(b.raw);
      })
      .catch(() => {
        if (!cancelled) setNativeBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChain, account?.address]);

  // Tokens réellement détenus sur la chaîne active → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (!account?.address) return;

    if (chain.family === 'evm') {
      getErc20Tokens(chain, account.address)
        .then((detected) => {
          if (!cancelled)
            setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
        })
        .catch(() => {
          if (!cancelled) setHeld([]);
        });
    } else if (chain.family === 'solana') {
      const adapter = getAdapter(activeChain) as any;
      if (adapter.getSplTokens) {
        adapter.getSplTokens(account.address)
          .then((detected: any[]) => {
            if (!cancelled)
              setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.mint, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, account?.address]);

  // Liste source = tokens curés + tokens détenus non déjà listés (dédupliqués par adresse).
  const curated = tokensByChain[activeChain] ?? [];
  const curatedAddrs = new Set(curated.map((tk) => tk.address.toLowerCase()));
  const fromTokens = [...curated, ...held.filter((tk) => !curatedAddrs.has(tk.address.toLowerCase()))];

  // Pré-sélection si on arrive depuis le portefeuille avec un token précis.
  useEffect(() => {
    if (!params.contract) return;
    const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === String(params.contract).toLowerCase());
    if (idx >= 0) setFrom(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.contract, fromTokens.length]);

  useEffect(() => {
    if (toChain !== activeChain) {
      fetchTokens(toChain);
    }
  }, [toChain, activeChain, fetchTokens]);


  const reset = () => {
    setQuote(null);
    setConfirming(false);
    setError(null);
    setStale(false);
  };

  const fromTok = fromTokens[from] ?? fromTokens[0];
  const toTokens = tokensByChain[toChain] ?? [];
  const toTok = toTokens[to] ?? toTokens[0];

  // Arrivée depuis une fiche token ou le marché : le token demandé en destination.
  useEffect(() => {
    const sym = String(params.to ?? '').toLowerCase();
    if (!sym) return;
    const idx = toTokens.findIndex((tk) => tk.symbol.toLowerCase() === sym);
    if (idx >= 0) setTo(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.to, toTokens.length]);
  const isBridge = toChain !== activeChain;
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${flip.value * 180}deg` }] }));

  // Récupère le solde du token sélectionné s'il n'est pas natif
  useEffect(() => {
    let cancelled = false;
    if (!account?.address || !fromTok) {
      setSelectedTokenBalance(null);
      return;
    }
    if (isNativeTokenAddress(fromTok.address)) {
      setSelectedTokenBalance(null);
      return;
    }
    const heldTok = held.find((t) => t.address.toLowerCase() === fromTok.address.toLowerCase());
    if (heldTok) {
      setSelectedTokenBalance((heldTok as any).balance ?? 0n);
      return;
    }
    const adapter = getAdapter(activeChain);
    if (adapter instanceof EvmChainAdapter) {
      adapter
        .getTokenBalance(fromTok.address, account.address)
        .then((b) => {
          if (!cancelled) setSelectedTokenBalance(b);
        })
        .catch(() => {
          if (!cancelled) setSelectedTokenBalance(0n);
        });
    } else if (adapter instanceof SolanaChainAdapter) {
      adapter
        .getSplTokens(account.address)
        .then((tokens) => {
          if (!cancelled) {
            const found = tokens.find((t) => t.mint.toLowerCase() === fromTok.address.toLowerCase());
            setSelectedTokenBalance(found ? found.raw : 0n);
          }
        })
        .catch(() => {
          if (!cancelled) setSelectedTokenBalance(0n);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeChain, account?.address, fromTok?.address, held]);

  const onFlip = () => {
    if (isBridge) return;
    haptic.heavy();
    setFrom(to);
    setTo(from);
    reset();
    stopCountdown();
    flip.value = 0;
    flip.value = withSpring(1, springs.snappy);
  };

  const getTokenBalance = (): bigint => {
    if (!fromTok) return 0n;
    if (isNativeTokenAddress(fromTok.address)) {
      return nativeBalance ?? 0n;
    }
    if (selectedTokenBalance != null) {
      return selectedTokenBalance;
    }
    const heldTok = held.find((t) => t.address.toLowerCase() === fromTok.address.toLowerCase());
    return heldTok ? (heldTok as any).balance ?? 0n : 0n;
  };

  /**
   * Solde DISPONIBLE pour l'échange : solde brut moins la réserve de gas si
   * le token source est la monnaie native. Les raccourcis (MAX, 50 %) et la
   * validation travaillent sur cette valeur, jamais sur le solde brut.
   */
  const getAvailable = (): bigint => {
    if (!fromTok) return 0n;
    const raw = getTokenBalance();
    if (!isNativeTokenAddress(fromTok.address)) return raw;
    return raw > reserveRaw ? raw - reserveRaw : 0n;
  };

  const setPercent = (pct: bigint) => {
    if (!fromTok) return;
    const avail = getAvailable();
    setAmount(avail > 0n ? formatInputAmount((avail * pct) / 100n, fromTok.decimals) : '0');
  };
  const onMax = () => setPercent(100n);
  const onHalf = () => setPercent(50n);

  // Auto-refresh du devis : en PAUSE pendant la confirmation/exécution (sinon
  // la fenêtre PIN se fermait au milieu de la saisie) et STOPPÉ après une erreur
  // (sinon on spammait l'API toutes les 15 s sans route).
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = confirming || step !== null;
  }, [confirming, step]);
  const stopCountdown = () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    setCountdown(0);
  };
  const startCountdown = () => {
    stopCountdown();
    setCountdown(QUOTE_TTL_S);
    countdownInterval.current = setInterval(() => {
      if (pausedRef.current) return; // on gèle le compteur tant qu'on confirme
      setCountdown((c) => {
        if (c <= 1) {
          void onQuote({ auto: true });
          return QUOTE_TTL_S;
        }
        return c - 1;
      });
    }, 1000);
  };

  /** Vérifications locales AVANT tout appel réseau (messages immédiats et précis). */
  const preflight = async (raw: bigint): Promise<string | null> => {
    if (!isBridge && fromTok.address.toLowerCase() === toTok.address.toLowerCase()) return t('swapTwoTokens');
    const bal = getTokenBalance();
    // Réserve : celle du state, ou ré-estimée à la volée si pas encore chargée.
    const reserve = gasReserve?.raw ?? (await estimateGasReserve(getAdapter(activeChain))).raw;
    const reserveStr = `${formatTokenAmount(reserve, chain.nativeDecimals)} ${chain.nativeSymbol}`;
    if (isNativeTokenAddress(fromTok.address)) {
      // Deux cas distincts : pas même de quoi payer le gas / montant trop grand une fois le gas réservé.
      if (bal < reserve) return t('errGasBelowMinimum').replace('{amount}', reserveStr);
      if (raw > bal - reserve) return t('errAboveAvailable').replace('{amount}', reserveStr);
    } else {
      if (raw > bal) return t('errInsufficientFunds');
      // Token SPL/ERC-20 : le natif du wallet doit couvrir le gas estimé.
      try {
        const native = nativeBalance ?? (await getAdapter(activeChain).getBalance(account!.address)).raw;
        if (native < reserve) return t('errNeedNativeForGas').replace('{amount}', reserveStr);
      } catch {
        /* réseau muet : on laisse le devis trancher */
      }
    }
    return null;
  };

  const onQuote = async (opts: { auto?: boolean } = {}) => {
    if (!fromTok || !toTok || !account) return;
    if (opts.auto && pausedRef.current) return;
    let raw: bigint;
    try {
      raw = parseAmount(amount, fromTok.decimals).raw;
    } catch (e) {
      stopCountdown();
      reset();
      setError(isWalletError(e) ? e.message : t('amountInvalid'));
      return;
    }
    if (!opts.auto) {
      reset();
      const pre = await preflight(raw);
      if (pre) {
        stopCountdown();
        setError(pre);
        return;
      }
      setLoading(true);
    }
    try {
      const w = useWallet.getState();
      const storedAccount = w.accounts.find((a) => a.index === w.activeAccountIndex) ?? w.accounts[0];
      const toFamily = getAdapter(toChain).config.family;
      let targetAddress = account.address;
      if (toFamily === 'solana') targetAddress = storedAccount?.solAddress ?? '';
      else if (toFamily === 'bitcoin') targetAddress = storedAccount?.btcAddress ?? '';
      else if (toFamily === 'evm') targetAddress = storedAccount?.evmAddress ?? account.address;

      const q = await getBestQuote({
        fromChainId: activeChain,
        toChainId: toChain,
        fromToken: fromTok.address,
        toToken: toTok.address,
        fromAmount: raw.toString(),
        fromAddress: account.address,
        toAddress: targetAddress,
        slippage: Number(slippage),
        fromTokenInfo: { symbol: fromTok.symbol, decimals: fromTok.decimals, logo: fromTok.logo },
        toTokenInfo: { symbol: toTok.symbol, decimals: toTok.decimals, logo: toTok.logo },
      });
      if (!q) {
        setError(t('noRoute'));
        stopCountdown();
        return;
      }
      setError(null);
      setStale(false);
      setQuote(q);
      if (!countdownInterval.current) startCountdown();
    } catch (e) {
      console.warn('[swap] devis impossible :', e instanceof Error ? e.message : e);
      if (opts.auto) {
        // Le devis affiché reste utilisable mais peut être dépassé : on le signale sans le retirer.
        setStale(true);
      } else {
        setError(friendlyTxError(e, t as any));
        stopCountdown();
      }
    } finally {
      if (!opts.auto) setLoading(false);
    }
  };

  useEffect(() => {
    return () => { if (countdownInterval.current) clearInterval(countdownInterval.current); };
  }, []);


  const onConfirm = async (unlock: Unlock) => {
    if (!quote) return;
    setStep(t('preparing'));
    sound.send();
    try {
      const hash = await executeSwap(quote, unlock, (s) => setStep(t(STATUS_KEY[s])));
      haptic.success();
      sound.success();
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatTokenAmount(quote.toAmount, quote.toToken.decimals)} ${toTok.symbol}`;
      stopCountdown();
      reset();
      setAmount('');
      setSuccess({ hash, summary, isBridge, fromChain: activeChain, toChain: toChain });
      notifyAndLog('tx', isBridge ? t('bridgeSent') : t('swapExecuted'), summary);
      void watchConfirmation(activeChain, hash, summary);
    } catch (e) {
      // Devis probablement invalide après un échec (prix, blockhash, nonce) : on
      // l'invalide pour forcer un nouveau devis avant toute nouvelle tentative.
      setStale(true);
      throw e;
    } finally { setStep(null); }
  };

  const fromChainCfg = chain;
  const toChainCfg = getAdapter(toChain).config;
  const impact = quote && quote.fromAmountUsd > 0 ? ((quote.toAmountUsd - quote.fromAmountUsd) / quote.fromAmountUsd) * 100 : null;
  const impactLevel: 'none' | 'warning' | 'danger' = impact == null ? 'none' : impact <= -10 ? 'danger' : impact <= -3 ? 'warning' : 'none';
  const routeSentence = quote
    ? `Via ${quote.toolName}${isBridge ? ` de ${fromChainCfg.name} vers ${toChainCfg.name}` : ` sur ${fromChainCfg.name}`}${quote.durationSec > 0 ? `, environ ${quote.durationSec < 60 ? `${quote.durationSec} secondes` : `${Math.round(quote.durationSec / 60)} min`}` : ''}.`
    : null;
  const [advanced, setAdvanced] = useState(false);
  const [review, setReview] = useState(false);

  const TokenBlock = ({ label, tok, chainId, value, onPick, right, muted }: { label: string; tok: Tok | undefined; chainId: string; value: string; onPick: () => void; right?: React.ReactNode; muted?: boolean }) => (
    <Surface level={2} style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" tone="secondary">{label}</Text>
        {right}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontSize: 36, lineHeight: 42, color: muted ? colors.textSecondary : colors.text }}>{value || '0'}</Text>
        <RNPressable onPress={onPick} accessibilityLabel={`Choisir le token ${label}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: radius.round, backgroundColor: pressed ? colors.surface3 : colors.surface1, borderWidth: 1, borderColor: colors.border })}>
          {tok ? <TokenIcon symbol={tok.symbol} logo={tok.logo} seed={tok.address} size={28} /> : <Skeleton width={28} height={28} round />}
          <View>
            <Text variant="body">{tok?.symbol ?? '…'}</Text>
            <Text variant="micro" tone="tertiary">{getAdapter(chainId).config.name}</Text>
          </View>
          <Icon name="caretDown" size={14} tone="muted" />
        </RNPressable>
      </View>
    </Surface>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <Text variant="title2" style={{ flex: 1 }}>{isBridge ? t('bridgeAction') : t('swapAction')}</Text>
        {quote && countdown > 0 && !stale ? <CountdownRing progress={countdown / QUOTE_TTL_S} /> : null}
      </View>

      {!available || !account ? (
        <View style={{ padding: SCREEN_MARGIN }}>
          <Surface><EmptyState icon="exchange" title={t('swapUnavailable')} body={t('swapUnavailableHint')} /></Surface>
        </View>
      ) : !fromTok || !toTok ? (
        <View style={{ padding: SCREEN_MARGIN, gap: space[3] }}><Skeleton height={110} /><Skeleton height={110} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[3] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Tu donnes */}
          <TokenBlock
            label={t("youGive")}
            tok={fromTok}
            chainId={activeChain}
            value={amount}
            onPick={() => setPickerState({ visible: true, side: 'from' })}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Text variant="caption" tone="secondary" tabular>{t('availableLabel')} : {formatTokenAmount(getAvailable(), fromTok.decimals)}</Text>
                <Chip label={t("chipMax")} onPress={() => { onMax(); reset(); stopCountdown(); }} />
              </View>
            }
          />

          {/* Inversion : tourne de 180° avec le ressort Vif */}
          <View style={{ alignItems: 'center', marginVertical: -space[4], zIndex: 2 }}>
            <Animated.View style={flipStyle}>
              <RNPressable onPress={onFlip} disabled={isBridge} accessibilityLabel="Inverser les tokens" style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.round, backgroundColor: pressed ? colors.surface3 : colors.surface1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: isBridge ? 0.4 : 1 })}>
                <Icon name="convert" size={18} />
              </RNPressable>
            </Animated.View>
          </View>

          {/* Tu reçois */}
          <TokenBlock
            label={t("youReceive")}
            tok={toTok}
            chainId={toChain}
            value={quote ? formatTokenAmount(quote.toAmount, quote.toToken.decimals) : ''}
            muted={!quote}
            onPick={() => setPickerState({ visible: true, side: 'to' })}
            right={quote && quote.toAmountUsd > 0 ? <Text variant="caption" tone="secondary" tabular>≈ {formatFiat(quote.toAmountUsd)} $</Text> : null}
          />

          {/* Route en une phrase + impact */}
          {quote ? (
            <View style={{ gap: space[1] }}>
              <Text variant="caption" tone="secondary">{routeSentence}</Text>
              {impact != null ? <Text variant="caption" tone={impactLevel === 'danger' ? 'danger' : impactLevel === 'warning' ? 'warning' : 'secondary'} tabular>{t('priceImpact').replace('{impact}', impact.toFixed(2))}</Text> : null}
              {stale ? <Text variant="caption" tone="warning">{t('quoteStale')}</Text> : null}
            </View>
          ) : null}
          {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          {isNativeTokenAddress(fromTok.address) ? <Text variant="micro" tone="tertiary">{t('gasReserve')} : {gasReserve ? `≈ ${formatTokenAmount(gasReserve.raw, chain.nativeDecimals)} ${chain.nativeSymbol}${gasReserve.live ? '' : ' (est.)'}` : '…'}</Text> : null}

          {/* Réglage avancé replié : slippage */}
          <RNPressable onPress={() => setAdvanced((v) => !v)} style={{ paddingVertical: space[1] }}>
            <Text variant="caption" tone="secondary">{advanced ? t("hideAdvancedSettings") : t("advancedSettingsSlippage").replace('{slippage}', (Number(slippage) * 100).toFixed(1))}</Text>
          </RNPressable>
          {advanced ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {['0.001', '0.005', '0.01', '0.03'].map((v) => <Chip key={v} label={`${(Number(v) * 100).toFixed(1).replace('.', ',')} %`} selected={slippage === v} onPress={() => { setSlippage(v); reset(); stopCountdown(); }} />)}
            </View>
          ) : null}

          {/* Clavier maison + action */}
          <AmountKeypad value={amount} onChange={(v) => { setAmount(v); reset(); stopCountdown(); }} maxDecimals={Math.min(fromTok.decimals, 8)} />
          {!quote ? (
            <Button label={t('getQuote')} onPress={() => onQuote()} loading={loading} disabled={!amount || Number(amount) <= 0} />
          ) : stale ? (
            <Button label={t('getQuote')} onPress={() => onQuote()} loading={loading} />
          ) : (
            <Button label={isBridge ? t("verifyBridgeBtn") : t("verifySwapBtn")} onPress={() => setReview(true)} />
          )}
        </ScrollView>
      )}

      {/* Récapitulatif */}
      <Sheet visible={review && !confirming && !!quote && !!fromTok && !!toTok} onClose={() => setReview(false)}>
        {quote && fromTok && toTok ? (
          <>
            <Text variant="title2">{isBridge ? t("verifyBridgeTitle") : t("verifySwapTitle")}</Text>
            <Surface level={1} padded={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t("youGive")}</Text><Text variant="body" tone="down" tabular>− {amount} {fromTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t("youReceiveEstimated")}</Text><Text variant="body" tone="up" tabular>+ {formatTokenAmount(quote.toAmount, quote.toToken.decimals)} {toTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('minReceived')}</Text><Text variant="caption" tabular>{formatTokenAmount(quote.toAmountMin, quote.toToken.decimals)} {toTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('networkFee')}</Text><Text variant="caption" tabular>{quote.gasCostNative > 0n && quote.gasToken ? `≈ ${formatTokenAmount(quote.gasCostNative, quote.gasToken.decimals)} ${quote.gasToken.symbol}` : ''}{quote.gasCostUsd > 0 ? ` (≈ ${formatFiat(quote.gasCostUsd)} $)` : quote.gasCostNative > 0n ? '' : '—'}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('kalyxFee')}</Text><Text variant="caption" tabular>{(Number(KALYX_FEE) * 100).toFixed(1).replace('.', ',')} %</Text></View>
            </Surface>
            <Text variant="caption" tone="secondary">{routeSentence}{t("slippageTolerance")}{(quote.slippage * 100).toFixed(1).replace('.', ',')} %.</Text>
            {impactLevel === 'danger' ? (
              <>
                <Text variant="caption" tone="danger">{t("highPriceImpactWarning")}</Text>
                <HoldButton label={t("holdToConfirm")} danger icon="exchange" onComplete={() => { setReview(false); setConfirming(true); }} />
              </>
            ) : (
              <Button label={isBridge ? t('bridgeAction') : t('swapAction')} onPress={() => { haptic.medium(); setReview(false); setConfirming(true); }} />
            )}
          </>
        ) : null}
      </Sheet>

      <ConfirmUnlock
        visible={confirming}
        title={isBridge ? t('bridgeConfirmTitle') : t('swapConfirmTitle')}
        subtitle={quote && fromTok && toTok ? `${amount} ${fromTok.symbol} → ≈ ${formatTokenAmount(quote.toAmount, quote.toToken.decimals)} ${toTok.symbol}` : undefined}
        statusText={step}
        perform={onConfirm}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
        aiContext={quote ? { to: quote.tx.type === 'evm' ? quote.tx.to : quote.toToken.address, value: quote.fromAmount.toString(), method: 'Swap via ' + quote.toolName } : undefined}
      />

      <TokenPicker
        visible={pickerState.visible}
        initialChainId={pickerState.side === 'from' ? activeChain : toChain}
        onClose={() => setPickerState((prev) => ({ ...prev, visible: false }))}
        onSelect={(token, chainId) => {
          if (pickerState.side === 'from') {
            const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === token.address.toLowerCase());
            if (idx >= 0) setFrom(idx);
          } else {
            setToChain(chainId);
            const list = tokensByChain[chainId] ?? [];
            const idx = list.findIndex((tk) => tk.address.toLowerCase() === token.address.toLowerCase());
            setTo(Math.max(0, idx));
          }
          reset();
          stopCountdown();
        }}
      />

      {success?.isBridge ? (
        <BridgeProgress visible={success != null} hash={success?.hash} summary={success?.summary} fromChainId={success?.fromChain} toChainId={success?.toChain} onClose={() => setSuccess(null)} />
      ) : (
        <SuccessModal visible={success != null} title={t("swapped")} hash={success?.hash} message={success?.summary} onClose={() => setSuccess(null)} />
      )}
    </View>
  );
}
