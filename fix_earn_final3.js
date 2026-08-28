const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// Update applyShortcut logic
const regexShortcut = /const applyShortcut = \(pct: number\) => \{[\s\S]*?setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);\s*\};/m;
const replacementShortcut = `const applyShortcut = (pct: number) => {
    if (!targetProtocol) return;
    const isNative = ['SOL', 'ETH', 'AVAX', 'BNB'].includes(targetProtocol.underlyingAsset);
    const bal = balances[targetProtocol.underlyingAsset] || 0n;
    
    const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
    let maxBal = Number(formatBalance(bal, decimals));
    
    if (isNative) {
       const buffer = targetProtocol.underlyingAsset === 'ETH' ? 0.002 
                    : targetProtocol.underlyingAsset === 'SOL' ? 0.0025 
                    : targetProtocol.underlyingAsset === 'AVAX' ? 0.01 
                    : targetProtocol.underlyingAsset === 'BNB' ? 0.001 : 0;
       maxBal = Math.max(0, maxBal - buffer);
    }
    
    let amt = maxBal * (pct / 100);
    setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
  };`;

code = code.replace(regexShortcut, replacementShortcut);

// Update Simulation logic to handle InsufficientFundsForRent
const regexSim = /if \(match\) \{[\s\S]*?\n            \}/m;
const replacementSim = `if (match) {
                const has = Number(match[1]);
                const need = Number(match[2]);
                const missing = (need - has) / 1e9;
                throw new Error(\`Solde insuffisant. Il manque \${missing.toFixed(9).replace(/0+$/, '')} SOL pour créer le compte WSOL.\`);
            }
            if (JSON.stringify(sim.value.err).includes("InsufficientFundsForRent")) {
                throw new Error(\`Solde insuffisant pour payer l'exemption de loyer (Rent Exemption) Solana. Gardez au moins 0.0025 SOL de marge.\`);
            }`;

code = code.replace(regexSim, replacementSim);

fs.writeFileSync('app/earn.tsx', code);
