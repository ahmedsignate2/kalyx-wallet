import { haptic } from "../lib/haptics";
import { useReduceMotion } from '../lib/reduceMotion';
import { sound } from "../lib/sound";
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { swapTokenTint, withAlpha } from '../lib/tokenColors';
import { SnapSlider } from '../ui/SnapSlider';
import { availableFrom, needsRead, readSwapBalance, swapBalanceKey, type BalanceEntry } from '../lib/swapBalance';
import { CHAIN_LOGO_SVG } from '../src/domain/chains/chainLogos.generated';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, Button, IconButton, Surface, Divider, TokenIcon, AmountKeypad, Chip, Sheet, HoldButton, CountdownRing, Skeleton, EmptyState, Pressable as KPressable } from '../ui/kit';
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
import { fill } from '../lib/i18n';
import { Rise, GOLD } from '../ui/nova';
import {
  getAdapter,
  getErc20Tokens,
  getAdapterV2,
  getBestQuote,
  parseAmount,
  formatTokenAmount,
  formatInputAmount,
  formatAmount,
  formatFiat,
  isWalletError,
  NATIVE_TOKEN,
  listChains,
  estimateGasReserve,
  STONFI_TON_RESERVE,
  type ChainAdapter,
  type GasReserve,
  type SwapQuote,
  EvmChainAdapter,
  SolanaChainAdapter,
} from '../src';
import { useTokenStore, type Tok } from '../lib/tokenStore';
import { usePortfolioStore } from '../lib/portfolio';
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

/**
 * Réserve de natif pour un ÉCHANGE. Sur TON, STON.fi fait joindre ~0,3 TON de
 * gas au message (l'essentiel revient en excédent) : la réserve d'un envoi
 * simple (0,01 TON) laissait « Max » proposer un montant que le portefeuille ne
 * pouvait pas payer, et l'échange échouait à la simulation.
 */
function swapGasReserve(adapter: ChainAdapter): Promise<GasReserve> {
  if (adapter.config.family === 'ton') return Promise.resolve({ raw: STONFI_TON_RESERVE, live: false });
  return estimateGasReserve(adapter);
}

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
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  // Jeton « Tu donnes » choisi sur un AUTRE réseau : on bascule, puis on le sélectionne dès que sa liste est là.
  const pendingFrom = useRef<{ chainId: string; address: string } | null>(null);
  const account = useWallet((s) => s.account);
  const executeSwap = useWallet((s) => s.executeSwap);
  const chain = getAdapter(activeChain).config;

  const fetchTokens = useTokenStore(s => s.fetchTokens);
  const tokensByChain = useTokenStore(s => s.tokensByChain);
  const loadingTokens = useTokenStore(s => s.loading);

  useEffect(() => {
    fetchTokens(activeChain);
  }, [activeChain, fetchTokens]);
  // TON : échanges STON.fi, sur TON seulement (src/domain/swap/stonfi.ts).
  const available = !chain.testnet && (chain.family === 'evm' || chain.family === 'solana' || chain.family === 'ton');

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

  /*
   * SOLDES ÉTIQUETÉS (lib/swapBalance.ts) : un registre clé → état, la clé
   * portant réseau + compte + jeton (+ un compteur relevé après chaque swap).
   * Une réponse ne peut atterrir que sur SA clé : jamais le solde d'un autre
   * jeton formaté avec d'autres décimales, ni celui d'un autre réseau. Un
   * échec est « erreur » (réessayable), jamais 0.
   */
  const [balances, setBalances] = useState<Record<string, BalanceEntry>>({});
  const [balanceNonce, setBalanceNonce] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  /**
   * Réserve de gas DYNAMIQUE (estimée sur le RPC du réseau actif) : ce qu'on
   * garde de natif pour que la tx passe. `null` = pas encore chargée.
   */
  const [gasReserve, setGasReserve] = useState<GasReserve | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGasReserve(null);
    swapGasReserve(getAdapter(activeChain))
      .then((r) => {
        if (!cancelled) setGasReserve(r);
      })
      // L'estimateur a son propre repli ; s'il échoue quand même, la réserve reste
      // inconnue (jamais 0 : « Max » dépenserait tout, sans rien pour le gas).
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeChain]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Succès : hash + résumé (capturés avant reset) pour l'écran animé.
  const [success, setSuccess] = useState<{ hash: string; summary: string; isBridge?: boolean; fromChain?: string; toChain?: string } | null>(null);
  const [held, setHeld] = useState<Tok[]>([]);
  const params = useLocalSearchParams<{ contract?: string; to?: string }>();

  // Tokens réellement détenus sur la chaîne active → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (!account?.address) return;
    const loaded = (list: Tok[]) => {
      if (!cancelled) setHeld(list);
    };

    if (chain.family === 'evm') {
      getErc20Tokens(chain, account.address)
        .then((detected) => {
          loaded(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
        })
        .catch(() => loaded([]));
    } else if (chain.family === 'ton') {
      // Jettons détenus, par adresse brute du maître (même forme que la liste STON.fi).
      getAdapterV2(activeChain)
        .listTokens?.(account.address)
        .then((detected) => {
          loaded(detected.map((tk) => ({ symbol: tk.symbol, address: String(tk.id), decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
        })
        .catch(() => loaded([]));
    } else if (chain.family === 'solana') {
      const adapter = getAdapter(activeChain) as any;
      if (adapter.getSplTokens) {
        adapter.getSplTokens(account.address)
          .then((detected: any[]) => {
            loaded(detected.map((tk) => ({ symbol: tk.symbol, address: tk.mint, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
          })
          .catch(() => loaded([]));
      } else loaded([]);
    } else loaded([]);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, account?.address]);

  // Liste source = tokens curés + tokens détenus non déjà listés (dédupliqués par adresse).
  const curated = tokensByChain[activeChain] ?? [];
  const curatedAddrs = new Set(curated.map((tk) => tk.address.toLowerCase()));
  const fromTokens = [...curated, ...held.filter((tk) => !curatedAddrs.has(tk.address.toLowerCase()))];

  // Réseau changé depuis le sélecteur : sélectionner le jeton demandé quand sa liste est chargée.
  useEffect(() => {
    const p = pendingFrom.current;
    if (!p || p.chainId !== activeChain) return;
    const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === p.address.toLowerCase());
    if (idx >= 0) {
      setFrom(idx);
      pendingFrom.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, fromTokens.length]);

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
  /*
   * INVERSION EN ORBITE : les deux cartes échangent leur place en tournant
   * l'une autour de l'autre — celle du haut passe par la droite, l'autre par
   * la gauche, en se rétrécissant au croisement. L'état est inversé tout de
   * suite ; chaque carte part de l'ancienne place de l'autre et revient à la
   * sienne. Distance = hauteur d'une carte + l'écart, mesurée.
   */
  const reduceMotion = useReduceMotion();
  const orbit = useSharedValue(1);
  const [blockH, setBlockH] = useState(0);
  const dist = blockH + space[2];
  const topOrbitStyle = useAnimatedStyle(() => {
    const k = Math.sin(orbit.value * Math.PI);
    return { zIndex: 2, transform: [{ translateY: dist * (1 - orbit.value) }, { translateX: 34 * k }, { scale: 1 - 0.08 * k }] };
  });
  const bottomOrbitStyle = useAnimatedStyle(() => {
    const k = Math.sin(orbit.value * Math.PI);
    return { zIndex: 1, transform: [{ translateY: -dist * (1 - orbit.value) }, { translateX: -34 * k }, { scale: 1 - 0.08 * k }], opacity: 1 - 0.25 * k };
  });

  const onFlip = () => {
    if (isBridge) return;
    haptic.heavy();
    // Un montant tiré d'un cran (« Max » de l'ancien jeton) ne vaut rien pour l'autre : effacé.
    if (sliderPct != null) setAmount('');
    setSliderPct(null);
    setFrom(to);
    setTo(from);
    reset();
    stopCountdown();
    flip.value = 0;
    flip.value = withSpring(1, springs.snappy);
    if (!reduceMotion && blockH > 0) {
      orbit.value = 0;
      orbit.value = withSpring(1, { damping: 17, stiffness: 150, mass: 0.9 });
    }
  };

  const owner = account?.address;
  const srcNative = !!fromTok && isNativeTokenAddress(fromTok.address);
  const srcKey = fromTok ? `${swapBalanceKey(activeChain, owner, srcNative ? 'native' : fromTok.address)}#${balanceNonce}` : '';
  /** Le natif sert aussi à payer le gas d'un échange de jeton. */
  const gasKey = `${swapBalanceKey(activeChain, owner, 'native')}#${balanceNonce}`;
  const loadBalance = (key: string, token: string, native: boolean) => {
    if (!owner) return;
    setBalances((b) => ({ ...b, [key]: { status: 'loading' } }));
    readSwapBalance(activeChain, owner, token, native)
      .then((raw) => setBalances((b) => ({ ...b, [key]: { status: 'ok', raw, at: Date.now() } })))
      .catch(() => setBalances((b) => ({ ...b, [key]: { status: 'error' } })));
  };
  useEffect(() => {
    if (!owner || !fromTok) return;
    // Absent, en erreur, ou lu il y a plus de 30 s (dépensé ailleurs entre-temps) : relu.
    const now = Date.now();
    if (needsRead(balances[srcKey], now)) loadBalance(srcKey, fromTok.address, srcNative);
    if (!srcNative && needsRead(balances[gasKey], now)) loadBalance(gasKey, 'native', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey, gasKey]);
  const srcEntry = srcKey ? balances[srcKey] : undefined;
  const gasEntry = balances[srcNative ? srcKey : gasKey];
  const nativeBalance = gasEntry?.status === 'ok' ? gasEntry.raw : null;
  /** Lecture du solde en échec : « Disponible » propose de réessayer. */
  const balanceError = srcEntry?.status === 'error';
  const retryBalance = () => fromTok && loadBalance(srcKey, fromTok.address, srcNative);
  /** Solde brut du jeton source, ou null s'il n'est pas (encore) lu. */
  const tokenBalanceOrNull = (): bigint | null => (srcEntry?.status === 'ok' ? srcEntry.raw : null);
  const getTokenBalance = (): bigint => tokenBalanceOrNull() ?? 0n;
  /**
   * Solde DISPONIBLE pour l'échange : solde brut moins la réserve de gas si
   * le jeton source est la monnaie native ; null tant que l'un des deux est
   * inconnu. Les raccourcis (Max, curseur) et la validation n'utilisent que lui.
   */
  const availableOrNull = (): bigint | null => (fromTok ? availableFrom(srcEntry, srcNative, gasReserve?.raw ?? null) : null);
  const getAvailable = (): bigint => availableOrNull() ?? 0n;

  const [sliderPct, setSliderPct] = useState<number | null>(null);
  /** Disponible pas encore lu : le curseur attend (un cran calculé sur 0 restait faux). */
  const balanceUnknown = availableOrNull() == null;
  const setPercent = (pct: bigint) => {
    if (!fromTok) return;
    const avail = getAvailable();
    setAmount(avail > 0n ? formatInputAmount((avail * pct) / 100n, fromTok.decimals) : '0');
  };
  const onMax = () => {
    if (balanceUnknown) return; // pas de « Max » calculé sur un solde pas encore lu
    setSliderPct(100);
    setPercent(100n);
    reset();
    stopCountdown();
  };
  /*
   * Changer de jeton source ou de réseau EFFACE le cran : l'ancienne part ne
   * vaut rien pour l'autre jeton, et ses soldes ne sont pas encore relus.
   */
  const sliderPctRef = useRef(sliderPct);
  sliderPctRef.current = sliderPct;
  useEffect(() => {
    // Un montant tiré d'un cran (« Max » de l'ancien jeton) n'a plus de sens : on l'efface aussi.
    if (sliderPctRef.current != null) {
      setAmount('');
      reset(); // le devis portait sur l'ancien montant
      stopCountdown();
    }
    setSliderPct(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromTok?.address, activeChain, account?.address]);

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
    /*
     * Solde INCONNU (lecture en cours, ou échouée) : relu ici plutôt que pris
     * pour 0 — « fonds insuffisants » à tort après un changement de réseau.
     */
    let bal = tokenBalanceOrNull();
    if (bal == null) {
      try {
        bal = await readSwapBalance(activeChain, account!.address, fromTok.address, srcNative);
      } catch {
        return null; // réseau muet : on laisse le devis trancher
      }
    }
    // Réserve : celle du state, ou ré-estimée à la volée si pas encore chargée.
    let reserve: bigint;
    try {
      reserve = gasReserve?.raw ?? (await swapGasReserve(getAdapter(activeChain))).raw;
    } catch {
      return null; // réserve inestimable : on laisse le devis trancher
    }
    const reserveStr = `${formatTokenAmount(reserve, chain.nativeDecimals)} ${chain.nativeSymbol}`;
    if (isNativeTokenAddress(fromTok.address)) {
      // Deux cas distincts : pas même de quoi payer le gas / montant trop grand une fois le gas réservé.
      if (bal < reserve) return t('errGasBelowMinimum').replace('{amount}', reserveStr);
      if (raw > bal - reserve) return t('errAboveAvailable').replace('{amount}', reserveStr);
    } else {
      if (raw > bal) return t('errInsufficientFunds');
      // Token SPL/ERC-20 : le natif du wallet doit couvrir le gas estimé.
      try {
        const native = nativeBalance ?? (await readSwapBalance(activeChain, account!.address, 'native', true));
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
      setError(isWalletError(e) && /décimales/.test(e.message) ? t('errTooManyDecimals').replace('{max}', String(fromTok.decimals)) : t('amountInvalid'));
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
      else if (toFamily === 'ton') targetAddress = account.address; // TON → TON : même adresse

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
      usePortfolioStore.getState().invalidate();
      haptic.success();
      sound.success();
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatTokenAmount(quote.toAmount, quote.toToken.decimals)} ${toTok.symbol}`;
      stopCountdown();
      reset();
      setAmount('');
      setSliderPct(null);
      setSuccess({ hash, summary, isBridge, fromChain: activeChain, toChain: toChain });
      notifyAndLog('tx', isBridge ? t('bridgeSent') : t('swapExecuted'), summary);
      /*
       * Soldes relus À LA CONFIRMATION, pas à la diffusion : relus tout de
       * suite, ils auraient mis en cache le solde d'avant l'échange.
       */
      void watchConfirmation(activeChain, hash, summary).finally(() => {
        if (mountedRef.current) setBalanceNonce((n) => n + 1);
      });
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
  const routeTitle = quote
    ? isBridge
      ? fill(t('swapRouteBridge'), { tool: quote.toolName, from: fromChainCfg.name, to: toChainCfg.name })
      : fill(t('swapRouteOn'), { tool: quote.toolName, chain: fromChainCfg.name })
    : null;
  const routeDuration = quote && quote.durationSec > 0
    ? quote.durationSec < 60 ? fill(t('durSeconds'), { n: String(quote.durationSec) }) : fill(t('durMinutes'), { n: String(Math.round(quote.durationSec / 60)) })
    : '';
  const routeSentence = routeTitle ? `${routeTitle}${routeDuration ? ` · ${routeDuration}` : ''}. ` : null;
  const slippagePct = `${(Number(slippage) * 100).toFixed(1).replace('.', ',')} %`;
  const [advanced, setAdvanced] = useState(false);
  const [review, setReview] = useState(false);

  const TokenBlock = ({ label, tok, chainId, value, onPick, right, bottom, muted }: { label: string; tok: Tok | undefined; chainId: string; value: string; onPick: () => void; right?: React.ReactNode; bottom?: React.ReactNode; muted?: boolean }) => (
    <View style={{ gap: space[2], padding: 18, borderRadius: 26, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" tone="secondary">{label}</Text>
        {right}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontSize: 44, lineHeight: 50, letterSpacing: -1.2, color: muted ? colors.textTertiary : colors.text }}>{value || '0'}</Text>
        <KPressable onPress={onPick} accessibilityLabel={`${label} : ${tok?.symbol ?? ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 46, paddingLeft: 6, paddingRight: 12, borderRadius: 23, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
          {tok ? <TokenIcon symbol={tok.symbol} logo={tok.logo} seed={tok.address} size={32} /> : <Skeleton width={32} height={32} round />}
          <View>
            <Text variant="body">{tok?.symbol ?? '…'}</Text>
            <Text variant="micro" tone="tertiary">{getAdapter(chainId).config.name}</Text>
          </View>
          <Icon name="caretDown" size={14} tone="muted" />
        </KPressable>
      </View>
      {bottom}
    </View>
  );

  const RouteRow = ({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warning' }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
      <Text variant="caption" tone="secondary">{label}</Text>
      <Text variant="caption" tabular tone={tone} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );

  /*
   * FOND DU SWAP : la couleur de ce qu'on donne en haut, de ce qu'on reçoit en
   * bas. L'écran dit l'échange avant même qu'on lise les symboles, et il change
   * de lumière quand on change de jeton ou qu'on inverse.
   */
  const fromTint = swapTokenTint(fromTok?.symbol, activeChain, CHAIN_LOGO_SVG);
  const toTint = swapTokenTint(toTok?.symbol, toChain, CHAIN_LOGO_SVG);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {fromTint || toTint ? (
        <Animated.View key={`${fromTint}-${toTint}`} entering={FadeIn.duration(450)} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <LinearGradient
            colors={[withAlpha(fromTint ?? colors.bg, mode === 'dark' ? 0.24 : 0.14), withAlpha(fromTint ?? colors.bg, 0), withAlpha(toTint ?? colors.bg, 0), withAlpha(toTint ?? colors.bg, mode === 'dark' ? 0.2 : 0.12)]}
            locations={[0, 0.42, 0.62, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </Animated.View>
      ) : null}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <Text variant="title2" style={{ flex: 1 }}>{isBridge ? t('bridgeAction') : t('swapAction')}</Text>
        {quote && countdown > 0 && !stale ? <CountdownRing progress={countdown / QUOTE_TTL_S} /> : null}
        {available && account ? (
          <KPressable onPress={() => setAdvanced((v) => !v)} accessibilityLabel={fill(t('slippageChip'), { pct: slippagePct })} style={{ paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: advanced ? colors.surface2 : colors.surface1, borderWidth: 1, borderColor: colors.border }}>
            <Text variant="caption" tone="secondary">{fill(t('slippageChip'), { pct: slippagePct })}</Text>
          </KPressable>
        ) : null}
      </View>

      {!available || !account ? (
        <View style={{ padding: SCREEN_MARGIN }}>
          <Surface><EmptyState icon="exchange" title={t('swapUnavailable')} body={t('swapUnavailableHint')} /></Surface>
        </View>
      ) : !fromTok || !toTok ? (
        <View style={{ padding: SCREEN_MARGIN, gap: space[3] }}><Skeleton height={110} /><Skeleton height={110} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[3] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {advanced ? (
            <Rise style={{ flexDirection: 'row', gap: space[2] }}>
              {['0.001', '0.005', '0.01', '0.03'].map((v) => <Chip key={v} label={`${(Number(v) * 100).toFixed(1).replace('.', ',')} %`} selected={slippage === v} onPress={() => { setSlippage(v); reset(); stopCountdown(); }} />)}
            </Rise>
          ) : null}

          {/* Les deux cartes, et le disque d'inversion posé à cheval entre elles. */}
          <View style={{ gap: space[2] }}>
            <Rise style={{ zIndex: 2 }}>
              <Animated.View style={topOrbitStyle} onLayout={(e) => setBlockH(Math.round(e.nativeEvent.layout.height))}>
              <TokenBlock
                label={t("youGive")}
                tok={fromTok}
                chainId={activeChain}
                value={amount}
                onPick={() => setPickerState({ visible: true, side: 'from' })}
                /*
                 * « Disponible · Max » EN HAUT, face au libellé : en bas de la
                 * carte, il passait sous le disque d'inversion posé à cheval.
                 */
                right={
                  <KPressable onPress={balanceError ? retryBalance : onMax} hitSlop={8} accessibilityLabel={balanceError ? t('retry') : t("chipMax")}>
                    <Text variant="caption" tone="secondary" tabular numberOfLines={1}>{t('availableLabel')} : {balanceError ? '—' : balanceUnknown ? '…' : formatTokenAmount(getAvailable(), fromTok.decimals)} · <Text variant="caption" style={{ color: GOLD }}>{balanceError ? t('retry') : t("chipMax")}</Text></Text>
                  </KPressable>
                }
                bottom={<Text variant="caption" tone="secondary" tabular>{quote && quote.fromAmountUsd > 0 ? `≈ ${formatFiat(quote.fromAmountUsd)} $` : ' '}</Text>}
              />
              </Animated.View>
            </Rise>
            <Rise delay={70}>
              <Animated.View style={bottomOrbitStyle}>
              <TokenBlock
                label={t("youReceive")}
                tok={toTok}
                chainId={toChain}
                value={quote ? formatTokenAmount(quote.toAmount, quote.toToken.decimals) : ''}
                muted={!quote}
                onPick={() => setPickerState({ visible: true, side: 'to' })}
                bottom={<Text variant="caption" tone="secondary" tabular>{quote && quote.toAmountUsd > 0 ? `≈ ${formatFiat(quote.toAmountUsd)} $` : ' '}</Text>}
              />
              </Animated.View>
            </Rise>
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={flipStyle}>
                <KPressable onPress={onFlip} disabled={isBridge} overshoot haptic="light" accessibilityLabel={t('swapFlip')} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, borderWidth: 4, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', opacity: isBridge ? 0.5 : 1 }}>
                  <Icon name="convert" size={22} color={colors.onPrimary} />
                </KPressable>
              </Animated.View>
            </View>
          </View>

          {/* La route, en carte : par où passe l'échange, ce qu'il coûte, ce qu'on reçoit au pire. */}
          {quote ? (
            <Rise delay={120} style={{ gap: space[3], padding: space[4], borderRadius: 22, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stale ? colors.warning : colors.up }} />
                <Text variant="body" numberOfLines={2} style={{ flex: 1 }}>{routeTitle}</Text>
                {routeDuration ? <Text variant="caption" tone="secondary">{routeDuration}</Text> : null}
              </View>
              <RouteRow label={t('minReceived')} value={`${formatTokenAmount(quote.toAmountMin, quote.toToken.decimals)} ${toTok.symbol}`} />
              <RouteRow label={t('kalyxFee')} value={`${((quote.kalyxFeeApplied ?? 0) * 100).toFixed(1).replace('.', ',')} %`} />
              <RouteRow label={t('networkFee')} value={quote.gasCostUsd > 0 ? `≈ ${formatFiat(quote.gasCostUsd)} $` : quote.gasCostNative > 0n && quote.gasToken ? `≈ ${formatTokenAmount(quote.gasCostNative, quote.gasToken.decimals)} ${quote.gasToken.symbol}` : '—'} />
              {impact != null && impactLevel !== 'none' ? <Text variant="caption" tone={impactLevel === 'danger' ? 'danger' : 'warning'} tabular>{t('priceImpact').replace('{impact}', impact.toFixed(2))}</Text> : null}
              {stale ? <Text variant="caption" tone="warning">{t('quoteStale')}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Icon name="security" size={15} color={colors.up} />
                <Text variant="micro" tone="secondary" style={{ flex: 1 }}>{t('swapGuarded')}</Text>
              </View>
            </Rise>
          ) : null}
          {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          {isNativeTokenAddress(fromTok.address) ? <Text variant="micro" tone="tertiary">{t('gasReserve')} : {gasReserve ? `≈ ${formatTokenAmount(gasReserve.raw, chain.nativeDecimals)} ${chain.nativeSymbol}${gasReserve.live ? '' : ' (est.)'}` : '…'}</Text> : null}

          {/* Clavier maison + action */}
          {/* Curseur à crans : « la moitié », « tout » au pouce ; le clavier pour un montant précis. */}
          <SnapSlider
            value={sliderPct}
            disabled={balanceUnknown}
            accent={fromTint}
            maxLabel={t('chipMax')}
            onChange={(p) => { setSliderPct(p); setPercent(BigInt(p)); reset(); stopCountdown(); }}
          />
          <AmountKeypad value={amount} onChange={(v) => { setSliderPct(null); setAmount(v); reset(); stopCountdown(); }} maxDecimals={Math.min(fromTok.decimals, 8)} />
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('kalyxFee')}</Text><Text variant="caption" tabular>{((quote.kalyxFeeApplied ?? 0) * 100).toFixed(1).replace('.', ',')} %</Text></View>
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
            if (chainId !== activeChain) {
              pendingFrom.current = { chainId, address: token.address };
              setActiveChain(chainId);
              setToChain(chainId);
              setFrom(0);
              setTo(1);
            } else {
              const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === token.address.toLowerCase());
              if (idx >= 0) setFrom(idx);
            }
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
