import React, { useEffect, useState } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
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
  const [timeElapsed, setTimeElapsed] = useState('0 min');

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
          setTimeElapsed(diffMin > 0 ? `${diffMin} min` : 'À l\'instant');
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

  const openExplorer = () => {
    if (!hash || !explorerUrl) return;
    haptic.selection();
    // Sécurité demandée : on s'assure d'avoir l'URL correcte
    const url = buildExplorerTxUrl(explorerUrl, hash);
    router.push({ pathname: '/browser', params: { url } });
  };

  const isBtc = chain?.family === 'bitcoin';
  const status = txDetails?.status || 'pending';
  const confirmed = status !== 'pending' && status !== 'failed';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <ScreenHeader title="Suivi de transaction" />
        
        <View style={{ gap: spacing(2) }}>
          <GlassCard style={{ alignItems: 'center', paddingVertical: spacing(3) }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: confirmed ? colors.up : colors.surface1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(1) }}>
              <Icon name={confirmed ? 'checkmark' : 'clock'} size={32} color={confirmed ? colors.bgDeep : colors.text} />
            </View>
            <Text style={[typography.title, { color: confirmed ? colors.up : colors.text }]}>
              {confirmed ? 'Confirmée' : 'En attente'}
            </Text>
            <Text style={typography.muted}>{confirmed ? 'Inclus dans le bloc' : `Il y a ${timeElapsed}`}</Text>
            
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
                    Vers {shortAddress(txDetails.to)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </GlassCard>

          {isBtc && !confirmed ? (
            <GlassCard>
              <Text style={typography.section}>Progression (Mempool)</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing(1) }}>
                <Text style={typography.bodyStrong}>0 / 1 confirmation</Text>
                <Text style={typography.muted}>Est. 10 à 25 min</Text>
              </View>
              <View style={{ height: 4, backgroundColor: colors.glassBorder, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: '25%', height: '100%', backgroundColor: colors.accent, borderRadius: 2 }} />
              </View>
            </GlassCard>
          ) : null}

          <GlassCard>
            <Text style={typography.section}>Détails réseau</Text>
            
            <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.muted}>Réseau</Text>
                <Text style={typography.bodyStrong}>{chain?.name}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={typography.muted}>Frais réseau</Text>
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
            <Button label="Actualiser" variant="primary" onPress={() => { haptic.selection(); fetchTx(); }} loading={loading} />
            
            {explorerUrl && hash ? (
              <Button label={t('viewOnExplorer')} variant="secondary" onPress={openExplorer} />
            ) : null}
          </View>
        </View>
      </PremiumScreen>
    </>
  );
}
