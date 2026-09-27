/**
 * Suivi d'une transaction — refait.
 *
 * Défauts de l'ancien écran, relevés en usage :
 *   - un bouton « Actualiser » en état de chargement permanent (le « point »
 *     entre Annuler et l'explorateur) : il relisait TOUT l'historique du réseau
 *     toutes les 15 s, même une fois la transaction confirmée ;
 *   - les frais affichés « ~ », écrits en dur ;
 *   - des squelettes gris qui ne se remplissaient jamais quand la transaction
 *     n'était pas trouvée, et une barre de progression Bitcoin inventée (25 %) ;
 *   - deux cartes mal proportionnées.
 *
 * Maintenant : l'historique en cache s'affiche tout de suite ; le reçu EVM donne
 * le statut et les frais RÉELS ; on ne relit le réseau que tant que la
 * transaction est en attente ; et les actions dépendent de l'état — accélérer
 * ou annuler en attente, « Terminé » une fois le sort fixé.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming, cancelAnimation } from 'react-native-reanimated';
import { ScreenHeader, Text, Button, Surface, ListRow, Divider, Sheet, TokenIcon, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radius, SCREEN_MARGIN, springs } from '../ui/tokens';
import { useT, useActivityT, fiatSymbol, useSettings } from '../lib/settingsStore';
import { useReduceMotion } from '../lib/reduceMotion';
import {
  getAdapter,
  formatTokenAmount,
  formatAmount,
  formatFiat,
  shortAddress,
  buildExplorerTxUrl,
  chainIconUrl,
  nativeOfChain,
  humanizeTx,
  EvmChainAdapter,
  calculateReplacementGas,
  buildSpeedUpTx,
  buildCancelTx,
  fetchOriginalEvmTx,
  findAdapterV2,
  getPrices,
  type CalculatedReplacementGas,
  type RawTxRequest,
  type TxSummary,
} from '../src';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useHistoryStore, useHistoryCache, cacheKey } from '../lib/historyStore';
import { usePortfolioStore } from '../lib/portfolio';
import { addressForChain } from '../lib/accountAddress';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';

type Status = 'searching' | 'pending' | 'success' | 'failed';

/** Pastille d'état animée : anneau qui tourne, puis coche ou croix qui éclot. */
function StatusBadge({ status }: { status: Status }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const spin = useSharedValue(0);
  const pop = useSharedValue(status === 'success' || status === 'failed' ? 1 : 0);
  const waiting = status === 'searching' || status === 'pending';
  useEffect(() => {
    if (waiting && !reduce) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1);
    } else cancelAnimation(spin);
    if (!waiting) pop.value = reduce ? 1 : withSpring(1, springs.bouncy);
    else pop.value = 0;
  }, [waiting, reduce, spin, pop]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const mark = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.4 + 0.6 * pop.value }] }));
  const tint = status === 'success' ? colors.up : status === 'failed' ? colors.danger : colors.textSecondary;
  return (
    <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      {waiting ? (
        <>
          <View style={{ position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.surface3 }} />
          <Reanimated.View style={[{ position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: 'transparent', borderTopColor: colors.text }, ring]} />
          <Icon name="clock" size={26} color={colors.textSecondary} />
        </>
      ) : (
        <Reanimated.View style={[{ width: 72, height: 72, borderRadius: 36, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }, mark]}>
          <Icon name={status === 'success' ? 'checkmark' : 'close'} size={34} color={colors.bg} />
        </Reanimated.View>
      )}
    </View>
  );
}

export default function TrackingScreen() {
  const { hash, chainId } = useLocalSearchParams<{ hash: string; chainId: string }>();
  const [activeHash, setActiveHash] = useState(hash);
  const t = useT();
  const activityT = useActivityT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fiat = useSettings((s) => s.fiat);
  const language = useSettings((s) => s.language);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const sendRawTxOn = useWallet((s) => s.sendRawTxOn);
  const holdings = usePortfolioStore((s) => s.holdings);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const cache = useHistoryCache();

  const chain = useMemo(() => {
    try {
      return chainId ? getAdapter(chainId).config : null;
    } catch {
      return null;
    }
  }, [chainId]);
  const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
  const owner = chain ? addressForChain(stored, chain) : '';

  /*
   * La transaction : d'abord le CACHE d'historique (instantané), complété par
   * le reçu EVM. TON : juste après un envoi, le hachage connu est celui du
   * MESSAGE — on accepte les deux.
   */
  const [tonTxHash, setTonTxHash] = useState<string | null>(null);
  const cachedTx = useMemo(() => {
    if (!chain || !owner || !activeHash) return undefined;
    const wanted = activeHash.toLowerCase();
    const list = cache[cacheKey(chain.id, owner)] ?? [];
    return list.find((x) => x.hash.toLowerCase() === wanted || x.messageHash?.toLowerCase() === wanted || (tonTxHash && x.hash.toLowerCase() === tonTxHash.toLowerCase()));
  }, [cache, chain, owner, activeHash, tonTxHash]);
  const [rpcTx, setRpcTx] = useState<TxSummary | null>(null);
  const [receipt, setReceipt] = useState<{ status: 'success' | 'failed'; fee: bigint; timestamp?: number } | null>(null);
  const [checked, setChecked] = useState(false);
  const tx: TxSummary | undefined = cachedTx ?? rpcTx ?? undefined;

  const status: Status = receipt ? receipt.status : tx ? (tx.status === 'pending' ? 'pending' : tx.status) : checked ? 'pending' : 'searching';
  const final = status === 'success' || status === 'failed';

  const poll = useCallback(async () => {
    if (!chain || !activeHash || !owner) return;
    const adapter = getAdapter(chain.id);
    if (adapter instanceof EvmChainAdapter) {
      const [r, raw] = await Promise.all([adapter.getReceiptInfo(activeHash).catch(() => null), rpcTx ? Promise.resolve(null) : adapter.getTransaction(activeHash).catch(() => null)]);
      if (raw) {
        setRpcTx({ chain: chain.id, hash: raw.hash, from: raw.from, to: raw.to ?? '', value: raw.value, timestamp: Math.floor(Date.now() / 1000), direction: 'out', status: 'pending' });
      }
      if (r) {
        setReceipt(r);
        // Le cache d'historique apprend la nouvelle au passage.
        void fetchHistory(chain.id, owner, { force: true }).catch(() => {});
      }
    } else {
      if (chain.family === 'ton' && !tonTxHash) {
        const v2 = findAdapterV2(chain.id) as unknown as { transactionHashForMessage?: (h: string) => Promise<string | null> } | null;
        const found = await v2?.transactionHashForMessage?.(activeHash).catch(() => null);
        if (found) setTonTxHash(found);
      }
      await fetchHistory(chain.id, owner, { force: true }).catch(() => {});
    }
    setChecked(true);
  }, [chain, activeHash, owner, rpcTx, tonTxHash, fetchHistory]);

  // On ne relit le réseau QUE tant que le sort n'est pas fixé.
  const finalRef = useRef(final);
  finalRef.current = final;
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    void pollRef.current();
    const id = setInterval(() => {
      if (!finalRef.current) void pollRef.current();
    }, 12_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain?.id, activeHash]);
  // Retour haptique au DÉNOUEMENT vu en direct, pas à l'ouverture d'une transaction déjà réglée.
  const prevStatus = useRef<Status>(status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (was !== 'pending' && was !== 'searching') return;
    if (status === 'success') haptic.success();
    else if (status === 'failed') haptic.error();
  }, [status]);

  // Prix : natif (réseau) et tokens vérifiés du portefeuille.
  const [nativePrice, setNativePrice] = useState(0);
  useEffect(() => {
    if (!chain?.coingeckoId) return;
    getPrices([chain.coingeckoId], fiat)
      .then((p) => setNativePrice(p[chain.coingeckoId!]?.price ?? 0))
      .catch(() => {});
  }, [chain?.coingeckoId, fiat]);
  const sym = fiatSymbol(fiat);
  const fiatOf = useCallback(
    (symbol: string, amount: number) => {
      const p = chain && symbol.toUpperCase() === chain.nativeSymbol.toUpperCase() ? nativePrice : holdings.find((h) => h.verified && h.symbol.toUpperCase() === symbol.toUpperCase())?.price ?? 0;
      return p > 0 ? `≈ ${formatFiat(amount * p)} ${sym}` : undefined;
    },
    [chain, nativePrice, holdings, sym],
  );
  const h = useMemo(
    () => (tx && chain ? humanizeTx({ ...tx, status: status === 'failed' ? 'failed' : tx.status }, { t: activityT, nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals, nativeOf: nativeOfChain, fiatOf }) : null),
    [tx, chain, activityT, fiatOf, status],
  );
  const logo = tx ? holdings.find((x) => x.chainId === tx.chain && (tx.contract ? x.contract?.toLowerCase() === tx.contract.toLowerCase() : x.kind === 'native'))?.logo : undefined;

  const counterparty = tx ? (tx.direction === 'in' ? tx.from : tx.to) : '';
  const when = receipt?.timestamp ?? (tx && tx.timestamp > 0 ? tx.timestamp : undefined);
  const copy = async (text: string, message: string) => {
    await Clipboard.setStringAsync(text);
    haptic.light();
    toast.success(message);
  };

  const explorerUrl = (() => {
    if (!activeHash || !chain) return null;
    if (chain.id === 'bitcoin') return `https://mempool.space/tx/${activeHash}`;
    if (chain.id === 'solana') return `https://solscan.io/tx/${activeHash}`;
    if (chain.id === 'solana-devnet') return `https://solscan.io/tx/${activeHash}?cluster=devnet`;
    return chain.explorerUrl ? buildExplorerTxUrl(chain.explorerUrl, activeHash) : null;
  })();
  const openExplorer = () => {
    if (!explorerUrl) return;
    haptic.selection();
    Linking.openURL(explorerUrl).catch(() => toast.error(t('errCannotOpenBrowser')));
  };
  const done = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  /* ── Accélérer / annuler (EVM) ─────────────────────────────────────────── */
  const canReplace = (() => {
    if (!chain) return false;
    const a = findAdapterV2(chain.id);
    return !!a?.capabilities.accelerate && !!a?.capabilities.cancel;
  })();
  const [replacementAction, setReplacementAction] = useState<'speedUp' | 'cancel' | null>(null);
  const [replacementSheetVisible, setReplacementSheetVisible] = useState(false);
  const [calculatingGas, setCalculatingGas] = useState(false);
  const [replacementGas, setReplacementGas] = useState<CalculatedReplacementGas | null>(null);
  const [preparedTx, setPreparedTx] = useState<RawTxRequest | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleOpenAction = async (action: 'speedUp' | 'cancel') => {
    if (!chain || chain.family !== 'evm' || !activeHash) return;
    haptic.selection();
    setReplacementAction(action);
    setReplacementSheetVisible(true);
    setCalculatingGas(true);
    setReplacementGas(null);
    setPreparedTx(null);
    try {
      const adapter = getAdapter(chain.id);
      if (!(adapter instanceof EvmChainAdapter)) return;
      const walletAddress = stored?.evmAddress ?? '';
      const orig = await fetchOriginalEvmTx(adapter, activeHash, {
        hash: activeHash,
        from: walletAddress,
        to: tx?.to ?? walletAddress,
        value: tx?.value ?? 0n,
        chainId: chain.evmChainId ?? 1,
      });
      if (!orig) {
        toast.error(t('replacementError'));
        setReplacementSheetVisible(false);
        return;
      }
      const feeData = await adapter.getFeeData().catch(() => null);
      const gasLimit = action === 'cancel' ? 21000n : orig.gasLimit;
      const gas = calculateReplacementGas(orig, { maxFeePerGas: feeData?.maxFeePerGas, maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas, gasPrice: feeData?.gasPrice }, gasLimit);
      setReplacementGas(gas);
      setPreparedTx(action === 'speedUp' ? buildSpeedUpTx(orig, gas) : buildCancelTx(orig, walletAddress, gas));
    } catch (err) {
      console.warn('Error preparing replacement', err);
      toast.error(t('replacementError'));
      setReplacementSheetVisible(false);
    } finally {
      setCalculatingGas(false);
    }
  };

  const title = status === 'success' ? t('trkConfirmedTitle') : status === 'failed' ? t('trkFailedTitle') : status === 'searching' ? t('trkSearching') : t('trkPendingTitle');
  const fee = receipt ? `${formatTokenAmount(receipt.fee, chain?.nativeDecimals ?? 18)} ${chain?.nativeSymbol ?? ''}` : null;
  const feeFiat = receipt && nativePrice > 0 && chain ? `≈ ${formatFiat(Number(formatAmount(receipt.fee, chain.nativeDecimals)) * nativePrice)} ${sym}` : undefined;
  const locale = language === 'en' ? 'en-US' : language;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN }}>
        <ScreenHeader title={t('txTrackingTitle')} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5] }}>
        {/* 1. Statut et montant */}
        <View style={{ alignItems: 'center', gap: space[3], paddingTop: space[4] }}>
          <StatusBadge status={status} />
          <Text variant="title2" style={{ textAlign: 'center', color: status === 'success' ? colors.up : status === 'failed' ? colors.danger : colors.text }}>{title}</Text>
          {status === 'failed' ? <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{t('trkFailedBody')}</Text> : null}
          {h ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text variant="caption" tone="secondary">{h.label}</Text>
              {h.amount ? <Text style={{ fontSize: 30, lineHeight: 38, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{h.amount}</Text> : null}
              {h.amountAlt ? <Text variant="body" tone="secondary" tabular>{h.amountAlt}</Text> : null}
              {h.fiat ? <Text variant="caption" tone="tertiary" tabular>{h.fiat}</Text> : null}
            </View>
          ) : null}
        </View>

        {/* 2. Détails, une seule carte */}
        <Surface padded={false}>
          <ListRow
            title={t('labelNetwork')}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <TokenIcon symbol={chain?.name ?? '?'} logo={chain ? chainIconUrl(chain.id) : undefined} size={20} />
                <Text variant="body">{chain?.name ?? chainId}</Text>
              </View>
            }
          />
          {counterparty ? (
            <>
              <Divider inset={16} />
              <ListRow
                title={tx?.direction === 'in' ? t('labelFrom') : t('labelRecipient')}
                onPress={() => copy(counterparty, t('addressCopied'))}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <Text variant="body" tabular>{shortAddress(counterparty)}</Text>
                    <Icon name="copy" size={14} tone="muted" />
                  </View>
                }
              />
            </>
          ) : null}
          {chain?.family === 'evm' && tx?.direction !== 'in' ? (
            <>
              <Divider inset={16} />
              <ListRow
                title={t('labelNetworkFee')}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="body" tabular tone={fee ? undefined : 'tertiary'}>{fee ?? t('trkFeeLater')}</Text>
                    {feeFiat ? <Text variant="micro" tone="tertiary" tabular>{feeFiat}</Text> : null}
                  </View>
                }
              />
            </>
          ) : null}
          {when ? (
            <>
              <Divider inset={16} />
              <ListRow title={t('labelDate')} right={<Text variant="body">{new Date(when * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</Text>} />
            </>
          ) : null}
          {activeHash ? (
            <>
              <Divider inset={16} />
              <ListRow
                title="TXID"
                onPress={() => copy(activeHash, t('hashCopied'))}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <Text variant="body" tabular>{shortAddress(activeHash, 6, 4)}</Text>
                    <Icon name="copy" size={14} tone="muted" />
                  </View>
                }
              />
            </>
          ) : null}
        </Surface>

        {chain?.family === 'bitcoin' && !final ? <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{t('estTimeRange')}</Text> : null}

        {/* 3. Actions selon l'état */}
        <View style={{ gap: space[3] }}>
          {!final && canReplace && status === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <Button label={t('speedUpButton')} variant="primary" style={{ flex: 1 }} onPress={() => handleOpenAction('speedUp')} />
              <Button label={t('cancelButton')} variant="destructive" style={{ flex: 1 }} onPress={() => handleOpenAction('cancel')} />
            </View>
          ) : null}
          {final ? <Button label={t('done')} onPress={done} /> : null}
          {explorerUrl ? (
            <KPressable onPress={openExplorer} accessibilityRole="link" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space[1], paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.round }}>
              <Text variant="body" tone="secondary">{t('viewOnExplorer')}</Text>
              <Icon name="forward" size={14} tone="muted" />
            </KPressable>
          ) : null}
        </View>
      </ScrollView>

      {/* Accélérer / annuler : récapitulatif avant signature */}
      <Sheet visible={replacementSheetVisible && !confirming} onClose={() => setReplacementSheetVisible(false)}>
        <Text variant="title2">{replacementAction === 'speedUp' ? t('speedUpConfirmTitle') : t('cancelConfirmTitle')}</Text>
        <Text variant="caption" tone="secondary">{replacementAction === 'speedUp' ? t('speedUpDescription') : t('cancelDescription')}</Text>
        {calculatingGas ? (
          <View style={{ padding: space[5], alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        ) : replacementGas && preparedTx && chain ? (
          <Surface padded={false}>
            <ListRow title={t('nonceLabel')} right={<Text variant="body" tabular>#{preparedTx.nonce}</Text>} />
            <Divider inset={16} />
            <ListRow
              title={t('labelNetworkFee')}
              subtitle={replacementGas.isEip1559 ? `Max: ${formatAmount(replacementGas.maxFeePerGas!, 9)} Gwei` : `${formatAmount(replacementGas.gasPrice!, 9)} Gwei`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="body" tabular>{formatTokenAmount(replacementGas.totalCostWei, chain.nativeDecimals)} {chain.nativeSymbol}</Text>
                  {nativePrice > 0 ? <Text variant="caption" tone="secondary" tabular>≈ {formatFiat(Number(formatAmount(replacementGas.totalCostWei, chain.nativeDecimals)) * nativePrice)} {sym}</Text> : null}
                </View>
              }
            />
            <Divider inset={16} />
            <ListRow title={t('estimatedExtraFee')} right={<Text variant="caption" tone="warning" tabular>+{formatTokenAmount(replacementGas.extraCostWei, chain.nativeDecimals)} {chain.nativeSymbol}</Text>} />
          </Surface>
        ) : null}
        <View style={{ gap: space[3], marginTop: space[2] }}>
          <Button
            label={replacementAction === 'speedUp' ? t('speedUpButton') : t('cancelButton')}
            variant={replacementAction === 'speedUp' ? 'primary' : 'destructive'}
            onPress={() => setConfirming(true)}
            disabled={calculatingGas || !preparedTx}
          />
          <Button label={t('cancel')} variant="ghost" onPress={() => setReplacementSheetVisible(false)} />
        </View>
      </Sheet>

      <ConfirmUnlock
        visible={confirming}
        title={replacementAction === 'speedUp' ? t('speedUpConfirmTitle') : t('cancelConfirmTitle')}
        subtitle={chain?.name}
        perform={async (unlock: Unlock) => {
          if (!preparedTx || !chain) return;
          try {
            const newHash = await sendRawTxOn(unlock, chain.id, preparedTx);
            haptic.success();
            toast.success(t('replacementSuccess'));
            // Suivre la REMPLAÇANTE, depuis zéro.
            setRpcTx(null);
            setReceipt(null);
            setChecked(false);
            setActiveHash(newHash);
            setConfirming(false);
            setReplacementSheetVisible(false);
          } catch (e) {
            console.error('Replacement broadcast failed', e);
            toast.error(t('replacementError'));
            throw e;
          }
        }}
        onDone={() => {
          setConfirming(false);
          setReplacementSheetVisible(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
