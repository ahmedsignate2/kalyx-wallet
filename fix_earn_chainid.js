const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// Helper to map YieldOpportunity chainId to Nova's internal adapter names
const chainIdResolver = `
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
`;

if (!code.includes('resolveChainName')) {
  code = code.replace(/export default function EarnScreen\(\) \{/, chainIdResolver + '\nexport default function EarnScreen() {');
}

// Fix in loadDynamicPositions
code = code.replace(
  /const chainId = opp\.underlyingAsset === 'AVAX' \? 'avalanche' : opp\.underlyingAsset === 'BNB' \? 'bnb' : !isEvm \? 'solana' : 'ethereum';/g,
  "const chainId = resolveChainName(opp.chainId);"
);

// Fix in executeStake
code = code.replace(
  /const chainId = targetProtocol\.underlyingAsset === 'AVAX' \? 'avalanche' : targetProtocol\.underlyingAsset === 'BNB' \? 'bnb' : !isEvm \? 'solana' : \(activeChain === 'sepolia' \? 'sepolia' : 'ethereum'\);/g,
  "const chainId = resolveChainName(targetProtocol.chainId);"
);

// Fix underlyingAddress routing (remove the name-based fallback entirely, use NATIVE_TOKEN by default unless it's a specific known stablecoin)
const newUnderlying = `let underlyingAddress = NATIVE_TOKEN;
       if (activeProtocol.chainId === 'solana') underlyingAddress = '11111111111111111111111111111111';
       else if (activeProtocol.underlyingAsset === 'USDC' && activeProtocol.chainId === 1) underlyingAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
       // Add other specific stablecoins here if needed, otherwise it defaults to native token of the chain`;

code = code.replace(
  /let underlyingAddress = NATIVE_TOKEN;\s*if \(activeProtocol\.underlyingAsset === 'SOL'\)[\s\S]*?else if \(activeProtocol\.underlyingAsset === 'BNB'\) underlyingAddress = NATIVE_TOKEN;/g,
  newUnderlying
);

const newUnderlying2 = `let underlyingAddress = NATIVE_TOKEN;
       if (targetProtocol.chainId === 'solana') underlyingAddress = '11111111111111111111111111111111';
       else if (targetProtocol.underlyingAsset === 'USDC' && targetProtocol.chainId === 1) underlyingAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';`;

code = code.replace(
  /let underlyingAddress = NATIVE_TOKEN;\s*if \(targetProtocol\.underlyingAsset === 'SOL'\)[\s\S]*?else if \(targetProtocol\.underlyingAsset === 'BNB'\) underlyingAddress = NATIVE_TOKEN;/g,
  newUnderlying2
);

// Prevent lending from passing through LI.FI
const executeStakePatch = `
      if (targetProtocol.type === 'Lending') {
          // lending execution path (Aave, Kamino) - not via DEX SWAP
          toast.error('Non supporté', 'Le lending natif (Aave, Kamino) est en cours d\\'intégration (ABI requise) et ne peut pas être swappé sur un DEX.');
          setLoadingQuote(false);
          return;
      }
      
      const quote = await getLifiQuote({`;

code = code.replace(
  /const quote = await getLifiQuote\(\{/g,
  executeStakePatch
);

fs.writeFileSync('app/earn.tsx', code);
