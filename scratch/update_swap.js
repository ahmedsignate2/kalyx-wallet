const fs = require('fs');

const path = '/root/crypto-wallet-dev/app/swap.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  `import {
  getAdapter,
  getErc20Tokens,
  getSwapQuote,
  parseAmount,
  formatBalance,
  formatAmount,
  isWalletError,
  NATIVE_TOKEN,
  NOVA_FEE,
  type SwapQuote,
} from '../src';`,
  `import {
  getAdapter,
  getErc20Tokens,
  getSwapQuote,
  parseAmount,
  formatBalance,
  formatAmount,
  isWalletError,
  NATIVE_TOKEN,
  NOVA_FEE,
  listChains,
  type SwapQuote,
} from '../src';
import { useTokenStore, type Tok } from '../lib/tokenStore';`
);

content = content.replace(
  /interface Tok \{\s*symbol: string;\s*address: string;\s*decimals: number;\s*logo\?: string; \/\/ logo direct \(tokens détenus via Alchemy\) ; sinon dérivé de TrustWallet\s*\}/g,
  ''
);

const tokensMatch = content.match(/const TOKENS: Record<string, Tok\[\]> = \{[\s\S]*?\n\};\n/);
if (tokensMatch) {
  content = content.replace(tokensMatch[0], '');
} else {
  console.log("Could not find TOKENS object");
}

const twMatch = content.match(/const TW_CHAIN: Record[\s\S]*?const TW = 'https:\/\/raw.githubusercontent.com\/trustwallet\/assets\/master\/blockchains';\n/);
if (twMatch) {
  content = content.replace(twMatch[0], '');
} else {
  console.log("Could not find TW_CHAIN");
}

content = content.replace(
  /function logoFor\(novaChain: string, tok: Tok\): string \{[\s\S]*?return \`\$\{TW\}\/\$\{TW_CHAIN\[novaChain\]\}\/assets\/\$\{tok\.address\}\/logo\.png\`;\n\}/,
  `function logoFor(novaChain: string, tok: Tok): string {
  if (tok.logo) return tok.logo;
  return 'https://via.placeholder.com/18'; // Fallback
}`
);

// Swap Component
content = content.replace(
  /  const activeChain = useWallet\(\(s\) => s\.activeChain\);[\s\S]*?const chain = getAdapter\(activeChain\)\.config;\n/,
  `  const activeChain = useWallet((s) => s.activeChain);
  const account = useWallet((s) => s.account);
  const balance = useWallet((s: any) => s.balance);
  const executeSwap = useWallet((s) => s.executeSwap);
  const chain = getAdapter(activeChain).config;

  const fetchTokens = useTokenStore(s => s.fetchTokens);
  const tokensByChain = useTokenStore(s => s.tokensByChain);
  const loadingTokens = useTokenStore(s => s.loading);

  useEffect(() => {
    fetchTokens(activeChain);
  }, [activeChain, fetchTokens]);`
);

content = content.replace(
  /  const tokens = TOKENS\[activeChain\] \?\? \[\];\n  const available = !chain\.testnet && tokens\.length > 0 && \(chain\.family === 'evm' \|\| chain\.family === 'solana'\);\n/,
  `  const tokens = tokensByChain[activeChain] ?? [];
  const available = !chain.testnet && (chain.family === 'evm' || chain.family === 'solana');\n`
);

content = content.replace(
  /  const curated = TOKENS\[activeChain\] \?\? \[\];/,
  `  const curated = tokensByChain[activeChain] ?? [];`
);

content = content.replace(
  /  const toTokens = TOKENS\[toChain\] \?\? \[\];/,
  `  const toTokens = tokensByChain[toChain] ?? [];`
);

content = content.replace(
  /  const bridgeChains = Object\.keys\(TOKENS\);/,
  `  const bridgeChains = listChains({ includeTestnets: false })
    .filter(c => c.family === 'evm' || c.family === 'solana')
    .map(c => c.id);

  useEffect(() => {
    if (toChain !== activeChain) {
      fetchTokens(toChain);
    }
  }, [toChain, activeChain, fetchTokens]);`
);

content = content.replace(
  /      \{\/\* De \*\/\}\n      <GlassCard glow>([\s\S]*?)<View style=\{\{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing\(1\), marginTop: spacing\(1\) \}\}>\n          \{fromTokens\.map\(\(tk, i\) => \(\n            <TokenPill key=\{\`\$\{tk\.address\}-\$\{tk\.symbol\}\`\} chainId=\{activeChain\} tok=\{tk\} selected=\{i === from\} onPress=\{\(\) => \{ setFrom\(i\); reset\(\); \}\} \/>\n          \)\)\}\n        <\/View>\n      <\/GlassCard>/,
  `      {/* De */}
      <GlassCard glow>
$1<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
          {loadingTokens[activeChain] && tokens.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Chargement des tokens...</Text>
          ) : (
            fromTokens.map((tk, i) => (
              <TokenPill key={\`\${tk.address}-\${tk.symbol}\`} chainId={activeChain} tok={tk} selected={i === from} onPress={() => { setFrom(i); reset(); }} />
            ))
          )}
        </View>
      </GlassCard>`
);


content = content.replace(
  /        <View style=\{\{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing\(1\), marginTop: spacing\(0\.5\) \}\}>\n          \{toTokens\.map\(\(tk, i\) => \(\n            <TokenPill key=\{tk\.symbol\} chainId=\{toChain\} tok=\{tk\} selected=\{i === to\} onPress=\{\(\) => \{ setTo\(i\); reset\(\); \}\} \/>\n          \)\)\}\n        <\/View>/,
  `        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(0.5) }}>
          {loadingTokens[toChain] && toTokens.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Chargement des tokens...</Text>
          ) : (
            toTokens.map((tk, i) => (
              <TokenPill key={tk.symbol} chainId={toChain} tok={tk} selected={i === to} onPress={() => { setTo(i); reset(); }} />
            ))
          )}
        </View>`
);


fs.writeFileSync(path, content, 'utf8');
console.log("Done");
