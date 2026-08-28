const fs = require('fs');

let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regex = /const savaxAddress = '0x2b2c81e08f1af8835a78bb2a9caba09866032896';[\s\S]*?setUserStakedPositions\(positions\);/m;

const replacement = `const savaxAddress1 = '0x2b2c81e08f1af8835a78bb2a9caba09866032896'; // user mock
        const savaxAddress2 = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be'; // real mainnet
        const [bal1, bal2] = await Promise.all([
          avalancheAdapter.getTokenBalance(savaxAddress1, account.evmAddress).catch(() => 0n),
          avalancheAdapter.getTokenBalance(savaxAddress2, account.evmAddress).catch(() => 0n)
        ]);
        const savaxBal = bal1 > 0n ? bal1 : bal2;
        
        const positions = [];
        if (savaxBal > 0n) {
          positions.push({
            id: 'SAVAX',
            name: 'Avalanche Staking',
            symbol: 'sAVAX',
            protocol: 'BENQI Liquid Staking',
            balance: savaxBal,
            decimals: 18,
            underlyingAsset: 'AVAX'
          });
        }
        setUserStakedPositions(positions);`;

code = code.replace(regex, replacement);
fs.writeFileSync('app/earn.tsx', code);
