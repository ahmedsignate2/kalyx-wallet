const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const evmFix = `const isEvm = targetProtocol.underlyingAsset !== 'SOL' && targetProtocol.underlyingAsset !== 'USDC_SOL';
      const chainId = targetProtocol.underlyingAsset === 'AVAX' ? 'avalanche' : targetProtocol.underlyingAsset === 'BNB' ? 'bnb' : !isEvm ? 'solana' : (activeChain === 'sepolia' ? 'sepolia' : 'ethereum');`;

code = code.replace(/const isEvm = \['ETH', 'USDC'\].includes\(targetProtocol\.underlyingAsset\);\s*const chainId = isEvm \? \(activeChain === 'sepolia' \? 'sepolia' : 'ethereum'\) : 'solana';/g, evmFix);

fs.writeFileSync('app/earn.tsx', code);
