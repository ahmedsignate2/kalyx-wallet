const fs = require('fs');
let code = fs.readFileSync('app/wallet.tsx', 'utf8');

// 1. Import yieldService
if (!code.includes('fetchYieldOpportunities')) {
  code = code.replace(
    /import \{ getAdapter, ALL_CHAINS \} from '\.\.\/src';/,
    "import { getAdapter, ALL_CHAINS } from '../src';\nimport { fetchYieldOpportunities } from '../lib/yieldService';"
  );
}

// 2. Add state for opportunities
code = code.replace(
  /const \[refreshing, setRefreshing\] = useState\(false\);/,
  "const [refreshing, setRefreshing] = useState(false);\n  const [opps, setOpps] = useState<any[]>([]);\n  useEffect(() => { fetchYieldOpportunities().then(setOpps); }, []);"
);

// 3. Rewrite stakingPositions and defiPositions to use opps
const regexStakingPositions = /const stakingPositions = useMemo\(\(\) => tokens\.filter\(\(tk\) => tk\.defi\?\.kind === 'staking'\), \[tokens\]\);/g;
const replacementStakingPositions = `const stakingPositions = useMemo(() => {
    return tokens.filter((tk) => {
      if (tk.defi?.kind === 'staking') return true;
      const o = opps.find(op => op.yieldTokenAddress === tk.contract || op.yieldTokenAddress === (tk as any).mint);
      return o !== undefined;
    });
  }, [tokens, opps]);`;
code = code.replace(regexStakingPositions, replacementStakingPositions);

fs.writeFileSync('app/wallet.tsx', code);
