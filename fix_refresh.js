const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Add refreshKey state
code = code.replace(
  /const \[inputModalVisible, setInputModalVisible\] = useState\(false\);/,
  "const [refreshKey, setRefreshKey] = useState(0);\n  const [inputModalVisible, setInputModalVisible] = useState(false);"
);

// 2. Add refreshKey to loadBalances useEffect
code = code.replace(
  /useEffect\(\(\) => \{ loadBalances\(\); \}, \[account, activeChain\]\);/,
  "useEffect(() => { loadBalances(); }, [account, activeChain, refreshKey]);"
);

// 3. Add refreshKey to loadOpps useEffect
code = code.replace(
  /useEffect\(\(\) => \{\n    fetchYieldOpportunities\(\)\.then\(setOpportunities\);\n  \}, \[\]\);/,
  "useEffect(() => {\n    fetchYieldOpportunities().then(setOpportunities);\n  }, [refreshKey]);"
);

// 4. Add refreshKey to loadDynamicPositions useEffect
code = code.replace(
  /\}, \[account, opportunities\]\);/,
  "}, [account, opportunities, refreshKey]);"
);

// 5. Trigger refreshKey in SuccessModal onClose
code = code.replace(
  /onClose=\{.*?setSuccessVisible\(false\).*?\}/,
  "onClose={() => { setSuccessVisible(false); setRefreshKey(k => k + 1); }}"
);

fs.writeFileSync('app/earn.tsx', code);
