const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regex = /<Button label="Unstake \/ Retirer" variant="ghost" onPress=\{\(\) => toast\.success\('Ouverture de la dApp BENQI\.\.\.'\)\} \/>/;
const replacement = `<Button label="Unstake / Retirer" variant="ghost" onPress={() => {
                  const p = (pos.protocol || '').toLowerCase();
                  let url = 'https://app.uniswap.org';
                  if (p.includes('jito')) url = 'https://jito.network/staking';
                  else if (p.includes('benqi')) url = 'https://staking.benqi.fi';
                  else if (p.includes('lido')) url = 'https://stake.lido.fi';
                  else if (p.includes('binance') || p.includes('bnb')) url = 'https://www.bnbchain.org/en/staking';
                  else if (p.includes('rocket')) url = 'https://stake.rocketpool.net';
                  
                  toast.success(\`Ouverture de \${pos.protocol}...\`);
                  router.push({ pathname: '/browser', params: { url } });
                }} />`;

code = code.replace(regex, replacement);
fs.writeFileSync('app/earn.tsx', code);
