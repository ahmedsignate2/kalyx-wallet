const fs = require('fs');

// Fix lib/defiIndexer.ts
let defiIndexer = fs.readFileSync('lib/defiIndexer.ts', 'utf8');
defiIndexer = defiIndexer.replace(/import \{ Tok \} from "\.\.\/src\/domain\/chains\/EvmChainAdapter";/, '');
defiIndexer = defiIndexer.replace(/tokens: Tok\[\]/, 'tokens: any[]');
fs.writeFileSync('lib/defiIndexer.ts', defiIndexer);

// Fix app/wallet.tsx
let walletCode = fs.readFileSync('app/wallet.tsx', 'utf8');
walletCode = walletCode.replace(
  /fetchDeFiPortfolio\(account\.address, activeChain, tokens\)/,
  "fetchDeFiPortfolio(account.solAddress || account.evmAddress, activeChain, tokens)"
);

const regexPositionsRender = /\{positions\.map\(\(p: any, i\) => \{[\s\S]*?\}\)\}\s*<\/GlassCard>/;

const newRender = `{positions.map((p: any, i: number) => {
                    const isIndexedDeFi = tab === 'defi';
                    const pName = isIndexedDeFi ? p.protocol : (p.defi?.protocol || p.name);
                    const title = isIndexedDeFi ? p.name : p.name;
                    const subtitle = isIndexedDeFi ? \`\${p.protocol} · \${p.valueUsd > 0 ? '$' + p.valueUsd.toFixed(2) : 'Actif'}\` : \`\${p.defi?.protocol ?? ''} · \${hidden ? '••••' : \`\${formatBalance(p.raw, p.decimals, 6)} \${p.symbol}\`}\`;
                    const rightText = isIndexedDeFi ? (p.valueUsd > 0 ? \`\${p.valueUsd.toFixed(2)} $\` : '—') : (hidden ? '••••' : p.hasPrice ? \`\${money(p.fiat)} \${fiatSymbol(fiat)}\` : '—');
                    const iconUrl = isIndexedDeFi ? p.logo : p.logo;

                    return (
                    <ListRow
                      key={isIndexedDeFi ? p.id : p.contract}
                      divider={i > 0}
                      left={<RemoteIcon uri={iconUrl} label={isIndexedDeFi ? p.protocol : p.symbol} />}
                      title={title}
                      subtitle={subtitle}
                      right={
                        <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
                          {rightText}
                        </Text>
                      }
                      onPress={() => {
                        let url = isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com';
                        
                        if (isIndexedDeFi) {
                           url = p.url;
                        } else {
                          const lc = pName.toLowerCase();
                          if (lc.includes('jito')) url = 'https://jito.network/staking';
                          else if (lc.includes('benqi')) url = isStaking ? 'https://staking.benqi.fi' : 'https://app.benqi.fi';
                          else if (lc.includes('lido')) url = 'https://stake.lido.fi';
                          else if (lc.includes('binance') || lc.includes('bnb')) url = 'https://www.bnbchain.org/en/staking';
                          else if (lc.includes('rocket')) url = 'https://stake.rocketpool.net';
                          else if (lc.includes('aave')) url = 'https://app.aave.com';
                          else if (lc.includes('raydium')) url = 'https://raydium.io';
                          else if (lc.includes('pancake')) url = 'https://pancakeswap.finance';
                        }
                        
                        router.push({ pathname: '/browser', params: { url } });
                      }}
                    />
                  )})}
                </GlassCard>`;

if(walletCode.match(regexPositionsRender)) {
  walletCode = walletCode.replace(regexPositionsRender, newRender);
} else {
  // If the regex didn't match, we need to do a broader replace or we missed it because Claude pushed something else.
  // The error shows: `const sum = positions.reduce((s, p) => s + p.fiat, 0);`
  // We need to fix the sum as well.
  walletCode = walletCode.replace(
      /const sum = positions\.reduce\(\(s, p\) => s \+ p\.fiat, 0\);/g,
      "const sum = positions.reduce((s, p: any) => s + (tab === 'defi' ? p.valueUsd : p.fiat), 0);"
  );

  // We'll just replace `p.` with `(p as any).` everywhere in that map block.
  walletCode = walletCode.replace(/p\.fiat/g, '(p as any).fiat');
  walletCode = walletCode.replace(/p\.contract/g, '(p as any).contract');
  walletCode = walletCode.replace(/p\.logo/g, '(p as any).logo');
  walletCode = walletCode.replace(/p\.symbol/g, '(p as any).symbol');
  walletCode = walletCode.replace(/p\.defi/g, '(p as any).defi');
  walletCode = walletCode.replace(/p\.raw/g, '(p as any).raw');
  walletCode = walletCode.replace(/p\.decimals/g, '(p as any).decimals');
  walletCode = walletCode.replace(/p\.hasPrice/g, '(p as any).hasPrice');
  walletCode = walletCode.replace(/p\.name/g, '(p as any).name');
}

fs.writeFileSync('app/wallet.tsx', walletCode);
