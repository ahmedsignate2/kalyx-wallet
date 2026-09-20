/**
 * Swap (web) — même écran que l'app (app/swap.tsx) : « Tu donnes » / « Tu
 * reçois », inversion, sélecteur de tokens partagé (TokenPicker : tous les
 * réseaux EVM + Solana, listes curées LI.FI — jamais de spam), devis LI.FI /
 * Jupiter avec compte à rebours, slippage, récapitulatif en sheet, écran de
 * succès. Bridge (réseau de destination différent) inclus.
 *
 * Différence avec l'app : ce site ne signe JAMAIS. La confirmation envoie au
 * téléphone via WalletConnect :
 *  - EVM    : approve ERC-20 si l'allowance est insuffisante, puis la tx du swap.
 *  - Solana : la transaction du devis est signée par le téléphone puis diffusée
 *             ici (simulation → envoi → confirmation, comme l'app).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable } from 'react-native';
import { Text, Button, IconButton, Surface, Divider, TokenIcon, AmountKeypad, Chip, Sheet, HoldButton, CountdownRing, Skeleton, EmptyState } from '../kit';
import { SuccessModal } from '../SuccessModal';
import { TokenPicker } from '../TokenPicker';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { space, SCREEN_MARGIN, radius } from '../tokens';
import { useT } from '../../lib/settingsStore';
import { useTokenStore, type Tok } from '../../lib/tokenStore';
import { useWebConnect } from '../../lib/webConnect';
import { submitSolanaSigned } from '../../lib/solanaSubmit';
import { friendlyTxError } from '../../lib/txError';
import {
  getAdapter, getErc20Tokens, getBestQuote, parseAmount, formatTokenAmount, formatInputAmount, formatFiat, isWalletError,
  NATIVE_TOKEN, estimateGasReserve, type GasReserve, type SwapQuote, EvmChainAdapter, SolanaChainAdapter, type ChainConfig,
} from '../../src';
import { encodeErc20Approve, hexQuantity } from './evmEncode';
import { useWebT } from './webI18n';
import { KalyxSpinner } from './motion';
import { addressForChain, chainOf } from './webAccounts';

const QUOTE_TTL_S = 30;

function isNativeTokenAddress(address?: string): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return a === '0x0000000000000000000000000000000000000000' || a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || a === '11111111111111111111111111111111' || a === NATIVE_TOKEN.toLowerCase();
}

function pick<T>(o: unknown, keys: string[]): T | undefined {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v != null) return v as T;
  }
  return undefined;
}

export function SwapScreen({ chain: initialChain, onClose }: { chain: ChainConfig; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const tw = useWebT();
  const request = useWebConnect((s) => s.request);
  const setSessionChain = useWebConnect((s) => s.setChain);
  const accounts = useWebConnect((s) => s.accounts);

  // Réseau source local à l'écran (l'app bascule le réseau actif du wallet ;
  // ici on n'aligne la session qu'au moment d'envoyer la demande).
  const [activeChain, setActiveChain] = useState(initialChain.family === 'bitcoin' ? 'ethereum' : initialChain.id);
  const chain = chainOf(activeChain) ?? initialChain;
  const address = addressForChain(accounts, activeChain);
  const pendingFrom = useRef<{ chainId: string; address: string } | null>(null);

  const fetchTokens = useTokenStore((s) => s.fetchTokens);
  const tokensByChain = useTokenStore((s) => s.tokensByChain);
  useEffect(() => { fetchTokens(activeChain); }, [activeChain, fetchTokens]);
  const available = !chain.testnet && (chain.family === 'evm' || chain.family === 'solana') && !!address;

  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [toChain, setToChain] = useState(activeChain);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [pickerState, setPickerState] = useState<{ visible: boolean; side: 'from' | 'to' }>({ visible: false, side: 'from' });
  const [slippage, setSlippage] = useState('0.005');
  const [countdown, setCountdown] = useState(0);
  const [stale, setStale] = useState(false);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [selectedTokenBalance, setSelectedTokenBalance] = useState<bigint | null>(null);
  const [gasReserve, setGasReserve] = useState<GasReserve | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGasReserve(null);
    estimateGasReserve(getAdapter(activeChain)).then((r) => { if (!cancelled) setGasReserve(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeChain]);
  const reserveRaw = gasReserve?.raw ?? 0n;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ hash: string; summary: string; isBridge?: boolean } | null>(null);
  const [held, setHeld] = useState<Tok[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!address) { setNativeBalance(null); return; }
    getAdapter(activeChain).getBalance(address)
      .then((b) => { if (!cancelled) setNativeBalance(b.raw); })
      .catch(() => { if (!cancelled) setNativeBalance(null); });
    return () => { cancelled = true; };
  }, [activeChain, address]);

  // Tokens réellement détenus → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (!address) return;
    if (chain.family === 'evm') {
      getErc20Tokens(chain, address)
        .then((detected) => { if (!cancelled) setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo, balance: tk.raw }) as Tok & { balance: bigint })); })
        .catch(() => { if (!cancelled) setHeld([]); });
    } else if (chain.family === 'solana') {
      const adapter = getAdapter(activeChain);
      if (adapter instanceof SolanaChainAdapter) {
        adapter.getSplTokens(address)
          .then((detected) => { if (!cancelled) setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.mint, decimals: tk.decimals, logo: tk.logo, balance: tk.raw }) as Tok & { balance: bigint })); })
          .catch(() => {});
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, address]);

  const curated = tokensByChain[activeChain] ?? [];
  const curatedAddrs = new Set(curated.map((tk) => tk.address.toLowerCase()));
  const fromTokens = [...curated, ...held.filter((tk) => !curatedAddrs.has(tk.address.toLowerCase()))];

  useEffect(() => {
    const p = pendingFrom.current;
    if (!p || p.chainId !== activeChain) return;
    const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === p.address.toLowerCase());
    if (idx >= 0) { setFrom(idx); pendingFrom.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, fromTokens.length]);

  useEffect(() => { if (toChain !== activeChain) fetchTokens(toChain); }, [toChain, activeChain, fetchTokens]);

  const reset = () => { setQuote(null); setError(null); setStale(false); };

  const fromTok = fromTokens[from] ?? fromTokens[0];
  const toTokens = tokensByChain[toChain] ?? [];
  const toTok = toTokens[to] ?? toTokens[0];
  const isBridge = toChain !== activeChain;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!address || !fromTok || isNativeTokenAddress(fromTok.address)) { setSelectedTokenBalance(null); return; }
    const heldTok = held.find((h) => h.address.toLowerCase() === fromTok.address.toLowerCase()) as (Tok & { balance?: bigint }) | undefined;
    if (heldTok) { setSelectedTokenBalance(heldTok.balance ?? 0n); return; }
    const adapter = getAdapter(activeChain);
    if (adapter instanceof EvmChainAdapter) {
      adapter.getTokenBalance(fromTok.address, address).then((b) => { if (!cancelled) setSelectedTokenBalance(b); }).catch(() => { if (!cancelled) setSelectedTokenBalance(0n); });
    } else if (adapter instanceof SolanaChainAdapter) {
      adapter.getSplTokens(address).then((tokens) => {
        if (!cancelled) { const found = tokens.find((x) => x.mint.toLowerCase() === fromTok.address.toLowerCase()); setSelectedTokenBalance(found ? found.raw : 0n); }
      }).catch(() => { if (!cancelled) setSelectedTokenBalance(0n); });
    }
    return () => { cancelled = true; };
  }, [activeChain, address, fromTok?.address, held]);

  const stopCountdown = () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    setCountdown(0);
  };
  const onFlip = () => {
    if (isBridge) return;
    setFrom(to); setTo(from);
    reset(); stopCountdown();
    setFlipped((v) => !v);
  };

  const getTokenBalance = (): bigint => {
    if (!fromTok) return 0n;
    if (isNativeTokenAddress(fromTok.address)) return nativeBalance ?? 0n;
    if (selectedTokenBalance != null) return selectedTokenBalance;
    const heldTok = held.find((h) => h.address.toLowerCase() === fromTok.address.toLowerCase()) as (Tok & { balance?: bigint }) | undefined;
    return heldTok?.balance ?? 0n;
  };
  const getAvailable = (): bigint => {
    if (!fromTok) return 0n;
    const raw = getTokenBalance();
    if (!isNativeTokenAddress(fromTok.address)) return raw;
    return raw > reserveRaw ? raw - reserveRaw : 0n;
  };
  const onMax = () => { if (fromTok) { const avail = getAvailable(); setAmount(avail > 0n ? formatInputAmount(avail, fromTok.decimals) : '0'); } };

  const pausedRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { pausedRef.current = confirming || step !== null; }, [confirming, step]);
  const startCountdown = () => {
    stopCountdown();
    setCountdown(QUOTE_TTL_S);
    countdownInterval.current = setInterval(() => {
      if (pausedRef.current) return;
      setCountdown((c) => {
        if (c <= 1) { void onQuote({ auto: true }); return QUOTE_TTL_S; }
        return c - 1;
      });
    }, 1000);
  };

  const preflight = async (raw: bigint): Promise<string | null> => {
    if (!isBridge && fromTok.address.toLowerCase() === toTok.address.toLowerCase()) return t('swapTwoTokens');
    const bal = getTokenBalance();
    const reserve = gasReserve?.raw ?? (await estimateGasReserve(getAdapter(activeChain))).raw;
    const reserveStr = `${formatTokenAmount(reserve, chain.nativeDecimals)} ${chain.nativeSymbol}`;
    if (isNativeTokenAddress(fromTok.address)) {
      if (bal < reserve) return t('errGasBelowMinimum').replace('{amount}', reserveStr);
      if (raw > bal - reserve) return t('errAboveAvailable').replace('{amount}', reserveStr);
    } else {
      if (raw > bal) return t('errInsufficientFunds');
      try {
        const native = nativeBalance ?? (await getAdapter(activeChain).getBalance(address)).raw;
        if (native < reserve) return t('errNeedNativeForGas').replace('{amount}', reserveStr);
      } catch { /* réseau muet : on laisse le devis trancher */ }
    }
    return null;
  };

  const onQuote = async (opts: { auto?: boolean } = {}) => {
    if (!fromTok || !toTok || !address) return;
    if (opts.auto && pausedRef.current) return;
    let raw: bigint;
    try {
      raw = parseAmount(amount, fromTok.decimals).raw;
    } catch (e) {
      stopCountdown(); reset();
      setError(isWalletError(e) ? e.message : t('amountInvalid'));
      return;
    }
    if (!opts.auto) {
      reset();
      const pre = await preflight(raw);
      if (pre) { stopCountdown(); setError(pre); return; }
      setLoading(true);
    }
    try {
      const targetAddress = addressForChain(accounts, toChain) || address;
      const q = await getBestQuote({
        fromChainId: activeChain, toChainId: toChain, fromToken: fromTok.address, toToken: toTok.address,
        fromAmount: raw.toString(), fromAddress: address, toAddress: targetAddress, slippage: Number(slippage),
        fromTokenInfo: { symbol: fromTok.symbol, decimals: fromTok.decimals, logo: fromTok.logo },
        toTokenInfo: { symbol: toTok.symbol, decimals: toTok.decimals, logo: toTok.logo },
      });
      if (!q) { setError(t('noRoute')); stopCountdown(); return; }
      setError(null); setStale(false); setQuote(q);
      if (!countdownInterval.current) startCountdown();
    } catch (e) {
      if (opts.auto) setStale(true);
      else { setError(friendlyTxError(e, t as never)); stopCountdown(); }
    } finally {
      if (!opts.auto) setLoading(false);
    }
  };
  useEffect(() => () => { if (countdownInterval.current) clearInterval(countdownInterval.current); }, []);

  /** Exécution via le téléphone (WalletConnect) — équivalent web de walletStore.executeSwap. */
  const executeViaPhone = async (q: SwapQuote): Promise<string> => {
    const adapter = getAdapter(activeChain);
    setSessionChain(activeChain);
    if (q.tx.type === 'evm' && adapter instanceof EvmChainAdapter) {
      const fromAddr = q.fromToken.address.toLowerCase();
      if (fromAddr !== NATIVE_TOKEN.toLowerCase() && q.approvalAddress) {
        const allowance = await adapter.getAllowance(q.fromToken.address, address, q.approvalAddress).catch(() => 0n);
        if (allowance < q.fromAmount) {
          setStep(t('stApproving'));
          const approveHash = await request('eth_sendTransaction', [{ from: address, to: q.fromToken.address, value: '0x0', data: encodeErc20Approve(q.approvalAddress, q.fromAmount) }]);
          setStep(t('stApprovalWait'));
          await adapter.waitForTx(approveHash);
          const seen = await adapter.waitForAllowance(q.fromToken.address, address, q.approvalAddress, q.fromAmount);
          if (!seen) throw new Error(tw('allowanceNotVisible'));
        }
      }
      setStep(t('stSwapping'));
      const hash = await request('eth_sendTransaction', [{ from: address, to: q.tx.to, value: hexQuantity(q.tx.value), data: q.tx.data }]);
      setStep(t('stConfirming'));
      await adapter.waitForTx(hash);
      return hash;
    }
    if (q.tx.type === 'solana' && chain.family === 'solana') {
      setStep(t('stSwapping'));
      const res: unknown = await request('solana_signTransaction', [{ transaction: q.tx.data }]);
      const signed = pick<string>(res, ['transaction']) ?? (typeof res === 'string' ? res : undefined);
      if (!signed) throw new Error(tw('phoneNoSignedTx'));
      return submitSolanaSigned(signed, (st) => setStep(t(st === 'sending' ? 'stSwapping' : 'stConfirming')));
    }
    throw new Error(tw('swapIncompatible', { type: q.tx.type }));
  };

  const onConfirm = async () => {
    if (!quote) return;
    setConfirming(true);
    setStep(t('preparing'));
    try {
      const hash = await executeViaPhone(quote);
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatTokenAmount(quote.toAmount, quote.toToken.decimals)} ${toTok.symbol}`;
      stopCountdown(); reset(); setAmount('');
      setSuccess({ hash, summary, isBridge });
    } catch (e) {
      setStale(true);
      setError(friendlyTxError(e, t as never));
    } finally {
      setStep(null);
      setConfirming(false);
    }
  };

  const toChainCfg = chainOf(toChain) ?? chain;
  const impact = quote && quote.fromAmountUsd > 0 ? ((quote.toAmountUsd - quote.fromAmountUsd) / quote.fromAmountUsd) * 100 : null;
  const impactLevel: 'none' | 'warning' | 'danger' = impact == null ? 'none' : impact <= -10 ? 'danger' : impact <= -3 ? 'warning' : 'none';
  const routeSentence = quote
    ? `Via ${quote.toolName}${isBridge ? tw('routeBridge', { from: chain.name, to: toChainCfg.name }) : tw('routeOn', { chain: chain.name })}${quote.durationSec > 0 ? tw('routeAbout', { d: quote.durationSec < 60 ? tw('secondsUnit', { n: quote.durationSec }) : tw('minutesUnit', { n: Math.round(quote.durationSec / 60) }) }) : ''}.`
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
        <RNPressable onPress={onPick} accessibilityLabel={tw('chooseToken', { label })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: radius.round, backgroundColor: pressed ? colors.surface3 : colors.surface1, borderWidth: 1, borderColor: colors.border })}>
          {tok ? <TokenIcon symbol={tok.symbol} logo={tok.logo} seed={tok.address} size={28} /> : <Skeleton width={28} height={28} round />}
          <View>
            <Text variant="body">{tok?.symbol ?? '…'}</Text>
            <Text variant="micro" tone="tertiary">{chainOf(chainId)?.name ?? chainId}</Text>
          </View>
          <Icon name="caretDown" size={14} tone="muted" />
        </RNPressable>
      </View>
    </Surface>
  );

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 20 }}>
      <View style={{ paddingHorizontal: SCREEN_MARGIN, height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t('back')} tone="ghost" onPress={onClose} />
        <Text variant="title2" style={{ flex: 1 }}>{isBridge ? t('bridgeAction') : t('swapAction')}</Text>
        {quote && countdown > 0 && !stale ? <CountdownRing progress={countdown / QUOTE_TTL_S} /> : null}
      </View>

      {!available ? (
        <View style={{ padding: SCREEN_MARGIN }}>
          <Surface><EmptyState icon="exchange" title={t('swapUnavailable')} body={t('swapUnavailableHint')} /></Surface>
        </View>
      ) : !fromTok || !toTok ? (
        <View style={{ padding: SCREEN_MARGIN, gap: space[3] }}><Skeleton height={110} /><Skeleton height={110} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: space[6], gap: space[3] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TokenBlock
            label={t('youGive')}
            tok={fromTok}
            chainId={activeChain}
            value={amount}
            onPick={() => setPickerState({ visible: true, side: 'from' })}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Text variant="caption" tone="secondary" tabular>{t('availableLabel')} : {formatTokenAmount(getAvailable(), fromTok.decimals)}</Text>
                <Chip label={t('chipMax')} onPress={() => { onMax(); reset(); stopCountdown(); }} />
              </View>
            }
          />

          <View style={{ alignItems: 'center', marginVertical: -space[4], zIndex: 2 }}>
            <View style={{ transform: [{ rotate: flipped ? '180deg' : '0deg' }] }}>
              <RNPressable onPress={onFlip} disabled={isBridge} accessibilityLabel={tw('flipTokens')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.round, backgroundColor: pressed ? colors.surface3 : colors.surface1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: isBridge ? 0.4 : 1 })}>
                <Icon name="convert" size={18} />
              </RNPressable>
            </View>
          </View>

          <TokenBlock
            label={t('youReceive')}
            tok={toTok}
            chainId={toChain}
            value={quote ? formatTokenAmount(quote.toAmount, quote.toToken.decimals) : ''}
            muted={!quote}
            onPick={() => setPickerState({ visible: true, side: 'to' })}
            right={quote && quote.toAmountUsd > 0 ? <Text variant="caption" tone="secondary" tabular>≈ {formatFiat(quote.toAmountUsd)} $</Text> : null}
          />

          {quote ? (
            <View style={{ gap: space[1] }}>
              <Text variant="caption" tone="secondary">{routeSentence}</Text>
              {impact != null ? <Text variant="caption" tone={impactLevel === 'danger' ? 'danger' : impactLevel === 'warning' ? 'warning' : 'secondary'} tabular>{t('priceImpact').replace('{impact}', impact.toFixed(2))}</Text> : null}
              {stale ? <Text variant="caption" tone="warning">{t('quoteStale')}</Text> : null}
            </View>
          ) : null}
          {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          {isNativeTokenAddress(fromTok.address) ? <Text variant="micro" tone="tertiary">{t('gasReserve')} : {gasReserve ? `≈ ${formatTokenAmount(gasReserve.raw, chain.nativeDecimals)} ${chain.nativeSymbol}${gasReserve.live ? '' : ' (est.)'}` : '…'}</Text> : null}

          <RNPressable onPress={() => setAdvanced((v) => !v)} style={{ paddingVertical: space[1] }}>
            <Text variant="caption" tone="secondary">{advanced ? t('hideAdvancedSettings') : t('advancedSettingsSlippage').replace('{slippage}', (Number(slippage) * 100).toFixed(1))}</Text>
          </RNPressable>
          {advanced ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {['0.001', '0.005', '0.01', '0.03'].map((v) => <Chip key={v} label={`${(Number(v) * 100).toFixed(1).replace('.', ',')} %`} selected={slippage === v} onPress={() => { setSlippage(v); reset(); stopCountdown(); }} />)}
            </View>
          ) : null}

          <AmountKeypad value={amount} onChange={(v) => { setAmount(v); reset(); stopCountdown(); }} maxDecimals={Math.min(fromTok.decimals, 8)} />
          {!quote ? (
            <Button label={t('getQuote')} onPress={() => onQuote()} loading={loading} disabled={!amount || Number(amount) <= 0} />
          ) : stale ? (
            <Button label={t('getQuote')} onPress={() => onQuote()} loading={loading} />
          ) : (
            <Button label={isBridge ? t('verifyBridgeBtn') : t('verifySwapBtn')} onPress={() => setReview(true)} />
          )}
        </ScrollView>
      )}

      {/* Récapitulatif */}
      <Sheet visible={review && !confirming && !!quote && !!fromTok && !!toTok} onClose={() => setReview(false)}>
        {quote && fromTok && toTok ? (
          <>
            <Text variant="title2">{isBridge ? t('verifyBridgeTitle') : t('verifySwapTitle')}</Text>
            <Surface level={1} padded={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('youGive')}</Text><Text variant="body" tone="down" tabular>− {amount} {fromTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('youReceiveEstimated')}</Text><Text variant="body" tone="up" tabular>+ {formatTokenAmount(quote.toAmount, quote.toToken.decimals)} {toTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('minReceived')}</Text><Text variant="caption" tabular>{formatTokenAmount(quote.toAmountMin, quote.toToken.decimals)} {toTok.symbol}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('networkFee')}</Text><Text variant="caption" tabular>{quote.gasCostNative > 0n && quote.gasToken ? `≈ ${formatTokenAmount(quote.gasCostNative, quote.gasToken.decimals)} ${quote.gasToken.symbol}` : ''}{quote.gasCostUsd > 0 ? ` (≈ ${formatFiat(quote.gasCostUsd)} $)` : quote.gasCostNative > 0n ? '' : '—'}</Text></View>
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space[3] }}><Text variant="caption" tone="secondary">{t('kalyxFee')}</Text><Text variant="caption" tabular>{((quote.kalyxFeeApplied ?? 0) * 100).toFixed(1).replace('.', ',')} %</Text></View>
            </Surface>
            <Text variant="caption" tone="secondary">{routeSentence}{t('slippageTolerance')}{(quote.slippage * 100).toFixed(1).replace('.', ',')} %.</Text>
            <Text variant="caption" tone="tertiary">{tw('signOnPhoneNote')}</Text>
            {impactLevel === 'danger' ? (
              <>
                <Text variant="caption" tone="danger">{t('highPriceImpactWarning')}</Text>
                <HoldButton label={t('holdToConfirm')} danger icon="exchange" onComplete={() => { setReview(false); void onConfirm(); }} />
              </>
            ) : (
              <Button label={isBridge ? t('bridgeAction') : t('swapAction')} onPress={() => { setReview(false); void onConfirm(); }} />
            )}
          </>
        ) : null}
      </Sheet>

      {/* Exécution en cours : statut (le téléphone signe, ce site diffuse/attend) */}
      <Sheet visible={confirming} onClose={() => undefined} dismissable={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
          <KalyxSpinner size={24} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{step ?? t('preparing')}</Text>
            <Text variant="caption" tone="secondary">{tw('approveWhenAsked')}</Text>
          </View>
        </View>
      </Sheet>

      <TokenPicker
        visible={pickerState.visible}
        initialChainId={pickerState.side === 'from' ? activeChain : toChain}
        address={addressForChain(accounts, pickerState.side === 'from' ? activeChain : toChain) || address}
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

      <SuccessModal
        visible={success != null}
        title={success?.isBridge ? t('bridgeSent') : t('swapped')}
        hash={success?.hash}
        explorerUrl={chain.explorerUrl}
        message={success?.summary}
        onClose={() => { setSuccess(null); onClose(); }}
      />
    </View>
  );
}
