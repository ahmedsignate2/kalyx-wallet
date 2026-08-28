const fs = require('fs');
let code = fs.readFileSync('app/wallet.tsx', 'utf8');

const regexDefiPositions = /const defiPositions = useMemo\(\(\) => tokens\.filter\(\(tk\) => tk\.defi\?\.kind === 'defi'\), \[tokens\]\);/g;
const replacementDefiPositions = `const defiPositions = useMemo(() => {
    return tokens.filter((tk) => {
      if (tk.defi?.kind === 'defi') return true;
      const n = (tk.name || '').toLowerCase();
      const s = (tk.symbol || '').toLowerCase();
      // Heuristics for DeFi tokens (LPs, aTokens, cTokens, Vaults)
      return n.includes('liquidity') || n.includes('lp token') || s.includes('lp') || n.includes('aave') || n.includes('compound') || s.startsWith('a') && s.length > 3 || s.startsWith('c') && s.length > 3;
    });
  }, [tokens]);`;

code = code.replace(regexDefiPositions, replacementDefiPositions);
fs.writeFileSync('app/wallet.tsx', code);
