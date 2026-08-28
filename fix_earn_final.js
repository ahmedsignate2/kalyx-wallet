const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// The first getLifiQuote inside applyShortcut needs fromToken
const regexApplyShortcutLifi = /const quote = await getLifiQuote\(\{\s*fromChainId:[\s\S]*?fromToken,\s*toToken:/g;
const replacementApplyShortcutLifi = `const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
           const quote = await getLifiQuote({
              fromChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              toChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config?.evmChainId || (adapter as any).config?.id || 1,
              fromToken: fromToken,
              toToken:`;
code = code.replace(regexApplyShortcutLifi, replacementApplyShortcutLifi);

// The second getLifiQuote inside executeStake needs underlyingAddress
const regexExecuteStakeLifi = /const quote = await getLifiQuote\(\{[\s\S]*?fromToken: isUnstaking \? targetProtocol\.yieldTokenAddress : underlyingAddress,/g;
const replacementExecuteStakeLifi = `const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const quote = await getLifiQuote({
        fromChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config.evmChainId || adapter.config.id,
        toChainId: (targetProtocol as any).chainId === 'solana' ? 1151111081099710 : (adapter as any).config.evmChainId || adapter.config.id,
        fromToken: isUnstaking ? targetProtocol.yieldTokenAddress : underlyingAddress,`;

if (!code.includes("const underlyingAddress =")) {
    code = code.replace(regexExecuteStakeLifi, replacementExecuteStakeLifi);
} else {
    // wait, if it already exists, let's just make sure it's correct.
}

fs.writeFileSync('app/earn.tsx', code);
