const fs = require('fs');

let content = fs.readFileSync('src/domain/chains/EvmChainAdapter.ts', 'utf8');

// Add imports
content = content.replace(
  "import { ETHERSCAN_V2_API, EXPLORER_API_KEY } from './configs';",
  "import { ETHERSCAN_V2_API, EXPLORER_API_KEY, COVALENT_API_KEY } from './configs';\nimport { parseCovalentTxList } from './covalent';"
);

// Add Covalent logic
const covalentLogic = `
    // 1.5. Covalent Fallback
    if (COVALENT_API_KEY) {
      try {
        const url = \`https://api.covalenthq.com/v1/\${this.config.evmChainId}/address/\${owner}/transactions_v3/page/0/?no-logs=true\`;
        const res = await withTimeout(
          fetch(url, { headers: { Authorization: \`Bearer \${COVALENT_API_KEY}\` } }),
          RPC_TIMEOUT_MS,
          () => new Error('timeout')
        );
        const json = await res.json();
        if (json && json.data && Array.isArray(json.data.items)) {
          return parseCovalentTxList(json, owner);
        }
      } catch {
        // Ignorer et essayer le suivant
      }
    }
`;

content = content.replace(
  "// 2. Déduire les APIs de fallback",
  covalentLogic + "\n    // 2. Déduire les APIs de fallback"
);

fs.writeFileSync('src/domain/chains/EvmChainAdapter.ts', content);
