const fs = require('fs');

let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regexShortcut = /const applyShortcut = \(pct: number\) => \{[\s\S]*?setAmountStr\(amt\.toFixed\(4\)\);\s*\};/m;
const replacementShortcut = `const applyShortcut = (pct: number) => {
    if (!targetProtocol) return;
    const isNative = ['SOL', 'ETH', 'AVAX', 'BNB'].includes(targetProtocol.underlyingAsset);
    const bal = balances[targetProtocol.underlyingAsset] || 0n;
    
    const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
    let amt = Number(formatBalance(bal, decimals)) * (pct / 100);
    
    if (pct === 100 && isNative) {
       const buffer = targetProtocol.underlyingAsset === 'ETH' ? 0.002 
                    : targetProtocol.underlyingAsset === 'SOL' ? 0.0001 
                    : targetProtocol.underlyingAsset === 'AVAX' ? 0.01 
                    : targetProtocol.underlyingAsset === 'BNB' ? 0.001 : 0;
       amt = Math.max(0, amt - buffer);
    }
    
    setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
  };`;

code = code.replace(regexShortcut, replacementShortcut);
fs.writeFileSync('app/earn.tsx', code);
