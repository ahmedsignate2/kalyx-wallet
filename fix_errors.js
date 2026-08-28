const fs = require('fs');
let codeEarn = fs.readFileSync('app/earn.tsx', 'utf8');

// Fix applyShortcut
codeEarn = codeEarn.replace(
  "const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';",
  "const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';"
);

// Fix executeStake
codeEarn = codeEarn.replace(
  "const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';",
  "const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';"
);

fs.writeFileSync('app/earn.tsx', codeEarn);

let codeWallet = fs.readFileSync('app/wallet.tsx', 'utf8');
if (!codeWallet.includes("fetchYieldOpportunities")) {
    console.log("WAIT, it's missing entirely?");
}
if (!codeWallet.includes("import { fetchYieldOpportunities }")) {
    codeWallet = codeWallet.replace(
      "import { useCustomTokens } from '../lib/customTokensStore';",
      "import { useCustomTokens } from '../lib/customTokensStore';\nimport { fetchYieldOpportunities } from '../lib/yieldService';"
    );
}

fs.writeFileSync('app/wallet.tsx', codeWallet);
