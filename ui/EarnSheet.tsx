/**
 * EarnSheet — feuille de dépôt / retrait pour un protocole Earn.
 *
 * Flux : saisie du montant → APERÇU (devis réel : sortie attendue, route,
 * frais réseau, frais Kalyx) → confirmation biométrie/PIN → exécution →
 * succès. Aucune transaction n'est signée sans devis affiché.
 *
 * Réutilisée par l'écran Earn et les onglets Staking/DeFi du portefeuille.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './components';
import { RemoteIcon, ErrorBox } from './premium';
import { Icon } from './icon';
import { ConfirmUnlock } from './ConfirmUnlock';
import { SuccessModal } from './SuccessModal';
import { fonts, radii, spacing, useTheme } from './theme';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useWallet, type Unlock } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import { haptic } from '../lib/haptics';
import { notifyAndLog } from '../lib/notificationCenter';
import { useEarn, priceOf, quote as earnQuote, execute as earnExecute, maxDeposit, nativeReserve, type EarnStatus, type EarnAccount } from '../lib/earn';
import { getAdapter, parseAmount, formatTokenAmount, formatInputAmount, formatNumber, formatFiat, formatPercent, formatAmount, isNative, isWalletError, type EarnProtocol, type EarnAction, type EarnQuote } from '../src';

const STATUS_KEY: Record<EarnStatus, 'earnQuoting' | 'stApproving' | 'stApprovalWait' | 'stSending' | 'stConfirming'> = {
  quoting: 'earnQuoting',
  approving: 'stApproving',
  approvalWait: 'stApprovalWait',
  sending: 'stSending',
  confirming: 'stConfirming',
};

const money = formatFiat;

/** Montant lisible (précision selon la grandeur — règle unique de l'app). */
const fmt = formatTokenAmount;

function pct(raw: bigint, p: number): bigint {
  return (raw * BigInt(p)) / 100n;
}

export function EarnSheet({
  visible,
  protocol,
  action,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  protocol: EarnProtocol | null;
  action: EarnAction;
  onClose: () => void;
  /** Appelé après confirmation on-chain (rafraîchir soldes/positions). */
  onSuccess?: () => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const fiat = useSettings((s) => s.fiat);
  const wallet = useWallet();
  const earn = useEarn();

  const acct = useMemo<EarnAccount | null>(() => {
    const a = wallet.accounts.find((x) => x.index === wallet.activeAccountIndex) ?? wallet.accounts[0];
    return a ? { evmAddress: a.evmAddress, solAddress: a.solAddress } : null;
  }, [wallet.accounts, wallet.activeAccountIndex]);

  const [amountStr, setAmountStr] = useState('');
  const [step, setStep] = useState<'input' | 'quote'>('input');
  const [quoting, setQuoting] = useState(false);
  const [maxing, setMaxing] = useState(false);
  const [q, setQ] = useState<EarnQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAll, setIsAll] = useState(false);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [status, setStatus] = useState<EarnStatus | null>(null);
  const [success, setSuccess] = useState<{ hash: string; explorerUrl?: string } | null>(null);
  /** Réserve native à garder (frais + rent ATA sur Solana) — calculée à l'ouverture. */
  const [reserve, setReserve] = useState<bigint>(0n);
  const inputRef = useRef<TextInput>(null);

  // Réinitialise à chaque ouverture.
  useEffect(() => {
    if (visible) {
      setAmountStr('');
      setStep('input');
      setQ(null);
      setError(null);
      setIsAll(false);
      setStatus(null);
      setSuccess(null);
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [visible, protocol?.id, action]);

  // Réserve de gas/rent pour un dépôt natif (SOL/ETH/AVAX) : connue AVANT la saisie.
  useEffect(() => {
    let cancelled = false;
    setReserve(0n);
    if (!visible || !protocol || !acct || action !== 'deposit' || !isNative(protocol.underlying)) return;
    const bal = earn.balances.underlying[protocol.id] ?? 0n;
    nativeReserve(protocol, acct, bal)
      .then((r) => { if (!cancelled) setReserve(r); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, protocol?.id, action, acct?.evmAddress, acct?.solAddress]);

  if (!protocol || !acct) return null;
  const p = protocol;
  const isDeposit = action === 'deposit';
  const tokenIn = isDeposit ? p.underlying : p.receipt;
  const tokenOut = isDeposit ? p.receipt : p.underlying;
  const chain = getAdapter(p.chainId).config;

  const underlyingBal = earn.balances.underlying[p.id] ?? 0n;
  const gasBal = earn.balances.gas[p.id] ?? 0n;
  const receiptBal = earn.positions.find((x) => x.protocolId === p.id)?.balance ?? 0n;
  const available = isDeposit ? underlyingBal : receiptBal;
  const apy = earn.apys[p.id] ?? null;
  const priceIn = priceOf(earn.prices, tokenIn.coingeckoId);
  const priceOut = priceOf(earn.prices, tokenOut.coingeckoId);
  const gasPrice = priceOf(earn.prices, chain.coingeckoId);

  let amountRaw = 0n;
  let parseError = false;
  if (amountStr.trim()) {
    try {
      amountRaw = parseAmount(amountStr, tokenIn.decimals).raw;
    } catch {
      parseError = true;
    }
  }
  // MAX au retrait : on envoie le solde EXACT (l'affichage est tronqué à 6 décimales).
  if (!isDeposit && isAll && receiptBal > 0n) amountRaw = receiptBal;
  const amountNum = Number.isFinite(Number(amountStr.replace(',', '.'))) ? Number(amountStr.replace(',', '.')) : 0;
  const insufficient = amountRaw > available;
  // Sous-jacent ERC-20/SPL : il faut du natif pour le gas.
  const noGas = !isNative(tokenIn) && gasBal === 0n;
  // Dépôt natif : montant + réserve (frais, rent ATA) doivent tenir dans le solde.
  const reserveShort = isDeposit && isNative(tokenIn) && amountRaw > 0n && !insufficient && amountRaw + reserve > available;
  // Solde DISPONIBLE (après réserve) : base des raccourcis 25/50/MAX.
  const depositable = isDeposit && isNative(tokenIn) ? (available > reserve ? available - reserve : 0n) : available;
  const belowGasMin = isDeposit && isNative(tokenIn) && available > 0n && available < reserve;
  const canPreview = amountRaw > 0n && !parseError && !insufficient && !noGas && !reserveShort && !quoting;

  const setPercent = async (n: number) => {
    haptic.selection();
    setError(null);
    if (available <= 0n) return;
    if (n === 100) {
      if (isDeposit) {
        setMaxing(true);
        try {
          const m = await maxDeposit(p, acct, underlyingBal);
          setAmountStr(formatInputAmount(m, tokenIn.decimals));
        } finally {
          setMaxing(false);
        }
        setIsAll(false);
      } else {
        setAmountStr(formatInputAmount(receiptBal, tokenIn.decimals));
        setIsAll(true);
      }
      return;
    }
    setIsAll(false);
    setAmountStr(formatInputAmount(pct(depositable, n), tokenIn.decimals));
  };

  const preview = async () => {
    if (!canPreview) return;
    haptic.light();
    setQuoting(true);
    setError(null);
    try {
      const res = await earnQuote(p, action, amountRaw, acct, { all: !isDeposit && isAll });
      setQ(res);
      setStep('quote');
    } catch (e) {
      setError(friendlyTxError(e, t));
    } finally {
      setQuoting(false);
    }
  };

  // Pas de hook ici (un `return null` précède) : fonction simple.
  const perform = async (unlock: Unlock) => {
      if (!q) throw new Error(t("earnMissingQuote"));
      setStatus('sending');
      try {
        const r = await earnExecute(q, unlock, setStatus);
        setSuccess(r);
        haptic.medium();
        notifyAndLog(
          'tx',
          isDeposit ? t('earnSuccessDeposit') : t('earnSuccessWithdraw'),
          `${fmt(q.amountIn, q.tokenIn.decimals)} ${q.tokenIn.symbol} · ${p.name}`,
        );
      } catch (e) {
        setStatus(null);
        // WRONG_PIN et refus/absence de biométrie : ConfirmUnlock les gère
        // lui-même (réessai PIN, repli silencieux) → on relaie tels quels.
        if (isWalletError(e) && e.code === 'WRONG_PIN') throw e;
        if (e instanceof Error && /biométri|Biométrie/.test(e.message)) throw e;
        throw new Error(friendlyTxError(e, t));
      }
  };

  const onUnlockDone = () => {
    setUnlockVisible(false);
    onSuccess?.();
  };

  const closeAll = () => {
    setSuccess(null);
    onClose();
  };

  // ── Aperçu : lignes du devis ──
  const outStr = q ? fmt(q.amountOut, q.tokenOut.decimals) : '0';
  const outNum = q ? Number(formatAmount(q.amountOut, q.tokenOut.decimals)) : 0;
  const gasNum = q ? Number(formatAmount(q.gasNative, chain.nativeDecimals)) : 0; // formatAmount : jamais « <0.0… » → jamais NaN
  const gasFiat = q ? (q.gasUsd > 0 && gasPrice === 0 ? q.gasUsd : gasNum * gasPrice) : 0;
  const inFiat = amountNum * priceIn;
  const highFee = q && gasFiat > 0 && inFiat > 0 && gasFiat / inFiat > 0.05;
  // Dépôt natif : montant + gas estimé doivent tenir dans le solde.
  const gasShort = !!q && isDeposit && isNative(tokenIn) && q.gasNative > 0n && q.amountIn + q.gasNative > underlyingBal;
  const yearlyUnderlying = apy && isDeposit ? amountNum * (apy / 100) : 0;
  const yearlyFiat = yearlyUnderlying * priceIn;
  // Earn = 0 % Kalyx, toujours. `feeUsd` ne contient que les frais éventuels de la route LI.FI elle-même.
  const kalyxFeeLabel = t('earnFree');

  const Row = ({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'muted' }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(0.75) }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: tone === 'up' ? colors.up : tone === 'muted' ? colors.textMuted : colors.text, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  return (
    <>
      <Modal visible={visible && !unlockVisible && !success} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
        {/* Le KAV enveloppe TOUT (fond + feuille) : dans un Modal Android, le clavier
            ne redimensionne pas la fenêtre → 'height' réduit le KAV de la hauteur du
            clavier, le fond (flex: 1) se comprime et la feuille reste au-dessus. */}
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
          {/* Feuille : colonne bornée (maxHeight) ; en-tête fixe + contenu défilable
              (flexShrink) → le bouton principal n'est jamais rogné. */}
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing(2.5), paddingTop: spacing(2), paddingBottom: Math.max(insets.bottom, 16) + 12, maxHeight: '85%', flexShrink: 1 }}>
            {/* Poignée */}
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.cardBorder, marginBottom: spacing(2) }} />

            {/* En-tête */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginBottom: spacing(2.5) }}>
              <RemoteIcon uri={p.logo} label={p.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={typography.section} numberOfLines={1}>
                  {isDeposit ? (p.kind === 'staking' ? t('earnStake') : t('earnDeposit')) : p.kind === 'staking' ? t('earnUnstake') : t('earnWithdraw')} · {p.name}
                </Text>
                <Text style={typography.muted} numberOfLines={1}>
                  {chain.name} · {p.kind === 'staking' ? t('earnStakingKind') : t('earnLendingKind')}
                  {apy !== null ? ` · ${formatPercent(apy)} ${t('earnApy')}` : ''}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Icon name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
              {step === 'input' ? (
                <>
                  {/* Saisie */}
                  <View style={{ backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radii.lg, padding: spacing(2) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        ref={inputRef}
                        style={{ flex: 1, fontSize: 34, fontFamily: fonts.bold, color: parseError || insufficient ? colors.danger : colors.text, padding: 0, fontVariant: ['tabular-nums'] }}
                        placeholder="0"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="decimal-pad"
                        value={maxing ? '…' : amountStr}
                        editable={!maxing}
                        onChangeText={(v) => {
                          setAmountStr(v.replace(',', '.').replace(/[^0-9.]/g, ''));
                          setIsAll(false);
                          setError(null);
                        }}
                      />
                      <Text style={{ fontSize: 20, fontFamily: fonts.semibold, color: colors.textMuted, marginLeft: spacing(1) }}>{tokenIn.symbol}</Text>
                    </View>
                    <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>
                      {priceIn > 0 && amountNum > 0 ? `≈ ${money(inFiat)} ${fiatSymbol(fiat)}` : ' '}
                    </Text>
                  </View>

                  {/* Disponible + raccourcis */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1.5) }}>
                    <Text style={typography.muted} numberOfLines={1}>
                      {t('earnAvailable')} : <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{fmt(available, tokenIn.decimals)} {tokenIn.symbol}</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing(0.75) }}>
                      {[25, 50, 100].map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setPercent(n)}
                          disabled={depositable <= 0n || maxing}
                          style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: n === 100 ? colors.accent : colors.glassStrong, opacity: pressed ? 0.7 : depositable <= 0n ? 0.4 : 1 })}
                        >
                          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: n === 100 ? colors.onPrimary : colors.text }}>{n === 100 ? t('earnMax') : `${n}%`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Messages */}
                  <View style={{ marginTop: spacing(2), gap: spacing(1) }}>
                    {insufficient ? <ErrorBox message={t('earnInsufficient')} /> : null}
                    {belowGasMin ? (
                      <ErrorBox message={t('errGasBelowMinimum').replace('{amount}', `${fmt(reserve, tokenIn.decimals)} ${tokenIn.symbol}`)} />
                    ) : reserveShort ? (
                      <ErrorBox message={t('errAboveAvailable').replace('{amount}', `${fmt(reserve, tokenIn.decimals)} ${tokenIn.symbol}`)} />
                    ) : null}
                    {noGas ? <ErrorBox tone="warning" message={t('earnLowGas').replace('{symbol}', chain.nativeSymbol)} /> : null}
                    {error ? <ErrorBox message={error} /> : null}
                  </View>

                  {/* Info rendement */}
                  {isDeposit && apy !== null && amountNum > 0 && !insufficient ? (
                    <View style={{ marginTop: spacing(2), flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={typography.muted}>{t('earnYearly')}</Text>
                      <Text style={{ color: colors.up, fontFamily: fonts.semibold }}>
                        +{formatNumber(yearlyUnderlying)} {tokenIn.symbol}
                        {priceIn > 0 ? ` (≈ ${money(yearlyFiat)} ${fiatSymbol(fiat)})` : ''}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ marginTop: spacing(3) }}>
                    <Button label={t('earnPreview')} onPress={preview} loading={quoting} disabled={!canPreview} />
                  </View>
                </>
              ) : q ? (
                <>
                  {/* Aperçu du devis */}
                  <View style={{ backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radii.lg, padding: spacing(2) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={typography.muted}>{isDeposit ? t('earnDeposit') : t('earnWithdraw')}</Text>
                        <Text style={typography.display}>{fmt(q.amountIn, q.tokenIn.decimals)} <Text style={{ fontSize: 20, color: colors.textMuted }}>{q.tokenIn.symbol}</Text></Text>
                      </View>
                      <Icon name="forward" size={22} color={colors.textFaint} />
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={typography.muted}>{t('earnYouReceive')}</Text>
                        <Text style={[typography.section, { color: colors.up }]}>{outStr} {q.tokenOut.symbol}</Text>
                        {priceOut > 0 ? <Text style={typography.muted}>≈ {money(outNum * priceOut)} {fiatSymbol(fiat)}</Text> : null}
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: spacing(2), paddingHorizontal: spacing(0.5) }}>
                    {apy !== null ? <Row label={t('earnApy')} value={formatPercent(apy)} tone="up" /> : null}
                    {isDeposit && yearlyUnderlying > 0 ? (
                      <Row label={t('earnYearly')} value={`+${formatNumber(yearlyUnderlying)} ${tokenIn.symbol}${priceIn > 0 ? ` (≈ ${money(yearlyFiat)} ${fiatSymbol(fiat)})` : ''}`} tone="up" />
                    ) : null}
                    <Row label={t('earnRoute')} value={q.routeLabel} />
                    <Row
                      label={t('networkFee')}
                      value={q.gasNative > 0n ? `~${formatTokenAmount(q.gasNative, chain.nativeDecimals)} ${chain.nativeSymbol}${gasFiat > 0 ? ` (≈ ${money(gasFiat)} ${fiatSymbol(fiat)})` : ''}` : t('earnGasEstimatedLater')}
                      tone="muted"
                    />
                    <Row label={t('earnKalyxFee')} value={kalyxFeeLabel} tone="up" />
                    {q.feeUsd > 0 ? <Row label={t('earnRouteFee')} value={`≈ ${q.feeUsd.toFixed(2)} $`} tone="muted" /> : null}
                  </View>

                  {p.withdrawNote ? (
                    <View style={{ marginTop: spacing(1.5), flexDirection: 'row', gap: spacing(1), alignItems: 'flex-start' }}>
                      <Icon name="info" size={16} color={colors.textFaint} />
                      <Text style={[typography.muted, { flex: 1, fontSize: 13 }]}>{p.withdrawNote}</Text>
                    </View>
                  ) : null}
                  {gasShort ? <View style={{ marginTop: spacing(1.5) }}><ErrorBox message={t('earnLowGas').replace('{symbol}', chain.nativeSymbol)} /></View> : null}
                  {highFee ? <View style={{ marginTop: spacing(1.5) }}><ErrorBox tone="warning" message={t('earnHighFee')} /></View> : null}
                  {error ? <View style={{ marginTop: spacing(1.5) }}><ErrorBox message={error} /></View> : null}

                  <View style={{ marginTop: spacing(3), gap: spacing(1.5) }}>
                    <Button label={isDeposit ? t('earnConfirmDeposit') : t('earnConfirmWithdraw')} disabled={gasShort} onPress={() => { haptic.medium(); setUnlockVisible(true); }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing(3) }}>
                      <Pressable onPress={() => { setStep('input'); setQ(null); setError(null); }} hitSlop={8}>
                        <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold }}>{t('earnEditAmount')}</Text>
                      </Pressable>
                      <Pressable onPress={preview} hitSlop={8} disabled={quoting}>
                        {quoting ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('earnRefreshQuote')}</Text>}
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmUnlock
        visible={unlockVisible}
        title={isDeposit ? `${p.kind === 'staking' ? t('earnStake') : t('earnDeposit')} · ${p.name}` : `${p.kind === 'staking' ? t('earnUnstake') : t('earnWithdraw')} · ${p.name}`}
        subtitle={q ? `${fmt(q.amountIn, q.tokenIn.decimals)} ${q.tokenIn.symbol} → ~${outStr} ${q.tokenOut.symbol} · ${chain.name}` : undefined}
        statusText={status ? (q?.approvalAddress ? `${status === 'approving' || status === 'approvalWait' ? '1/2' : '2/2'} · ` : '') + t(STATUS_KEY[status]) : null}
        perform={perform}
        onDone={onUnlockDone}
        onCancel={() => { setUnlockVisible(false); setStatus(null); }}
        aiContext={q && q.tx.type === 'evm' ? { to: q.tx.to, value: fmt(q.amountIn, q.tokenIn.decimals), method: isDeposit ? 'earn_deposit' : 'earn_withdraw' } : undefined}
      />

      <SuccessModal
        visible={!!success}
        title={isDeposit ? t('earnSuccessDeposit') : t('earnSuccessWithdraw')}
        message={isDeposit ? t('earnSuccessDepositBody').replace('{symbol}', tokenIn.symbol) : t('earnSuccessWithdrawBody')}
        hash={success?.hash}
        explorerUrl={success?.explorerUrl}
        onClose={closeAll}
      />
    </>
  );
}
