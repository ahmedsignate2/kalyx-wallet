import React, { useEffect, useState } from 'react';
import { View, ScrollView, Linking, Alert, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScreenHeader, Text, Button, Surface, ListRow, AddressGlyph, Skeleton, Divider, Sheet } from '../ui/kit';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { spacing, fonts, useTheme } from '../ui/theme';
import { useT, fiatSymbol, useSettings } from '../lib/settingsStore';
import {
  getAdapter,
  formatTokenAmount,
  formatAmount,
  formatFiat,
  shortAddress,
  buildExplorerTxUrl,
  EvmChainAdapter,
  calculateReplacementGas,
  buildSpeedUpTx,
  buildCancelTx,
  fetchOriginalEvmTx,
  getPrices,
  type CalculatedReplacementGas,
  type RawTxRequest,
} from '../src';
import { useWallet, type Unlock } from '../lib/walletStore';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';

export default function TrackingScreen() {
  const { hash, chainId } = useLocalSearchParams<{ hash: string; chainId: string }>();
  const [activeHash, setActiveHash] = useState(hash);
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const sendRawTxOn = useWallet((s) => s.sendRawTxOn);

  const chain = chainId ? getAdapter(chainId).config : null;

  const [loading, setLoading] = useState(true);
  const [txDetails, setTxDetails] = useState<any>(null);
  const [timeElapsed, setTimeElapsed] = useState('');
  const [nativePrice, setNativePrice] = useState(0);

  // Speed Up / Cancel states
  const [replacementAction, setReplacementAction] = useState<'speedUp' | 'cancel' | null>(null);
  const [replacementSheetVisible, setReplacementSheetVisible] = useState(false);
  const [calculatingGas, setCalculatingGas] = useState(false);
  const [replacementGas, setReplacementGas] = useState<CalculatedReplacementGas | null>(null);
  const [preparedTx, setPreparedTx] = useState<RawTxRequest | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchTx = async () => {
    if (!chain || !activeHash) return;
    setLoading(true);
    try {
      const adapter = getAdapter(chain.id);
      const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
      const address =
        chain.family === 'bitcoin'
          ? stored?.btcAddress
          : chain.family === 'solana'
            ? stored?.solAddress
            : stored?.evmAddress;

      if (chain.coingeckoId) {
        getPrices([chain.coingeckoId], fiat)
          .then((p) => setNativePrice(p[chain.coingeckoId!]?.price ?? 0))
          .catch(() => {});
      }

      if (address) {
        const history = await adapter.getHistory(address).catch(() => []);
        let tx = history.find((t) => t.hash.toLowerCase() === activeHash.toLowerCase());

        if (adapter instanceof EvmChainAdapter) {
          const rpcTx = await adapter.getTransaction(activeHash).catch(() => null);
          if (rpcTx) {
            if (!tx) {
              tx = {
                hash: rpcTx.hash,
                from: rpcTx.from,
                to: rpcTx.to ?? '',
                value: rpcTx.value,
                timestamp: Math.floor(Date.now() / 1000),
                direction: 'out',
                status: rpcTx.blockNumber != null ? 'success' : 'pending',
                asset: chain.nativeSymbol,
                decimals: chain.nativeDecimals,
              };
            } else if (rpcTx.blockNumber != null && tx.status === 'pending') {
              tx = { ...tx, status: 'success' };
            }
          }
        }

        if (tx) {
          setTxDetails(tx);
          const diffMin = Math.floor((Date.now() - tx.timestamp * 1000) / 60000);
          setTimeElapsed(diffMin > 0 ? t('agoMinutes').replace('{min}', String(diffMin)) : t('justNow'));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch tx details for tracking', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTx();
    // Refresh toutes les 15 secondes
    const interval = setInterval(fetchTx, 15000);
    return () => clearInterval(interval);
  }, [chain?.id, activeHash, activeAccountIndex]);

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

      const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
      const walletAddress = stored?.evmAddress ?? '';

      // 1. Récupération des données originales de la transaction
      const orig = await fetchOriginalEvmTx(adapter, activeHash, {
        hash: activeHash,
        from: walletAddress,
        to: txDetails?.to ?? walletAddress,
        value: txDetails?.value ?? 0n,
        chainId: chain.evmChainId ?? 1,
      });

      if (!orig) {
        toast.error(t('replacementError'));
        setReplacementSheetVisible(false);
        return;
      }

      // 2. Récupération des frais réseau actuels
      const feeData = await adapter.getFeeData().catch(() => null);
      const currentNetworkFee = {
        maxFeePerGas: feeData?.maxFeePerGas,
        maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas,
        gasPrice: feeData?.gasPrice,
      };

      // 3. Calcul du nouveau gas (+20% minimum par rapport à l'original)
      const gasLimit = action === 'cancel' ? 21000n : orig.gasLimit;
      const gas = calculateReplacementGas(orig, currentNetworkFee, gasLimit);
      setReplacementGas(gas);

      // 4. Construction de la requête de remplacement (même nonce)
      const req =
        action === 'speedUp'
          ? buildSpeedUpTx(orig, gas)
          : buildCancelTx(orig, walletAddress, gas);
      setPreparedTx(req);
    } catch (err) {
      console.warn('Error preparing replacement', err);
      toast.error(t('replacementError'));
      setReplacementSheetVisible(false);
    } finally {
      setCalculatingGas(false);
    }
  };

  const handleOpenExplorer = async () => {
    if (!activeHash) {
      Alert.alert(t('errorTitle'), t('errTxHashMissing'));
      return;
    }

    haptic.selection();

    let explorerUrl = '';
    const networkKey = chainId || chain?.id;

    // Détection propre selon le réseau
    switch (networkKey?.toLowerCase()) {
      case 'solana':
      case 'solana-mainnet':
        explorerUrl = `https://solscan.io/tx/${activeHash}`;
        break;
      case 'solana-devnet':
        explorerUrl = `https://solscan.io/tx/${activeHash}?cluster=devnet`;
        break;
      case 'sepolia':
        explorerUrl = `https://sepolia.etherscan.io/tx/${activeHash}`;
        break;
      case 'ethereum':
      case 'mainnet':
        explorerUrl = `https://etherscan.io/tx/${activeHash}`;
        break;
      case 'bitcoin':
        explorerUrl = `https://mempool.space/tx/${activeHash}`;
        break;
      default:
        if (chain?.explorerUrl) {
          explorerUrl = buildExplorerTxUrl(chain.explorerUrl, activeHash);
        } else {
          explorerUrl = `https://solscan.io/tx/${activeHash}`;
        }
    }

    if (!explorerUrl.startsWith('https://') && !explorerUrl.startsWith('http://')) {
      explorerUrl = `https://${explorerUrl}`;
    }

    try {
      const supported = await Linking.canOpenURL(explorerUrl);
      if (supported) {
        await Linking.openURL(explorerUrl);
      } else {
        await Linking.openURL(explorerUrl);
      }
    } catch (error) {
      console.error('Erreur ouverture explorateur:', error);
      try {
        await Linking.openURL(explorerUrl);
      } catch {
        Alert.alert(t('errorTitle'), t('errCannotOpenBrowser'));
      }
    }
  };

  const isBtc = chain?.family === 'bitcoin';
  const status = txDetails?.status || 'pending';
  const confirmed = status !== 'pending' && status !== 'failed';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <ScreenHeader title={t('txTrackingTitle')} />

        <View style={{ gap: spacing(2) }}>
          <GlassCard style={{ alignItems: 'center', paddingVertical: spacing(3) }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: confirmed ? colors.up : colors.surface1,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing(1),
              }}
            >
              <Icon
                name={confirmed ? 'checkmark' : 'clock'}
                size={32}
                color={confirmed ? colors.bg : colors.text}
              />
            </View>
            <Text style={[typography.title, { color: confirmed ? colors.up : colors.text }]}>
              {confirmed ? t('txConfirmed') : t('txPending')}
            </Text>
            <Text style={typography.muted}>{confirmed ? t('includedInBlock') : timeElapsed}</Text>

            {loading && !txDetails ? (
              <View style={{ marginTop: spacing(2), alignItems: 'center', gap: 8 }}>
                <Skeleton width={120} height={28} />
                <Skeleton width={180} height={16} />
              </View>
            ) : txDetails ? (
              <View style={{ marginTop: spacing(2), alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 28,
                    fontFamily: fonts.bold,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTokenAmount(txDetails.value, txDetails.decimals ?? chain!.nativeDecimals)}{' '}
                  {txDetails.asset ?? chain!.nativeSymbol}
                </Text>
                {txDetails.to ? (
                  <Text style={[typography.muted, { marginTop: 4 }]}>
                    {t('towards')} {shortAddress(txDetails.to)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </GlassCard>

          {isBtc && !confirmed ? (
            <GlassCard>
              <Text style={typography.section}>{t('mempoolProgress')}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginVertical: spacing(1),
                }}
              >
                <Text style={typography.bodyStrong}>0 / 1 confirmation</Text>
                <Text style={typography.muted}>{t('estTimeRange')}</Text>
              </View>
              <View
                style={{
                  height: 4,
                  backgroundColor: colors.border,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{ width: '25%', height: '100%', backgroundColor: colors.primary, borderRadius: 2 }}
                />
              </View>
            </GlassCard>
          ) : null}

          <GlassCard>
            <Text style={typography.section}>{t('networkDetails')}</Text>

            <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.muted}>{t('labelNetwork')}</Text>
                <Text style={typography.bodyStrong}>{chain?.name}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.muted}>{t('labelNetworkFee')}</Text>
                <Text style={typography.bodyStrong}>~</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.muted}>TXID</Text>
                <Text style={[typography.bodyStrong, { fontVariant: ['tabular-nums'] }]} selectable>
                  {activeHash ? shortAddress(activeHash) : '...'}
                </Text>
              </View>
            </View>
          </GlassCard>

          <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
            {chain?.family === 'evm' && !confirmed ? (
              <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
                <Button
                  label={t('speedUpButton')}
                  variant="primary"
                  style={{ flex: 1 }}
                  onPress={() => handleOpenAction('speedUp')}
                />
                <Button
                  label={t('cancelButton')}
                  variant="destructive"
                  style={{ flex: 1 }}
                  onPress={() => handleOpenAction('cancel')}
                />
              </View>
            ) : null}

            <Button
              label={t('refresh')}
              variant={confirmed ? 'primary' : 'secondary'}
              onPress={() => {
                haptic.selection();
                fetchTx();
              }}
              loading={loading}
            />

            {activeHash ? (
              <Button label={t('viewOnExplorer')} variant="secondary" onPress={handleOpenExplorer} />
            ) : null}
          </View>
        </View>
      </PremiumScreen>

      {/* Modale Bottom Sheet de confirmation pour Speed Up / Cancel */}
      <Sheet
        visible={replacementSheetVisible && !confirming}
        onClose={() => setReplacementSheetVisible(false)}
      >
        <Text variant="title2">
          {replacementAction === 'speedUp' ? t('speedUpConfirmTitle') : t('cancelConfirmTitle')}
        </Text>
        <Text variant="caption" tone="secondary">
          {replacementAction === 'speedUp' ? t('speedUpDescription') : t('cancelDescription')}
        </Text>

        {calculatingGas ? (
          <View style={{ padding: spacing(3), alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : replacementGas && preparedTx ? (
          <Surface padded={false}>
            <ListRow
              title={t('nonceLabel')}
              right={<Text variant="body" tabular>#{preparedTx.nonce}</Text>}
            />
            <Divider inset={16} />
            <ListRow
              title={t('labelNetworkFee')}
              subtitle={
                replacementGas.isEip1559
                  ? `Max: ${formatAmount(replacementGas.maxFeePerGas!, 9)} Gwei`
                  : `${formatAmount(replacementGas.gasPrice!, 9)} Gwei`
              }
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="body" tabular>
                    {formatTokenAmount(replacementGas.totalCostWei, chain!.nativeDecimals)}{' '}
                    {chain!.nativeSymbol}
                  </Text>
                  {nativePrice > 0 ? (
                    <Text variant="caption" tone="secondary" tabular>
                      ≈{' '}
                      {formatFiat(
                        Number(formatAmount(replacementGas.totalCostWei, chain!.nativeDecimals)) *
                          nativePrice
                      )}{' '}
                      {fiatSymbol(fiat)}
                    </Text>
                  ) : null}
                </View>
              }
            />
            <Divider inset={16} />
            <ListRow
              title={t('estimatedExtraFee')}
              right={
                <Text variant="caption" tone="warning" tabular>
                  +{formatTokenAmount(replacementGas.extraCostWei, chain!.nativeDecimals)}{' '}
                  {chain!.nativeSymbol}
                </Text>
              }
            />
          </Surface>
        ) : null}

        <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
          <Button
            label={replacementAction === 'speedUp' ? t('speedUpButton') : t('cancelButton')}
            variant={replacementAction === 'speedUp' ? 'primary' : 'destructive'}
            onPress={() => setConfirming(true)}
            disabled={calculatingGas || !preparedTx}
          />
          <Button
            label={t('cancel')}
            variant="ghost"
            onPress={() => setReplacementSheetVisible(false)}
          />
        </View>
      </Sheet>

      {/* Confirmation sécurisée par Biométrie / PIN */}
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
            setActiveHash(newHash);
            setConfirming(false);
            setReplacementSheetVisible(false);
            fetchTx();
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
    </>
  );
}
