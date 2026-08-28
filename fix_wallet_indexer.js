const fs = require('fs');
let code = fs.readFileSync('app/wallet.tsx', 'utf8');

if (!code.includes('import { fetchDeFiPortfolio, DeFiPosition }')) {
  code = code.replace(
    /import \{ fetchYieldOpportunities \} from '\.\.\/lib\/yieldService';/,
    "import { fetchYieldOpportunities } from '../lib/yieldService';\nimport { fetchDeFiPortfolio, DeFiPosition } from '../lib/defiIndexer';"
  );
}

// Add state for indexedDeFi
code = code.replace(
  /const \[opps, setOpps\] = useState<any\[\]>\(\[\]\);/,
  "const [opps, setOpps] = useState<any[]>([]);\n  const [indexedDeFi, setIndexedDeFi] = useState<DeFiPosition[]>([]);"
);

// Call fetchDeFiPortfolio in useEffect
code = code.replace(
  /useEffect\(\(\) => \{ fetchYieldOpportunities\(\)\.then\(setOpps\); \}, \[\]\);/,
  "useEffect(() => { fetchYieldOpportunities().then(setOpps); }, []);\n  useEffect(() => { if (account && activeChain) { fetchDeFiPortfolio(account.address, activeChain, tokens).then(setIndexedDeFi); } }, [account, activeChain, tokens]);"
);

// Replace defiPositions useMemo completely
const defiRegex = /const defiPositions = useMemo\(\(\) => \{[\s\S]*?\}, \[tokens, opps\]\);/g;
code = code.replace(defiRegex, `const defiPositions = indexedDeFi;`); // Just map it directly to the indexed array!

// Update the rendering for DeFi positions
const renderRegex = /\{positions\.map\(\(p, i\) => \([\s\S]*?\}\)\}\s*<\/GlassCard>/g;
const renderReplacement = `{positions.map((p: any, i) => {
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
                        let url = isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com'; // fallback
                        
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
                        
                        // Force refresh of params by replacing if possible, or just push
                        router.push({ pathname: '/browser', params: { url } });
                      }}
                    />
                  )})}
                </GlassCard>`;

code = code.replace(renderRegex, renderReplacement);
fs.writeFileSync('app/wallet.tsx', code);
