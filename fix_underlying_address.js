const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const replacement = `let underlyingAddress = NATIVE_TOKEN;
       if (activeProtocol.underlyingAsset === 'SOL') underlyingAddress = '11111111111111111111111111111111';
       else if (activeProtocol.underlyingAsset === 'USDC_SOL') underlyingAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
       else if (activeProtocol.underlyingAsset === 'USDC') underlyingAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
       else if (activeProtocol.underlyingAsset === 'AVAX') underlyingAddress = NATIVE_TOKEN;
       else if (activeProtocol.underlyingAsset === 'BNB') underlyingAddress = NATIVE_TOKEN;`;

// We have two places where `const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? ...` is defined.
// 1. Inside `applyShortcut` (which uses activeProtocol)
const regex1 = /const underlyingAddress = activeProtocol\.underlyingAsset === 'ETH' \? NATIVE_TOKEN : activeProtocol\.underlyingAsset === 'SOL' \? '11111111111111111111111111111111' : activeProtocol\.underlyingAsset === 'USDC_SOL' \? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';/g;

code = code.replace(regex1, replacement);

// 2. Inside `executeStake` (which uses targetProtocol)
const replacement2 = `let underlyingAddress = NATIVE_TOKEN;
       if (targetProtocol.underlyingAsset === 'SOL') underlyingAddress = '11111111111111111111111111111111';
       else if (targetProtocol.underlyingAsset === 'USDC_SOL') underlyingAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
       else if (targetProtocol.underlyingAsset === 'USDC') underlyingAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
       else if (targetProtocol.underlyingAsset === 'AVAX') underlyingAddress = NATIVE_TOKEN;
       else if (targetProtocol.underlyingAsset === 'BNB') underlyingAddress = NATIVE_TOKEN;`;

const regex2 = /const underlyingAddress = targetProtocol\.underlyingAsset === 'ETH' \? NATIVE_TOKEN : targetProtocol\.underlyingAsset === 'SOL' \? '11111111111111111111111111111111' : targetProtocol\.underlyingAsset === 'USDC_SOL' \? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';/g;

code = code.replace(regex2, replacement2);

fs.writeFileSync('app/earn.tsx', code);
