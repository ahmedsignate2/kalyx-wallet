const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Add isUnstaking state
code = code.replace(
  /const \[inputModalVisible, setInputModalVisible\] = useState\(false\);/,
  "const [isUnstaking, setIsUnstaking] = useState(false);\n  const [inputModalVisible, setInputModalVisible] = useState(false);"
);

// 2. Modify handleOpenInputModal to support unstake
code = code.replace(
  /const handleOpenInputModal = \(protocol: any\) => \{/,
  `const handleOpenInputModal = (protocol: any, unstake: boolean = false) => {\n    setIsUnstaking(unstake);`
);

// 3. Update the Unstake button inside the positions map
const regexUnstakeBtn = /<Button label="Unstake \/ Retirer".*?\/>/;
const replacementUnstakeBtn = `<Button label="Unstake / Retirer" variant="ghost" onPress={() => {
                  const opp = opportunities.find(o => o.id === pos.id);
                  if (opp) handleOpenInputModal(opp, true);
                }} />`;
code = code.replace(regexUnstakeBtn, replacementUnstakeBtn);

// 4. Update applyShortcut to handle unstaking logic
const regexApplyShortcut = /const applyShortcut = async \(pct: number\) => \{[\s\S]*?let amt = Number\(formatBalance\(maxBal, decimals\)\) \* \(pct \/ 100\);\n    setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);\n  \};/;
const replacementApplyShortcut = `const applyShortcut = async (pct: number) => {
    if (!targetProtocol) return;
    
    if (isUnstaking) {
      const bal = staked[targetProtocol.id] || 0n;
      const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
      let amt = Number(formatBalance(bal, decimals)) * (pct / 100);
      setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
      return;
    }
    
    const isNative = ['SOL', 'ETH', 'AVAX', 'BNB'].includes(targetProtocol.underlyingAsset);
    const bal = balances[targetProtocol.underlyingAsset] || 0n;
    
    const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
    let maxBal = bal;
    
    if (isNative && bal > 0n) {
       setAmountStr('...'); // UX: show calculating
       try {
           const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
           const isEvm = targetProtocol.underlyingAsset !== 'SOL' && targetProtocol.underlyingAsset !== 'USDC_SOL';
      const chainId = targetProtocol.underlyingAsset === 'AVAX' ? 'avalanche' : targetProtocol.underlyingAsset === 'BNB' ? 'bnb' : !isEvm ? 'solana' : (activeChain === 'sepolia' ? 'sepolia' : 'ethereum');
           const adapter = getAdapter(chainId);
           
           const quote = await getLifiQuote({
              fromChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              toChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              fromToken,
              toToken: targetProtocol.yieldTokenAddress,
              fromAmount: bal, // request quote for total balance
              fromAddress: isEvm ? account.evmAddress : account.solAddress!,
              isEarn: true,
           });
           
           if (quote && quote.gasCostNative > 0n) {
               const safeGas = quote.gasCostNative + (quote.gasCostNative / 20n);
               maxBal = bal > safeGas ? bal - safeGas : 0n;
           } else {
               const fallbackBuffer = targetProtocol.underlyingAsset === 'ETH' ? parseAmount('0.002', 18).raw : targetProtocol.underlyingAsset === 'SOL' ? parseAmount('0.0025', 9).raw : 0n;
               maxBal = bal > fallbackBuffer ? bal - fallbackBuffer : 0n;
           }
       } catch(e) {
           const fallbackBuffer = targetProtocol.underlyingAsset === 'ETH' ? parseAmount('0.002', 18).raw : targetProtocol.underlyingAsset === 'SOL' ? parseAmount('0.0025', 9).raw : 0n;
           maxBal = bal > fallbackBuffer ? bal - fallbackBuffer : 0n;
       }
    }
    
    let amt = Number(formatBalance(maxBal, decimals)) * (pct / 100);
    setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
  };`;
code = code.replace(regexApplyShortcut, replacementApplyShortcut);

// 5. Update executeStake to support unstake quote routing
const regexQuote = /const quote = await getLifiQuote\(\{[\s\S]*?fromAddress: isEvm \? account\.evmAddress : account\.solAddress!,[\s\S]*?isEarn: true,\n      \}\);/;
const replacementQuote = `const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const quote = await getLifiQuote({
        fromChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config.evmChainId || adapter.config.id,
        toChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config.evmChainId || adapter.config.id,
        fromToken: isUnstaking ? targetProtocol.yieldTokenAddress : underlyingAddress,
        toToken: isUnstaking ? underlyingAddress : targetProtocol.yieldTokenAddress,
        fromAmount: rawAmount,
        fromAddress: isEvm ? account.evmAddress : account.solAddress!,
        isEarn: !isUnstaking, // only charge 0 fee on stake, unstake can be normal swap
      });`;
code = code.replace(regexQuote, replacementQuote);

// 6. Update UI texts for Unstake mode
code = code.replace(
  /<Title>Staker sur \{targetProtocol\?\.project\}<\/Title>/,
  "<Title>{isUnstaking ? 'Retirer de' : 'Staker sur'} {targetProtocol?.project}</Title>"
);
code = code.replace(
  /Solde disponible : \{formatCrypto\(balances\[targetProtocol\?\.underlyingAsset\],.*?\)\} \{targetProtocol\?\.underlyingAsset\}/,
  "Solde disponible : {isUnstaking ? formatCrypto(staked[targetProtocol?.id], ((targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : formatCrypto(balances[targetProtocol?.underlyingAsset], ((targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18))} {isUnstaking ? targetProtocol?.project + ' (Staked)' : targetProtocol?.underlyingAsset}"
);
code = code.replace(
  /<Text style=\{\{ fontSize: 24, color: colors\.textFaint, fontFamily: fonts\.medium \}\}>\{targetProtocol\?\.underlyingAsset\}<\/Text>/,
  "<Text style={{ fontSize: 24, color: colors.textFaint, fontFamily: fonts.medium }}>{isUnstaking ? targetProtocol?.project : targetProtocol?.underlyingAsset}</Text>"
);
code = code.replace(
  /<Button label=\{\`Confirmer le \$\{targetProtocol\?\.type === 'Lending' \? 'dépôt' : 'staking'\}\`\}/,
  "<Button label={isUnstaking ? 'Confirmer le retrait' : `Confirmer le ${targetProtocol?.type === 'Lending' ? 'dépôt' : 'staking'}`}"
);

fs.writeFileSync('app/earn.tsx', code);
