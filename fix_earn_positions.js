const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regexLoadBalances = /\/\/ -- Fetch Liquid Staking Tokens --[\s\S]*?catch \(e\) \{\s*console\.warn\('\[DEBUG EARN\] Failed to fetch staked tokens', e\);\s*\}/m;
const replacementLoadBalances = `// -- The dynamic positions are now loaded in a separate effect dependent on opportunities --`;

code = code.replace(regexLoadBalances, replacementLoadBalances);

const regexUseEffect = /useEffect\(\(\) => \{\n    fetchYieldOpportunities\(\)\.then\(setOpportunities\);\n  \}, \[\]\);/m;
const replacementUseEffect = `useEffect(() => {
    fetchYieldOpportunities().then(setOpportunities);
  }, []);

  useEffect(() => {
    const loadDynamicPositions = async () => {
      if (!account || opportunities.length === 0) return;
      try {
        const newStaked: Record<string, bigint> = {};
        const posList: any[] = [];
        
        // Optimize fetching SPL tokens once if needed
        let splTokens: any[] = [];
        let solanaFetched = false;

        for (const opp of opportunities) {
          let bal = 0n;
          let decimals = (opp.underlyingAsset === 'SOL' ? 9 : (opp.underlyingAsset === 'USDC' || opp.underlyingAsset === 'USDC_SOL' ? 6 : 18));
          let symbol = opp.project + opp.underlyingAsset;
          
          if (opp.yieldTokenAddress && opp.yieldTokenAddress.length > 42) {
            // Solana SPL Token
            if (!solanaFetched && account.solAddress) {
               const solAdapter = getAdapter('solana') as any;
               splTokens = await solAdapter.getSplTokens(account.solAddress).catch(() => []);
               solanaFetched = true;
            }
            const t = splTokens.find((t: any) => t.mint === opp.yieldTokenAddress);
            if (t) {
              bal = t.raw;
              decimals = t.decimals || 9;
              symbol = t.symbol || opp.project;
            }
          } else if (opp.yieldTokenAddress) {
            // EVM ERC20 Token
            const isEvm = opp.underlyingAsset !== 'SOL' && opp.underlyingAsset !== 'USDC_SOL';
            const chainId = opp.underlyingAsset === 'AVAX' ? 'avalanche' : opp.underlyingAsset === 'BNB' ? 'bnb' : !isEvm ? 'solana' : 'ethereum';
            const adapter = getAdapter(chainId) as any;
            bal = await adapter.getTokenBalance(opp.yieldTokenAddress, account.evmAddress).catch(()=>0n);
          }
          
          if (bal > 0n) {
             newStaked[opp.id] = bal;
             posList.push({
                id: opp.id,
                name: opp.project + ' Staking',
                symbol: symbol,
                protocol: opp.project,
                balance: bal,
                decimals: decimals,
                underlyingAsset: opp.underlyingAsset
             });
          }
        }
        
        setStaked(newStaked);
        setUserStakedPositions(posList);
      } catch (e) {
        console.warn('[DEBUG EARN] Failed to load dynamic positions', e);
      }
    };
    loadDynamicPositions();
  }, [account, opportunities]);`;

code = code.replace(regexUseEffect, replacementUseEffect);

fs.writeFileSync('app/earn.tsx', code);
