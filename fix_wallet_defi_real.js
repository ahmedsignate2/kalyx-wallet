const fs = require('fs');
let code = fs.readFileSync('app/wallet.tsx', 'utf8');

const regexDefiPositions = /const defiPositions = useMemo\(\(\) => \{\s*return tokens\.filter\(\(tk\) => \{[\s\S]*?\}\);\s*\}, \[tokens\]\);/g;
const replacementDefiPositions = `const defiPositions = useMemo(() => {
    return tokens.filter((tk) => {
      if (tk.defi?.kind === 'defi') return true;
      // Indexer mapping via yieldService for Lending/DeFi protocols
      const o = opps.find(op => op.type !== 'Liquid Staking' && (op.yieldTokenAddress === tk.contract || op.yieldTokenAddress === (tk as any).mint));
      return o !== undefined;
    });
  }, [tokens, opps]);`;

code = code.replace(regexDefiPositions, replacementDefiPositions);
fs.writeFileSync('app/wallet.tsx', code);
