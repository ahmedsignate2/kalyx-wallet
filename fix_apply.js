const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regex = /const applyShortcut = async \(pct: number\) => \{[\s\S]*?let amt = Number\(formatBalance\(maxBal, decimals\)\) \* \(pct \/ 100\);\n    setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);\n  \};/;

const replacement = `const applyShortcut = async (pct: number, overrideUnstake?: boolean, overrideProtocol?: any) => {
    const activeUnstaking = overrideUnstake !== undefined ? overrideUnstake : isUnstaking;
    const activeProtocol = overrideProtocol || targetProtocol;
    
    if (activeUnstaking) {
      if (!activeProtocol) return;
      const bal = staked[activeProtocol.id] || 0n;
      const decimals = (activeProtocol.underlyingAsset === 'USDC' || activeProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (activeProtocol.underlyingAsset === 'SOL' ? 9 : 18);
      let amt = Number(formatBalance(bal, decimals)) * (pct / 100);
      setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
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
           const underlyingAddress = activeProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : activeProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : activeProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
           const isEvm = activeProtocol.underlyingAsset !== 'SOL' && activeProtocol.underlyingAsset !== 'USDC_SOL';
      const chainId = activeProtocol.underlyingAsset === 'AVAX' ? 'avalanche' : activeProtocol.underlyingAsset === 'BNB' ? 'bnb' : !isEvm ? 'solana' : (activeChain === 'sepolia' ? 'sepolia' : 'ethereum');
           const adapter = getAdapter(chainId);
           
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
    setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
  };`;

code = code.replace(regex, replacement);

// And update the setTimeout in handleOpenInputModal:
code = code.replace(
  /setTimeout\(\(\) => applyShortcut\(100\), 50\);/,
  "setTimeout(() => applyShortcut(100, unstake, protocol), 50);"
);

fs.writeFileSync('app/earn.tsx', code);
