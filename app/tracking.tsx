import React, { useEffect, useState } from 'react';
import { View, ScrollView, Linking, Alert } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScreenHeader, Text, Button, Surface, ListRow, AddressGlyph, Skeleton, Divider } from '../ui/kit';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { spacing, fonts, useTheme } from '../ui/theme';
import { useT, fiatSymbol, useSettings } from '../lib/settingsStore';
import { getAdapter, formatTokenAmount, formatFiat, shortAddress, buildExplorerTxUrl } from '../src';
import { useWallet } from '../lib/walletStore';
import { haptic } from '../lib/haptics';

export default function TrackingScreen() {
  const { hash, chainId } = useLocalSearchParams<{ hash: string; chainId: string }>();
  const t = useT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  
  const chain = chainId ? getAdapter(chainId).config : null;
  const explorerUrl = chain?.explorerUrl;
  
  const [loading, setLoading] = useState(true);
  const [txDetails, setTxDetails] = useState<any>(null);
  const [timeElapsed, setTimeElapsed] = useState('');

  const fetchTx = async () => {
    if (!chain || !hash) return;
    setLoading(true);
    try {
      const adapter = getAdapter(chain.id);
      const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
      const address = chain.family === 'bitcoin' ? stored?.btcAddress
        : chain.family === 'solana' ? stored?.solAddress
          : stored?.evmAddress;
          
      if (address) {
        const history = await adapter.getHistory(address);
        const tx = history.find(t => t.hash === hash);
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
  }, [chain?.id, hash, activeAccountIndex]);

  const handleOpenExplorer = async () => {
    if (!hash) {
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
        explorerUrl = `https://solscan.io/tx/${hash}`;
        break;
      case 'solana-devnet':
        explorerUrl = `https://solscan.io/tx/${hash}?cluster=devnet`;
        break;
      case 'sepolia':
        explorerUrl = `https://sepolia.etherscan.io/tx/${hash}`;
        break;
      case 'ethereum':
      case 'mainnet':
        explorerUrl = `https://etherscan.io/tx/${hash}`;
        break;
      case 'bitcoin':
        explorerUrl = `https://mempool.space/tx/${hash}`;
        break;
      default:
        if (chain?.explorerUrl) {
          explorerUrl = buildExplorerTxUrl(chain.explorerUrl, hash);
        } else {
          explorerUrl = `https://solscan.io/tx/${hash}`;
        }
    }

    if (!explorerUrl.startsWith('https://') && !explorerUrl.startsWith('http://')) {
      explorerUrl = `https://${explorerUrl}`;
    }

    console.log('Tentative ouverture URL :', explorerUrl);

    try {
      const supported = await Linking.canOpenURL(explorerUrl);
      if (supported) {
        await Linking.openURL(explorerUrl);
      } else {
        // Fallback direct sans canOpenURL en cas de restrictions Android 11+
        await Linking.openURL(explorerUrl);
      }
    } catch (error) {
      console.error("Erreur ouverture explorateur:", error);
      // Fallback direct en cas de restrictions Android 11+
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
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: confirmed ? colors.up : colors.surface1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(1) }}>
              <Icon name={confirmed ? 'checkmark' : 'clock'} size={32} color={confirmed ? colors.bgDeep : colors.text} />
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
                <Text style={{ fontSize: 28, fontFamily: fonts.bold, color: colors.text, fontVariant: ['tabular-nums'] }}>
                  {formatTokenAmount(txDetails.value, txDetails.decimals ?? chain!.nativeDecimals)} {txDetails.asset ?? chain!.nativeSymbol}
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing(1) }}>
                <Text style={typography.bodyStrong}>0 / 1 confirmation</Text>
                <Text style={typography.muted}>{t('estTimeRange')}</Text>
              </View>
              <View style={{ height: 4, backgroundColor: colors.glassBorder, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: '25%', height: '100%', backgroundColor: colors.accent, borderRadius: 2 }} />
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
                  {hash ? shortAddress(hash) : '...'}
                </Text>
              </View>
            </View>
          </GlassCard>

          <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
            <Button label={t('refresh')} variant="primary" onPress={() => { haptic.selection(); fetchTx(); }} loading={loading} />
            
            {hash ? (
              <Button label={t('viewOnExplorer')} variant="secondary" onPress={handleOpenExplorer} />
            ) : null}
          </View>
        </View>
      </PremiumScreen>
    </>
  );
}
