import { haptic } from "../lib/haptics";
import { sound } from "../lib/sound";
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Animated, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { NovaRing } from '../ui/NovaRing';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { BridgeTrackerModal } from '../ui/BridgeTrackerModal';
import { SuccessModal } from '../ui/SuccessModal';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { friendlyTxError } from '../lib/txError';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type SwapStatus, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import {
  getAdapter,
  getErc20Tokens,
  getBestQuote,
  parseAmount,
  formatBalance,
  formatAmount,
  isWalletError,
  NATIVE_TOKEN,
  NOVA_FEE,
  listChains,
  type SwapQuote,
  EvmChainAdapter,
  SolanaChainAdapter,
} from '../src';
import { useTokenStore, type Tok } from '../lib/tokenStore';
import { TokenPicker } from '../ui/TokenPicker';

/**
 * Gas reserve to subtract from MAX when swapping native tokens.
 * Prevents "insufficient funds for gas" on the final transaction.
 * Conservative estimates per chain family.
 */
const GAS_RESERVE: Record<string, bigint> = {
  // EVM: ~0.003 ETH/BNB/AVAX covers most swap+approve gas
  ethereum: 3_000_000_000_000_000n,   // 0.003 ETH
  polygon: 30_000_000_000_000_000n,   // 0.03 POL (cheap gas but higher unit)
  base: 1_000_000_000_000_000n,       // 0.001 ETH (L2, cheap)
  bnb: 3_000_000_000_000_000n,        // 0.003 BNB
  arbitrum: 1_000_000_000_000_000n,   // 0.001 ETH (L2)
  optimism: 1_000_000_000_000_000n,   // 0.001 ETH (L2)
  avalanche: 30_000_000_000_000_000n, // 0.03 AVAX
  linea: 1_000_000_000_000_000n,      // 0.001 ETH (L2)
  scroll: 1_000_000_000_000_000n,     // 0.001 ETH (L2)
  blast: 1_000_000_000_000_000n,      // 0.001 ETH (L2)
};

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

function logoFor(novaChain: string, tok: Tok): string {
  if (tok.logo) return tok.logo;
  return 'https://via.placeholder.com/18'; // Fallback
}

export default function Swap() {
  const { colors, typography } = useTheme();
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
  const countdownInterval = useRef<any>(null);

  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [selectedTokenBalance, setSelectedTokenBalance] = useState<bigint | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Succès : hash + résumé (capturés avant reset) pour l'écran animé.
  const [success, setSuccess] = useState<{ hash: string; summary: string; isBridge?: boolean; fromChain?: string; toChain?: string } | null>(null);
  const [held, setHeld] = useState<Tok[]>([]);
  const params = useLocalSearchParams<{ contract?: string }>();

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
  };

  const fromTok = fromTokens[from] ?? fromTokens[0];
  const toTokens = tokensByChain[toChain] ?? [];
  const toTok = toTokens[to] ?? toTokens[0];
  const isBridge = toChain !== activeChain;
  const flipAnim = useRef(new Animated.Value(0)).current;

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
    Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 5 }).start(() => flipAnim.setValue(0));
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

  const onMax = () => {
    if (!fromTok) return;
    const raw = getTokenBalance();
    if (isNativeTokenAddress(fromTok.address)) {
      const reserve = GAS_RESERVE[activeChain] ?? 3_000_000_000_000_000n;
      const maxRaw = raw > reserve ? raw - reserve : 0n;
      setAmount(formatBalance(maxRaw, fromTok.decimals, fromTok.decimals));
    } else {
      setAmount(formatBalance(raw, fromTok.decimals, fromTok.decimals));
    }
  };

  const onHalf = () => {
    if (!fromTok) return;
    const raw = getTokenBalance();
    setAmount(formatBalance(raw / 2n, fromTok.decimals, fromTok.decimals));
  };

  const onQuote = async () => {
    reset();
    if (!isBridge && fromTok.address === toTok.address) { setError(t('swapTwoTokens')); return; }
    let raw: bigint;
    try { raw = parseAmount(amount, fromTok.decimals).raw; } catch (e) { setError(isWalletError(e) ? e.message : t('amountInvalid')); return; }
    if (selectedTokenBalance !== null && raw > selectedTokenBalance) {
      setError(t('errInsufficientFunds'));
      return;
    }
    
    // Check if user has enough native SOL to pay for SPL swap fees
    if (getAdapter(activeChain).config.family === 'solana' && fromTok.address !== '11111111111111111111111111111111') {
      try {
        const bal = await getAdapter(activeChain).getBalance(account!.address);
        if (bal.raw < 5000n) {
          setError(t('errInsufficientFunds'));
          return;
        }
      } catch (e) {
        console.warn('Failed to check SOL balance for gas', e);
      }
    }

    setLoading(true);
    try {
      const w = useWallet.getState();
      const storedAccount = w.accounts[w.activeAccountIndex];
      const toFamily = getAdapter(toChain).config.family;
      let targetAddress = account!.address;
      if (toFamily === 'solana' && storedAccount.solAddress) targetAddress = storedAccount.solAddress;
      else if (toFamily === 'bitcoin' && storedAccount.btcAddress) targetAddress = storedAccount.btcAddress;
      else if (toFamily === 'evm') targetAddress = storedAccount.evmAddress;

      const q = await getBestQuote({ fromChainId: activeChain, toChainId: toChain, fromToken: fromTok.address, toToken: toTok.address, fromAmount: raw.toString(), fromAddress: account!.address, toAddress: targetAddress });
      if (!q) setError(t('noRoute')); else setQuote(q);
    } catch (e) { console.error('[swap.tsx] Erreur getBestQuote:', e); setError(friendlyTxError(e, t as any)); } finally { setLoading(false); }
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setCountdown(15);
    countdownInterval.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
           clearInterval(countdownInterval.current!);
           onQuote(); // Auto-refresh
           return 0;
        }
        return c - 1;
      });
    }, 1000);
  };
  
  useEffect(() => {
    return () => { if (countdownInterval.current) clearInterval(countdownInterval.current); };
  }, []);


  const onConfirm = async (unlock: Unlock) => {
    if (!quote) return;
    setStep(t('preparing'));
    sound.send();
    haptic.success();
    try {
      const hash = await executeSwap(quote, unlock, (s) => setStep(t(STATUS_KEY[s])));
      haptic.success();
      sound.success();
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatBalance(quote.toAmount, quote.toToken.decimals, 6)} ${toTok.symbol}`;
      reset();
      setAmount('');
      setSuccess({ hash, summary, isBridge, fromChain: activeChain, toChain: toChain });
      notifyAndLog('tx', isBridge ? t('bridgeSent') : t('swapExecuted'), summary);
      void watchConfirmation(activeChain, hash, summary);
    } finally { setStep(null); }
  };

  const renderContent = () => {
    if (!available || !account) {
      return (
        <GlassCard>
          <Text style={typography.bodyStrong}>{t('swapUnavailable')}</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('swapUnavailableHint')}</Text>
        </GlassCard>
      );
    }
    if (!fromTok || !toTok) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[typography.muted, { marginTop: spacing(2) }]}>{t('findingRoute') || 'Chargement...'}</Text>
        </View>
      );
    }
    const isNativeFrom = isNativeTokenAddress(fromTok.address);
    const impact = quote && quote.fromAmountUsd > 0 ? ((quote.toAmountUsd - quote.fromAmountUsd) / quote.fromAmountUsd) * 100 : null;

    return (
      <>
        <GlassCard glow>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[typography.muted, { fontSize: 12 }]}>{t('swapFromLabel')}</Text>
            <Text style={[typography.muted, { fontSize: 12 }]}>
              {'Solde'}: {formatBalance(getTokenBalance(), fromTok.decimals, 6)} {fromTok.symbol}
            </Text>
          </View>
          <TextInput
            style={{ color: colors.text, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textFaint}
            value={amount}
            onChangeText={(v) => { setAmount(v); reset(); }}
          />
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: 4 }}>
            <Pressable onPress={() => { onMax(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontFamily: fonts.bold }}>MAX</Text>
            </Pressable>
            <Pressable onPress={() => { onHalf(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold }}>50%</Text>
            </Pressable>
          </View>
          {isNativeFrom && amount.trim().length > 0 ? (
            <Text style={{ fontSize: 11, color: colors.textFaint, fontFamily: fonts.medium }}>
              {t('gasReserve')}: ≈ {formatBalance(GAS_RESERVE[activeChain] ?? 3_000_000_000_000_000n, fromTok.decimals, 6)} {fromTok.symbol}
            </Text>
          ) : null}
          <View style={{ marginTop: spacing(1.5) }}>
            <Pressable 
              onPress={() => setPickerState({ visible: true, side: 'from' })}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgDeep, padding: spacing(1.25), borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(activeChain, fromTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  <Image source={{ uri: (tokensByChain[activeChain]?.find(t => isNativeTokenAddress(t.address))?.logo) || 'https://via.placeholder.com/18' }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                </View>
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{fromTok.symbol}</Text>
              </View>
              <Icon name="chevron" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </GlassCard>

        <View style={{ zIndex: 10, marginVertical: -14, alignSelf: 'center' }}>
          <Animated.View style={{ transform: [{ rotate: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Pressable
              onPress={onFlip}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgDeep, borderWidth: 2, borderColor: colors.glassBorder, justifyContent: 'center', alignItems: 'center' }}
            >
              <Icon name="exchange" size={20} color={colors.accent} />
            </Pressable>
          </Animated.View>
        </View>

        <GlassCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[typography.muted, { fontSize: 12 }]}>{t('toEstimated')}</Text>
            {isBridge ? <Text style={{ color: colors.accent, fontSize: 12, fontFamily: fonts.semibold }}>🌉 {t('bridge')}</Text> : null}
          </View>
          <Text style={{ color: quote ? colors.text : colors.textMuted, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}>
            {quote ? formatBalance(quote.toAmount, quote.toToken.decimals, 6) : '—'}
          </Text>
          <View style={{ marginTop: spacing(1.5) }}>
            <Pressable 
              onPress={() => setPickerState({ visible: true, side: 'to' })}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgDeep, padding: spacing(1.25), borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                

                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  {isBridge && (
                    <Image source={{ uri: (tokensByChain[toChain]?.find(t => isNativeTokenAddress(t.address))?.logo) || 'https://via.placeholder.com/18' }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                  )}
                </View>


                <View>
                  <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{toTok?.symbol || 'Sélectionner'}</Text>
                  <Text style={{ color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12 }}>{getAdapter(toChain).config.name}</Text>
                </View>
              </View>
              <Icon name="chevron" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </GlassCard>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium }}>Slippage Tolérance</Text>
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            {['0.001', '0.005', '0.01'].map(v => (
              <Pressable
                key={v}
                onPress={() => setSlippage(v)}
                style={{
                  backgroundColor: slippage === v ? colors.accent : colors.glass,
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
                  borderWidth: 1, borderColor: slippage === v ? colors.accent : colors.glassBorder
                }}
              >
                <Text style={{ color: slippage === v ? '#fff' : colors.text, fontSize: 12, fontFamily: fonts.semibold }}>{Number(v) * 100}%</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {quote ? (
          <GlassCard>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, alignItems: 'center' }}>
              <Text style={typography.muted}>{t("route")}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                 <Image source={{ uri: logoFor(activeChain, fromTok) }} style={{ width: 14, height: 14, borderRadius: 7 }} />
                 <Icon name="forward" size={12} color={colors.textMuted} />
                 <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 12 }}>{quote.toolName}</Text>
                 <Icon name="forward" size={12} color={colors.textMuted} />
                 <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 14, height: 14, borderRadius: 7 }} />
              </View>
            </View>
            {quote.toolName === 'Relay' && (
              <View style={{ backgroundColor: colors.accent + '20', padding: 8, borderRadius: radii.sm, marginTop: 4, marginBottom: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 11, fontFamily: fonts.medium, textAlign: 'center' }}>
                  🌉 Cross-chain EVM ↔ Solana via Relay
                </Text>
              </View>
            )}

            <Row label={t("minReceived")} value={`${formatBalance(quote.toAmountMin, quote.toToken.decimals, 6)} ${toTok.symbol}`} />
            {quote.gasCostNative > 0n && quote.gasToken ? (
              <Row label={t("networkFee")} value={`≈ ${formatBalance(quote.gasCostNative, quote.gasToken.decimals, 6)} ${quote.gasToken.symbol}${quote.gasCostUsd > 0 ? ` ($${quote.gasCostUsd.toFixed(2)})` : ''}`} />
            ) : quote.gasCostUsd > 0 ? (
              <Row label={t("networkFee")} value={`≈ $${quote.gasCostUsd.toFixed(2)}`} />
            ) : null}
            <Row label={t("novaFee")} value={`${(Number(NOVA_FEE) * 100).toFixed(1)} %`} />
            {impact != null ? <Row label={t("priceImpact")} value={`${impact.toFixed(2)} %`} color={impact < -3 ? colors.danger : impact < -1 ? colors.warning : colors.up} /> : null}
            <Row label={t("slippage")} value={`${(quote.slippage * 100).toFixed(1)} %`} />
            {quote.durationSec > 0 ? <Row label={t("estTime")} value={`≈ ${quote.durationSec}s`} /> : null}
          </GlassCard>
        ) : null}

        {error ? <ErrorBox message={error} /> : null}

        <View style={{ marginTop: spacing(2) }}>
          {!quote ? (
            loading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing(2) }}>
                <NovaRing size={40} />
                <Text style={{ marginTop: spacing(1), color: colors.textMuted, fontFamily: fonts.medium }}>{t('findingRoute')}</Text>
              </View>
            ) : (
              <Button label={t('getQuote')} onPress={onQuote} disabled={!amount || Number(amount) <= 0 || !fromTok || !toTok} />
            )
          ) : (
            <Button label={t('swapAction')} onPress={() => setConfirming(true)} variant="primary" />
          )}
        </View>

        <ConfirmUnlock
          visible={confirming}
          title={isBridge ? t('bridgeConfirmTitle') : t('swapConfirmTitle')}
          subtitle={quote ? `${amount} ${fromTok.symbol} → ≈ ${formatBalance(quote.toAmount, quote.toToken.decimals, 6)} ${toTok.symbol}` : undefined}
          statusText={step}
          perform={onConfirm}
          onDone={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
          aiContext={quote ? { to: quote.tx.type === 'evm' ? quote.tx.to : quote.toToken.address, value: quote.fromAmount.toString(), method: 'Swap via ' + quote.toolName } : undefined}
        />

        <TokenPicker
          visible={pickerState.visible}
          initialChainId={pickerState.side === 'from' ? activeChain : toChain}
          onClose={() => setPickerState(prev => ({ ...prev, visible: false }))}
          onSelect={(token, chainId) => {
            if (pickerState.side === 'from') {
              const idx = fromTokens.findIndex(t => t.address.toLowerCase() === token.address.toLowerCase());
              if (idx >= 0) setFrom(idx);
            } else {
              setToChain(chainId);
              const tokensForChain = tokensByChain[chainId] ?? [];
              const idx = tokensForChain.findIndex(t => t.address.toLowerCase() === token.address.toLowerCase());
              if (idx >= 0) setTo(idx);
              else setTo(Math.max(0, idx));
            }
            reset();
          }}
        />

        {success?.isBridge ? (
          <BridgeTrackerModal
            visible={success != null}
            hash={success?.hash}
            summary={success?.summary}
            fromChainId={success?.fromChain}
            toChainId={success?.toChain}
            onClose={() => setSuccess(null)}
          />
        ) : (
          <SuccessModal
            visible={success != null}
            title={t('swapExecuted')}
            hash={success?.hash}
            message={success?.summary}
            onClose={() => setSuccess(null)}
          />
        )}
      </>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('swapBridge') }} />
      <PremiumScreen>
      <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
    </PremiumScreen>
    </>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: color ?? colors.text, fontFamily: fonts.semibold }}>{value}</Text>
    </View>
  );
}
