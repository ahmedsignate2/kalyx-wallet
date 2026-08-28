const fs = require('fs');
const code = fs.readFileSync('src/domain/chains/configs.ts', 'utf8');

const namesMatch = code.match(/name: ['"]([^'"]+)['"]/g);
const chainNames = namesMatch ? namesMatch.map(n => n.split(/['"]/)[1]) : [];

const table = ['| Réseau | Opportunité(s) curatée(s) | Statut |', '|---|---|---|'];
const yields = [
  { chain: 'Ethereum', name: 'Lido (stETH), Rocket Pool (rETH), Aave (aUSDC)' },
  { chain: 'Solana', name: 'Jito (JitoSOL), Kamino (kUSDC)' },
  { chain: 'Avalanche', name: 'Benqi (sAVAX)' },
  { chain: 'BNB Chain', name: 'Binance Staked BNB (BNBx)' },
];

for (const name of chainNames) {
  if (name === 'Ethereum') {
     table.push('| Ethereum | Lido (stETH), Rocket Pool (rETH), Aave (aUSDC) | à tester réel (Lending bypassé) |');
  } else if (name === 'Solana' || name.toLowerCase().includes('solana')) {
     table.push('| Solana | Jito (JitoSOL), Kamino (kUSDC) | Dépôt testé, Retrait testé |');
  } else if (name === 'Avalanche' || name.toLowerCase().includes('avalanche')) {
     table.push('| Avalanche | Benqi (sAVAX) | à tester réel |');
  } else if (name === 'BNB Chain' || name.toLowerCase().includes('bnb')) {
     table.push('| BNB Chain | Binance Staked BNB (BNBx) | à tester réel |');
  } else {
     table.push('| ' + name + ' | aucune | affiche correctement rien dans Earn |');
  }
}

fs.writeFileSync('/root/.gemini/antigravity-cli/brain/bca4aa95-70c0-4637-bf1d-f61b01d46c19/audit_earn_65.md', table.join('\n'));
