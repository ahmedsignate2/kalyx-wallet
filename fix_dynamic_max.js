const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// Replace the synchronous applyShortcut with an asynchronous one that fetches the quote
const regexShortcut = /const applyShortcut = \(pct: number\) => \{[\s\S]*?setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);\s*\};/m;
const replacementShortcut = `const applyShortcut = async (pct: number) => {
    if (!targetProtocol) return;
    const isNative = ['SOL', 'ETH', 'AVAX', 'BNB'].includes(targetProtocol.underlyingAsset);
    const bal = balances[targetProtocol.underlyingAsset] || 0n;
    
    const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
    let maxBal = bal;
    
    if (isNative && bal > 0n) {
       setAmountStr('...'); // UX: show calculating
       try {
           const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
           const isEvm = ['ETH', 'USDC'].includes(targetProtocol.underlyingAsset);
           const chainId = isEvm ? (activeChain === 'sepolia' ? 'sepolia' : 'ethereum') : 'solana';
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
               // Add a 5% safety margin on the API gas estimate just in case
               const safeGas = quote.gasCostNative + (quote.gasCostNative / 20n);
               maxBal = bal > safeGas ? bal - safeGas : 0n;
           } else {
               // Fallback if API fails to provide gasCostNative
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

code = code.replace(regexShortcut, replacementShortcut);

// In validateInput, we should also dynamically fetch or rely on the UI gas check.
// The UI gas check currently uses estGas hardcoded.
// But we can let the UI gas check be soft, and let the executeStake simulation/LI.FI catch the exact error, as we already implemented.

fs.writeFileSync('app/earn.tsx', code);
