import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { Screen, Card, Title, Muted, Button } from '../ui/components';
import { useTheme, spacing, fonts, radii } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import type { Unlock } from '../lib/walletStore';
import { getAdapter, ALL_CHAINS, EvmChainAdapter, SolanaChainAdapter, getErc20Tokens } from '../src';
import { parseAmount, formatBalance } from '../src/domain/validation/amount';
import { toast } from '../lib/toast';
import { Icon } from '../ui/icon';
import { useAiStore } from '../lib/aiStore';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { SuccessModal } from '../ui/SuccessModal';
import { ethers } from 'ethers';
import { fetchYieldOpportunities, YieldOpportunity } from '../lib/yieldService';
import { getLifiQuote, NATIVE_TOKEN } from '../src';
import { yieldEngine } from '../lib/yield';


const NOVA_TREASURY_EVM = '0x0000000000000000000000000000000000000000';
const NOVA_VALIDATOR_SOL = '4rT2m1GTo3jW5yF3K1xN3MZZu5q1YmFz5wR1NnUeGgTo';
const LIDO_STETH = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';


  const resolveChainName = (chainId: string | number) => {
    if (chainId === 'solana') return 'solana';
    if (chainId === 1) return 'ethereum';
    if (chainId === 43114) return 'avalanche';
    if (chainId === 56) return 'bnb';
    if (chainId === 8453) return 'base';
    if (chainId === 137) return 'polygon';
    if (chainId === 42161) return 'arbitrum';
    if (chainId === 10) return 'optimism';
    if (chainId === 11155111) return 'sepolia';
    return String(chainId);
  };

export default function EarnScreen() {
  const { colors, typography } = useTheme();
  const walletStore = useWallet();
  const { activeAccountIndex, accounts, activeChain, sendRawTxOn } = walletStore;
  const account = accounts.find((a) => a.index === activeAccountIndex) || accounts[0];
  
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  
  const [staked, setStaked] = useState<Record<string, bigint>>({});
  const [userStakedPositions, setUserStakedPositions] = useState<any[]>([]);

  
  const [refreshKey, setRefreshKey] = useState(0);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [targetProtocol, setTargetProtocol] = useState<any>(null);
  
  const [successVisible, setSuccessVisible] = useState(false);
  const [successHash, setSuccessHash] = useState<string | undefined>();
  const [explorerUrl, setExplorerUrl] = useState<string | undefined>();

  const loadBalances = async () => {
    if (!account) return;
    try {
      const newBalances: Record<string, bigint> = {};
      
      const fetchBal = async (chainId: string) => {
        try {
          const adapter = getAdapter(chainId) as EvmChainAdapter;
          const bal = await adapter.getBalance(account.evmAddress);
          return bal.raw;
        } catch(e) { return 0n; }
      };

      const [eBal, aBal, bBal, baBal] = await Promise.all([
        fetchBal('ethereum'),
        fetchBal('avalanche'),
        fetchBal('bnb'),
        fetchBal('base')
      ]);

      
      newBalances['ETH'] = eBal;
      newBalances['AVAX'] = aBal;
      newBalances['BNB'] = bBal;
      newBalances['ETH_BASE'] = baBal;
      
      // -- The dynamic positions are now loaded in a separate effect dependent on opportunities --

      
      try {
        const ethAdapter = getAdapter('ethereum') as EvmChainAdapter;
        const usdcBal = await ethAdapter.getTokenBalance('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', account.evmAddress);
        newBalances['USDC'] = usdcBal;
      } catch(e) {}
      
      if (account.solAddress) {
        try {
          const solAdapter = getAdapter('solana') as SolanaChainAdapter;
          const solBal = await solAdapter.getBalance(account.solAddress);
          newBalances['SOL'] = solBal.raw;
          
          const splTokens = await solAdapter.getSplTokens(account.solAddress);
          const usdcSpl = splTokens.find((t: any) => t.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
          if (usdcSpl) newBalances['USDC_SOL'] = usdcSpl.raw;
        } catch(e) {}
      }
      setBalances(newBalances);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => { loadBalances(); }, [account, activeChain, refreshKey]);

  const formatCrypto = (v: bigint | undefined, decimals: number) => {
    if (v === undefined) return '0.00';
    return Number(formatBalance(v, decimals)).toFixed(4);
  };

  const handleOpenInputModal = (protocol: any, unstake: boolean = false) => {
    setIsUnstaking(unstake);
    setAmountStr('');
    if (activeChain !== protocol.chainId && protocol.chainId !== 'solana') {
       walletStore.setActiveChain(protocol.chainId);
    } else if (protocol.chainId === 'solana' && activeChain !== 'solana') {
       walletStore.setActiveChain('solana');
    }
    setTargetProtocol(protocol);
    setAmountStr('');
    setInputModalVisible(true);
  };

  const applyShortcut = async (pct: number, overrideUnstake?: boolean, overrideProtocol?: any) => {
    const activeUnstaking = overrideUnstake !== undefined ? overrideUnstake : isUnstaking;
    const activeProtocol = overrideProtocol || targetProtocol;
    
    if (activeUnstaking) {
      if (!activeProtocol) return;
      const bal = staked[activeProtocol.id] || 0n;
      const decimals = (activeProtocol.underlyingAsset === 'USDC' || activeProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (activeProtocol.underlyingAsset === 'SOL' ? 9 : 18);
      let amtStrVal = formatBalance(bal, decimals);
      if (pct === 100) {
        setAmountStr(amtStrVal);
      } else {
        let amt = Number(amtStrVal) * (pct / 100);
        setAmountStr(amt > 0 ? Number(Math.floor(amt * 10000) / 10000).toString() : '');
      }
      return;
    }
    if (!activeProtocol) return;
    const isNative = ['SOL', 'ETH', 'AVAX', 'BNB'].includes(activeProtocol.underlyingAsset);
    const bal = balances[activeProtocol.underlyingAsset] || 0n;
    
    const decimals = (activeProtocol.underlyingAsset === 'USDC' || activeProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (activeProtocol.underlyingAsset === 'SOL' ? 9 : 18);
    let maxBal = bal;
    
    if (isNative && bal > 0n) {
       setAmountStr('...'); // UX: show calculating
       try {
           let underlyingAddress = NATIVE_TOKEN;
       if (activeProtocol.chainId === 'solana') underlyingAddress = '11111111111111111111111111111111';
       else if (activeProtocol.underlyingAsset === 'USDC' && activeProtocol.chainId === 1) underlyingAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
       // Add other specific stablecoins here if needed, otherwise it defaults to native token of the chain
           const isEvm = activeProtocol.underlyingAsset !== 'SOL' && activeProtocol.underlyingAsset !== 'USDC_SOL';
      const chainId = activeProtocol.underlyingAsset === 'AVAX' ? 'avalanche' : activeProtocol.underlyingAsset === 'BNB' ? 'bnb' : !isEvm ? 'solana' : (activeChain === 'sepolia' ? 'sepolia' : 'ethereum');
           const adapter = getAdapter(chainId);
           
           
      if (targetProtocol.type === 'Lending') {
          // lending execution path (Aave, Kamino) - not via DEX SWAP
          toast.error('Non supporté', 'Le lending natif (Aave, Kamino) est en cours d\'intégration (ABI requise) et ne peut pas être swappé sur un DEX.');
          setLoadingQuote(false);
          return;
      }
      
      const quote = await getLifiQuote({
              fromChainId: (activeProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              toChainId: (activeProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              fromToken: underlyingAddress,
              toToken: activeProtocol.yieldTokenAddress,
              fromAmount: bal, // request quote for total balance
              fromAddress: isEvm ? account.evmAddress : account.solAddress!,
              isEarn: true,
           });
           
           if (quote && quote.gasCostNative > 0n) {
               // Add a 5% safety margin on the API gas estimate just in case
               const safeGas = quote.gasCostNative + (quote.gasCostNative / 20n);
               maxBal = bal > safeGas ? bal - safeGas : 0n;
           } else {
               const fallbackBuffer = activeProtocol.underlyingAsset === 'ETH' ? parseAmount('0.002', 18).raw : activeProtocol.underlyingAsset === 'SOL' ? parseAmount('0.0025', 9).raw : 0n;
               maxBal = bal > fallbackBuffer ? bal - fallbackBuffer : 0n;
           }
       } catch(e) {
           const fallbackBuffer = activeProtocol.underlyingAsset === 'ETH' ? parseAmount('0.002', 18).raw : activeProtocol.underlyingAsset === 'SOL' ? parseAmount('0.0025', 9).raw : 0n;
           maxBal = bal > fallbackBuffer ? bal - fallbackBuffer : 0n;
       }
    }
    
    let amt = Number(formatBalance(maxBal, decimals)) * (pct / 100);
    if (pct === 100) {
       setAmountStr(formatBalance(maxBal, decimals));
    } else {
       setAmountStr(amt > 0 ? Number(Math.floor(amt * 10000) / 10000).toString() : '');
    }
  };

    const validateInput = () => {
    if (!targetProtocol) return;
    const isNative = targetProtocol?.underlyingAsset === 'SOL' || targetProtocol?.underlyingAsset === 'ETH' || targetProtocol?.underlyingAsset === 'AVAX' || targetProtocol?.underlyingAsset === 'BNB';
    const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : targetProtocol?.underlyingAsset === 'SOL' ? 0.0025 : 0.00001;
    const totalNeeded = isUnstaking ? Number(amountStr) : Number(amountStr) + (isNative ? estGas : 0);
    const userBal = isUnstaking ? Number(formatBalance(staked[targetProtocol?.id] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : Number(formatBalance(balances[targetProtocol?.underlyingAsset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));
    
    if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
      toast.error('Montant invalide', 'Veuillez saisir un montant valide à staker.');
      return;
    }
    if (totalNeeded > userBal) {
      toast.error('Solde insuffisant', 'Vous n\'avez pas assez de fonds pour couvrir le montant et les frais réseau.');
      return;
    }
    
    // Balance check
    const balRaw = balances[targetProtocol.underlyingAsset] || 0n;
    const userBalance = isUnstaking ? Number(formatBalance(staked[targetProtocol?.id] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : Number(formatBalance(balRaw, (targetProtocol.underlyingAsset === 'USDC' ? 6 : targetProtocol.underlyingAsset === 'SOL' ? 9 : 18)));
    const numAmount = Number(amountStr);
    
    if (numAmount > userBalance) {
      toast.error('Solde insuffisant', `Tu possèdes ${userBalance} ${isUnstaking ? (targetProtocol.symbol || targetProtocol.project) : targetProtocol.underlyingAsset}`);
      return;
    }

    setInputModalVisible(false);
    setTimeout(() => setUnlockVisible(true), 300); // Wait for modal animation to close
  };


  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchYieldOpportunities().then(setOpportunities);
  }, [refreshKey]);

  useEffect(() => {
    const loadDynamicPositions = async () => {
      if (!account) return;
      try {
        const positions = await yieldEngine.detectAllPositions(
          account.evmAddress,
          account.solAddress || undefined,
        );
        const newStaked: Record<string, bigint> = {};
        const posList: any[] = [];
        for (const pos of positions) {
          newStaked[pos.id] = pos.balance;
          posList.push({
            id: pos.id,
            name: pos.protocol + ' Staking',
            symbol: pos.symbol,
            protocol: pos.protocol,
            balance: pos.balance,
            decimals: pos.decimals,
            underlyingAsset: pos.underlyingAsset,
          });
        }
        setStaked(newStaked);
        setUserStakedPositions(posList);
      } catch (e) {
        console.warn('[YieldEngine] Failed to detect positions', e);
      }
    };
    loadDynamicPositions();
  }, [account, opportunities, refreshKey]);

  const executeStake = async (unlock: Unlock) => {
    if (!targetProtocol) return;
    setLoadingQuote(true);
    
    try {
      // Lending protocols are not yet supported (need direct ABI calls)
      if (targetProtocol.type === 'Lending') {
        toast.error('Non supporté', 'Le lending natif (Aave, Kamino) est en cours d\'intégration.');
        setLoadingQuote(false);
        return;
      }

      const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol.underlyingAsset === 'SOL' ? 9 : 18;
      const rawAmount = parseAmount(amountStr, decimals).raw;
      const isSolana = targetProtocol.chainId === 'solana';
      const fromAddress = isSolana ? account.solAddress! : account.evmAddress;

      // Delegate entirely to the YieldEngine
      const result = isUnstaking
        ? await yieldEngine.unstake(targetProtocol.id, rawAmount, fromAddress, unlock, walletStore)
        : await yieldEngine.stake(targetProtocol.id, rawAmount, fromAddress, unlock, walletStore);

      // ONLY show success if the engine confirmed on-chain
      if (result.success) {
        setSuccessHash(result.hash);
        const chainName = isSolana ? 'solana' : resolveChainName(targetProtocol.chainId);
        try {
          const adapter = getAdapter(chainName);
          setExplorerUrl((adapter as any)?.config?.explorerUrl);
        } catch { setExplorerUrl(undefined); }
        setUnlockVisible(false);
        setTimeout(() => setSuccessVisible(true), 400);
        // Refresh balances and positions
        setRefreshKey(k => k + 1);
      } else {
        // Transaction failed on-chain — show the real error, NEVER a fake success
        toast.error('Transaction échouée', result.error || 'La transaction a été rejetée on-chain.');
        setUnlockVisible(false);
      }
      
    } catch (e: any) {
      toast.error('Erreur', e.message || 'La transaction a échoué');
      setUnlockVisible(false);
    } finally {
      setLoadingQuote(false);
    }
  };

  const eligibleOpps = showAll ? opportunities : opportunities.filter(opp => {
    const balRaw = balances[opp.underlyingAsset as keyof typeof balances] || 0n;
    return balRaw > 0n;
  });


  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: true, title: 'Earn & Staking' }} />
      <Title>Faites travailler vos cryptos</Title>
      <Muted>Générez des rendements passifs en sécurisant le réseau ou via la DeFi.</Muted>

      {/* SECTION MES POSITIONS */}
      {userStakedPositions.length > 0 && (
        <View style={{ marginTop: spacing(3), marginBottom: spacing(1) }}>
          <Text style={[typography.section, { marginBottom: spacing(2) }]}>Mes positions actives</Text>
          {userStakedPositions.map((pos) => (
            <Card key={pos.id} style={{ padding: spacing(2), marginBottom: spacing(2), borderColor: colors.accent, borderWidth: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E84142', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
                  <Icon name="staking" size={24} color="#FFF" />
                </View>
                <View style={{ flex: 1, paddingRight: spacing(1) }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>{pos.name}</Text>
                  <Text style={typography.muted} numberOfLines={1}>{pos.protocol}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={typography.bodyStrong}>{formatCrypto(pos.balance, pos.decimals)} {pos.symbol}</Text>
                  <Text style={[typography.muted, { color: colors.up, fontSize: 12 }]}>Actif</Text>
                </View>
              </View>
              
              <View style={{ height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(2) }} />
              
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button label="Unstake / Retirer" variant="ghost" onPress={() => {
                  const opp = opportunities.find(o => o.id === pos.id);
                  if (opp) handleOpenInputModal(opp, true);
                }} />
              </View>
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(3), marginBottom: spacing(1) }}>
        <Text style={typography.section}>Opportunités</Text>
        <Pressable onPress={() => setShowAll(!showAll)} style={{ padding: spacing(1) }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.medium }}>
            {showAll ? 'Mes actifs' : 'Tout explorer'}
          </Text>
        </Pressable>
      </View>

      {eligibleOpps.length === 0 && !showAll && <Text style={[typography.muted, {textAlign: 'center', marginVertical: spacing(2)}]}>Aucun actif éligible détecté dans votre portefeuille. Cliquez sur 'Tout explorer'.</Text>}
      {eligibleOpps.map((opp: any) => (
        <Card key={opp.id} style={{ padding: spacing(2), marginBottom: spacing(2) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: opp.underlyingAsset === 'SOL' ? '#14F195' : opp.underlyingAsset === 'AVAX' ? '#E84142' : opp.underlyingAsset === 'BNB' ? '#F3BA2F' : (opp.underlyingAsset === 'USDC' || opp.underlyingAsset === 'USDC_SOL') ? '#B6509E' : '#627EEA', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
              <Icon name={opp.underlyingAsset === 'SOL' ? 'staking' : 'defi'} size={24} color={opp.underlyingAsset === 'SOL' ? '#000' : '#FFF'} />
            </View>
            <View style={{ flex: 1, paddingRight: spacing(1) }}>
              <Text style={typography.bodyStrong} numberOfLines={1}>{opp.project} ({opp.underlyingAsset})</Text>
              <Text style={typography.muted} numberOfLines={1}>~{opp.apy}% APY • {opp.type}</Text>
            </View>
            <Text style={{ fontFamily: fonts.bold, color: colors.up }}>+{opp.apy}%</Text>
          </View>
          
          <View style={{ height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(2) }} />
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={typography.muted}>Dispo : {formatCrypto(balances[opp.underlyingAsset], ((opp.underlyingAsset === 'USDC' || opp.underlyingAsset === 'USDC_SOL') ? 6 : opp.underlyingAsset === 'SOL' ? 9 : 18))} {opp.underlyingAsset}</Text>
              <Text style={typography.muted}>Staké : {formatCrypto(staked[opp.id], ((opp.underlyingAsset === 'USDC' || opp.underlyingAsset === 'USDC_SOL') ? 6 : opp.underlyingAsset === 'SOL' ? 9 : 18))} {opp.underlyingAsset}</Text>
            </View>
            <Button label={opp.type === 'Lending' ? 'Déposer' : 'Staker'} onPress={() => handleOpenInputModal(opp)} />
          </View>
        </Card>
      ))}

      <View style={{ height: spacing(12) }} />
      {/* MODAL DE SAISIE */}
      <Modal visible={inputModalVisible} transparent animationType="slide" onRequestClose={() => setInputModalVisible(false)}>
         <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
           <View style={{ backgroundColor: colors.bgElevated, padding: spacing(3), borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}>
             <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(2) }}>
               <Text style={typography.title}>{isUnstaking ? 'Retirer de' : (targetProtocol?.type === 'Lending' ? 'Déposer sur' : 'Staker sur')} {targetProtocol?.project}</Text>
               <Pressable onPress={() => setInputModalVisible(false)}>
                 <Icon name="close" size={24} color={colors.textFaint} />
               </Pressable>
             </View>
             
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) }}>
               <TextInput
                 autoFocus
                 style={{ fontSize: 32, fontFamily: fonts.bold, color: colors.text, flex: 1 }}
                 placeholder="0.00"
                 placeholderTextColor={colors.textFaint}
                 keyboardType="numeric"
                 value={amountStr}
                 onChangeText={(v) => setAmountStr(v.replace(',', '.'))}
               />
               <Text style={{ fontSize: 24, color: colors.textFaint, fontFamily: fonts.medium }}>{isUnstaking ? (targetProtocol?.symbol === 'Jito' ? 'JitoSOL' : (targetProtocol?.symbol || targetProtocol?.project)) : targetProtocol?.underlyingAsset}</Text>
             </View>
             
             <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(3) }}>
               <Pressable onPress={() => applyShortcut(25)} style={{ flex: 1, backgroundColor: colors.cardBorder, padding: spacing(1), borderRadius: radii.md, alignItems: 'center' }}>
                 <Text style={{ color: colors.text }}>25%</Text>
               </Pressable>
               <Pressable onPress={() => applyShortcut(50)} style={{ flex: 1, backgroundColor: colors.cardBorder, padding: spacing(1), borderRadius: radii.md, alignItems: 'center' }}>
                 <Text style={{ color: colors.text }}>50%</Text>
               </Pressable>
               <Pressable onPress={() => applyShortcut(100)} style={{ flex: 1, backgroundColor: colors.cardBorder, padding: spacing(1), borderRadius: radii.md, alignItems: 'center' }}>
                 <Text style={{ color: colors.text }}>MAX</Text>
               </Pressable>
             </View>

             
             <Card style={{ padding: spacing(2), backgroundColor: colors.bgDeep, marginBottom: spacing(3) }}>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing(1) }}>
                 <Text style={typography.muted}>Rendement estimé (1 an)</Text>
                 <Text style={{ color: colors.up, fontFamily: fonts.bold }}>~{targetProtocol ? (Number(amountStr || 0) * (targetProtocol.apy / 100)).toFixed(5) : 0} {targetProtocol?.underlyingAsset}</Text>
               </View>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                 <Text style={typography.muted}>Frais réseau (est.)</Text>
                 <Text style={typography.muted}>{['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? '~0.002 ETH' : '~0.00001 SOL'}</Text>
               </View>
             </Card>
             
             {['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) && (Number(amountStr) < 0.05) && (
               <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: spacing(2), borderRadius: radii.md, marginBottom: spacing(3) }}>
                 <Text style={{ color: '#F59E0B', fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' }}>
                   ⚠️ Frais de réseau élevés par rapport au montant. Préférez un Layer 2 ou Solana pour économiser.
                 </Text>
               </View>
             )}

             {(() => {
                const decimals = (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18;
                if (isUnstaking) {
                  // UNSTAKE MODE: compare against staked token balance (JitoSOL, sAVAX, etc.)
                  const stakedBal = Number(formatBalance(staked[targetProtocol?.id] || 0n, decimals));
                  const isInsufficient = Number(amountStr) > 0 && Number(amountStr) > stakedBal;
                  return (
                    <View style={{ opacity: isInsufficient ? 0.5 : 1 }}>
                      <Button 
                        label={isInsufficient ? "Solde insuffisant" : "Confirmer le retrait"} 
                        onPress={isInsufficient ? () => {} : validateInput} 
                        disabled={isInsufficient}
                      />
                    </View>
                  );
                } else {
                  // STAKE MODE: compare against native/underlying balance (SOL, ETH, etc.)
                  const isNative = targetProtocol?.underlyingAsset === 'SOL' || targetProtocol?.underlyingAsset === 'ETH' || targetProtocol?.underlyingAsset === 'AVAX' || targetProtocol?.underlyingAsset === 'BNB';
                  const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : targetProtocol?.underlyingAsset === 'SOL' ? 0.0025 : 0.00001;
                  const totalNeeded = Number(amountStr || 0) + (isNative ? estGas : 0);
                  const userBal = Number(formatBalance(balances[targetProtocol?.underlyingAsset] || 0n, decimals));
                  const isInsufficient = Number(amountStr) > 0 && totalNeeded > userBal;
                  return (
                    <View style={{ opacity: isInsufficient ? 0.5 : 1 }}>
                      <Button 
                        label={isInsufficient ? "Solde insuffisant" : (targetProtocol?.type === 'Lending' ? "Confirmer le dépôt" : "Confirmer le staking")} 
                        onPress={isInsufficient ? () => {} : validateInput} 
                        disabled={isInsufficient}
                      />
                    </View>
                  );
                }
              })()}

           </View>
         </KeyboardAvoidingView>
      </Modal>
      
      <ConfirmUnlock
        visible={unlockVisible}
        title={isUnstaking ? `Retrait de ${targetProtocol?.project}` : `Staking ${targetProtocol?.project}`}
        subtitle={isUnstaking ? `Retrait de ${amountStr} ${targetProtocol?.symbol || targetProtocol?.underlyingAsset}` : `Dépôt de ${amountStr} ${targetProtocol?.underlyingAsset}`}
        statusText="Exécution du smart contract en cours..."
        perform={executeStake}
        onDone={() => {}}
        onCancel={() => setUnlockVisible(false)}
        aiContext={{ to: "LIFI_ROUTER", value: amountStr, method: isUnstaking ? "Unstake_Swap" : "Stake_Swap" }} 
      />

      <SuccessModal
        visible={successVisible}
        title="Dépôt réussi !"
        message={`Vos ${targetProtocol?.underlyingAsset} travaillent désormais pour vous. Les récompenses seront cumulées automatiquement.`}
        hash={successHash}
        explorerUrl={explorerUrl}
        onClose={() => { setSuccessVisible(false); setRefreshKey(k => k + 1); }}
      />
    </Screen>
  );
}
